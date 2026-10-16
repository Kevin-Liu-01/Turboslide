// The glyph engine's renderer (PLAN wave 3.1; the HTML slides design 3.3): one canvas, one program,
// one frame per `draw`. The WebGL2 path is Glyphfield's full-screen quad and uniform upload
// (`src/components/LiveMaterialCanvas.tsx`, OriginalMaterialCanvas); the Canvas 2D path is its glyph
// field (GlyphFieldCanvas), laid out in a 900 px tall reference frame so a stage preview and a
// 3200 by 1800 still agree, and drawn in Inter. Both copied from Kevin Liu's Glyphfield (MIT,
// THIRD_PARTY_NOTICES.md). A frame is a pure function of its values and its time, so any moment
// can be drawn: the pointer is fixed at the centre and the glyph field's hash is Glyphfield's
// fixed sine hash.
//
// `createGlyphRenderer` references nothing outside its own body, so the hosted capture sends its
// source text to the capture page (materials capture.ts) and both captures run the same code.

/** What a renderer draws with: a WebGL2 program, or the glyph field on Canvas 2D. */
export type GlyphProgramSpec =
  | { kind: 'webgl2'; vertex: string; fragment: string }
  | { kind: 'canvas2d'; glyphs: string; font: string };

/** One colour in the three forms the paths read: sRGB, linear light and OKLab. */
export type GlyphColor = {
  srgb: readonly [number, number, number];
  linear: readonly [number, number, number];
  lab: readonly [number, number, number];
};

/** One frame's inputs: the canvas pixels, the shader time in seconds, the controls and three colours. */
export type GlyphFrame = {
  width: number;
  height: number;
  time: number;
  strength: number;
  detail: number;
  frequency: number;
  amplitude: number;
  density: number;
  brightness: number;
  grain: number;
  rotation: number;
  scale: number;
  colors: readonly [GlyphColor, GlyphColor, GlyphColor];
};

export type GlyphRenderer = {
  draw: (frame: GlyphFrame) => void;
  dispose: () => void;
};

/**
 * A renderer on `canvas`. Throws when the context is missing or the program does not compile, so a
 * mount reports the error and the still stays. `preserveDrawingBuffer` keeps the frame readable
 * after the draw (the capture's `toBlob` and screenshot).
 */
export function createGlyphRenderer(
  canvas: HTMLCanvasElement,
  spec: GlyphProgramSpec,
  preserveDrawingBuffer: boolean,
): GlyphRenderer {
  const sizeTo = (width: number, height: number) => {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  };

  if (spec.kind === 'canvas2d') {
    const context = canvas.getContext('2d', { alpha: false });
    if (context === null) throw new Error('Canvas 2D is unavailable');
    const rgb = (color: readonly [number, number, number], opacity: number) =>
      `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)} / ${Math.max(0, Math.min(1, opacity))})`;
    const blend = (
      from: readonly [number, number, number],
      to: readonly [number, number, number],
      progress: number,
    ): [number, number, number] => {
      const t = Math.max(0, Math.min(1, progress));
      return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ];
    };
    /* the G of Glyphfield's mark: a ring with an opening and a crossbar */
    const inLetter = (x: number, y: number) => {
      const radius = Math.hypot(x, y);
      const ring = radius > 0.45 && radius < 0.88;
      const opening = x > 0.18 && Math.abs(y) < 0.32;
      const crossbar = x > 0.08 && x < 0.82 && y > -0.08 && y < 0.18;
      return (ring && !opening) || crossbar;
    };
    const fontSize = 32;
    const blurs = 'filter' in context;
    return {
      draw: (frame) => {
        sizeTo(frame.width, frame.height);
        /* the reference frame is 900 units tall, the sheet's height */
        const ratio = frame.height / 900;
        const width = frame.width / ratio;
        const height = 900;
        const [ground, figure, accent] = [
          frame.colors[0].srgb,
          frame.colors[1].srgb,
          frame.colors[2].srgb,
        ];
        const time = frame.time;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 1;
        if (blurs) context.filter = 'none';
        const backdrop = context.createRadialGradient(
          width * 0.5,
          height * 0.5,
          0,
          width * 0.5,
          height * 0.5,
          Math.hypot(width, height) * 0.55,
        );
        backdrop.addColorStop(0, rgb(blend(ground, figure, 0.14), 1));
        backdrop.addColorStop(1, rgb(blend(ground, [0, 0, 0], 0.35), 1));
        context.fillStyle = backdrop;
        context.fillRect(0, 0, width, height);
        const detail = Math.min(7, frame.detail);
        const columns = Math.round(34 + detail * 3.2);
        const rows = Math.round(22 + detail * 2.2);
        const fieldScale = Math.min(width, height) * (0.72 + frame.amplitude * 0.025) * frame.scale;
        const turn = Math.sin(time * 0.46) * (0.18 + frame.strength * 0.09);
        const cosTurn = Math.cos(turn);
        const sinTurn = Math.sin(turn);
        const points: {
          color: [number, number, number];
          glyph: string;
          opacity: number;
          size: number;
          x: number;
          y: number;
          z: number;
        }[] = [];
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const x = (column / (columns - 1)) * 2 - 1;
            const y = (row / (rows - 1)) * 2 - 1;
            const seed = (row * 83 + column * 37) % 101;
            const keep = seed / 100 <= Math.min(1, 0.42 + frame.density * 0.68);
            if (!inLetter(x, y) || !keep) continue;
            const wave =
              Math.sin(x * frame.frequency + time * 1.2) *
              Math.cos(y * (frame.frequency * 0.7) - time * 0.82);
            const depth =
              wave * (0.12 + frame.strength * 0.18) +
              Math.sin((x + y) * frame.detail + seed) * 0.035;
            const rotatedX = x * cosTurn + depth * sinTurn;
            const rotatedZ = -x * sinTurn + depth * cosTurn;
            const perspective = 1 / (1.8 - rotatedZ * 0.42);
            const depthProgress = Math.max(0, Math.min(1, 0.5 + rotatedZ * 0.75));
            const base = blend(figure, accent, depthProgress * depthProgress);
            points.push({
              color: blend(ground, base, 0.78 + depthProgress * 0.22),
              glyph: spec.glyphs[(row * 3 + column) % spec.glyphs.length] ?? 'G',
              opacity: Math.min(1, (0.4 + depthProgress * 0.6) * frame.brightness * 1.3),
              size:
                Math.max(5.5, Math.min(14, (fieldScale / columns) * 1.05)) *
                (0.78 + perspective * 0.55),
              x: width * 0.5 + rotatedX * fieldScale * perspective,
              y: height * 0.5 + y * fieldScale * perspective,
              z: rotatedZ,
            });
          }
        }
        points.sort((a, b) => a.z - b.z);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `500 ${fontSize}px ${spec.font}`;
        const glyphAt = (glyph: string, x: number, y: number, size: number) => {
          const scale = (ratio * size) / fontSize;
          context.setTransform(scale, 0, 0, scale, x * ratio, y * ratio);
          context.fillText(glyph, 0, 0);
        };
        for (const point of points) {
          context.fillStyle = rgb(point.color, point.opacity);
          glyphAt(point.glyph, point.x, point.y, point.size);
        }
        /* bloom: a blurred additive copy of the glyphs, where canvas filters exist (not WebKit) */
        if (blurs) {
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.globalCompositeOperation = 'lighter';
          context.globalAlpha = Math.min(0.85, 0.35 + frame.strength * 0.4);
          context.filter = `blur(${Math.round(Math.max(4, (fieldScale / columns) * 0.9) * ratio)}px)`;
          context.drawImage(canvas, 0, 0);
          context.restore();
        }
        const particles = Math.round(28 + frame.grain * 0.72);
        for (let index = 0; index < particles; index += 1) {
          const phase = index * 29.17;
          const px = (((Math.sin(phase * 12.9898) * 43758.5453) % 1) + 1) % 1;
          const py = (((Math.sin(phase * 78.233) * 15731.743) % 1) + 1) % 1;
          const drift = Math.sin(time * 0.3 + phase) * 18;
          context.fillStyle = rgb(
            blend(figure, accent, (index % 5) / 4),
            0.1 + (index % 7) * 0.018,
          );
          glyphAt(
            spec.glyphs[index % spec.glyphs.length] ?? 'G',
            px * width + drift,
            py * height,
            5 + (index % 4),
          );
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
      },
      dispose: () => {
        sizeTo(1, 1);
      },
    };
  }

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer,
  });
  if (gl === null) throw new Error('WebGL2 is unavailable');
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (shader === null) throw new Error('shader allocation failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader)?.trim() ?? 'shader compilation failed';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, spec.vertex);
  const fragment = compile(gl.FRAGMENT_SHADER, spec.fragment);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program)?.trim() ?? 'program link failed';
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(message);
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const at = (name: string) => gl.getUniformLocation(program, name);
  const where = {
    resolution: at('u_resolution'),
    pointer: at('u_pointer'),
    time: at('u_time'),
    colorA: at('u_color_a'),
    colorB: at('u_color_b'),
    colorC: at('u_color_c'),
    labA: at('u_lab_a'),
    labB: at('u_lab_b'),
    labC: at('u_lab_c'),
    strength: at('u_strength'),
    detail: at('u_detail'),
    frequency: at('u_frequency'),
    grain: at('u_grain'),
    amplitude: at('u_amplitude'),
    density: at('u_density'),
    brightness: at('u_brightness'),
    rotation: at('u_rotation'),
    scale: at('u_scale'),
  };
  return {
    draw: (frame) => {
      if (gl.isContextLost()) return;
      sizeTo(frame.width, frame.height);
      gl.viewport(0, 0, frame.width, frame.height);
      gl.uniform2f(where.resolution, frame.width, frame.height);
      gl.uniform2f(where.pointer, 0.5, 0.5);
      gl.uniform1f(where.time, frame.time);
      const [a, b, c] = frame.colors;
      gl.uniform3fv(where.colorA, a.linear);
      gl.uniform3fv(where.colorB, b.linear);
      gl.uniform3fv(where.colorC, c.linear);
      gl.uniform3fv(where.labA, a.lab);
      gl.uniform3fv(where.labB, b.lab);
      gl.uniform3fv(where.labC, c.lab);
      gl.uniform1f(where.strength, frame.strength);
      gl.uniform1f(where.detail, frame.detail);
      gl.uniform1f(where.frequency, frame.frequency);
      gl.uniform1f(where.grain, frame.grain);
      gl.uniform1f(where.amplitude, frame.amplitude);
      gl.uniform1f(where.density, frame.density);
      gl.uniform1f(where.brightness, frame.brightness);
      gl.uniform1f(where.rotation, frame.rotation);
      gl.uniform1f(where.scale, frame.scale);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose: () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
