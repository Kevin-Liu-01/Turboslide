/*
  The standalone motion script (gslides-parity SPEC-5 2.3; R05 9.2; MILESTONES-5 B1 day 6): the
  second script of a built deck whose slides carry motion, ported like runtime.ts (one IIFE, no
  imports, no exports, erasable syntax only; standalone/motion-source.ts strips the types). It
  reads `#ts-motion` (the schedules by slide id, the page, the play order, the autoplay setting)
  and owns the steps, the transitions and the media of the show, over the classes and attributes
  the render package's `motionCss` wrote into `#ts-motion-css` (build-5/b1.md, the show's
  contract): `data-step` on the slide root, `is-hidden`, `is-entering`, `is-leaving`, `is-emph`
  on the blocks `data-block` names (and the `data-para` nodes it stamps), `data-transition` and
  `data-reverse` on the stage during a transition with the outgoing slide kept drawn by
  `.slide.is-leaving`.

  The frozen runtime's one hook: `window.__tsMotion.go(from, to)` at the top of its `show(n)`; it
  answers true when the move was a step of the current slide (the runtime then does nothing) and
  false when the slide changes (the runtime toggles `.is-on`; this script sees the change and
  plays the transition, then the entry step). A build that still ships the placeholder runtime
  has no hook; the script then takes the next and previous keys and the click halves in the
  capture phase and calls the same code, so both runtimes play the same show.

  Media (SPEC-5 0.17; R11 5): the poster roots `.ts-media[data-media]` get an `<audio>` or
  `<video>` (or the YouTube iframe) when their slide shows and lose it when the slide leaves (an
  audio with Stop on slide change off moves to a layer under the stage wrap); the eight fields
  ride on the data attributes; the schedule's Play effects start them; a `click` medium with no
  row plays on the click after the slide's steps; a `manual` root toggles on click; a refused
  autoplay plays muted and the runtime's toast says "Sound is off until you click" once
  (SPEC-5 0.21). Autoplay (`data-autoplay` on the stage): one advance per tick, paused by a click
  or a key, restarting after the last slide under `data-loop`.
*/
(function bootMotion(): void {
  type Effect = {
    animation: {
      id: string;
      blockId: string;
      effect: string;
      trigger: string;
      direction?: string;
    };
    delayMs: number;
    durationMs: number;
    paragraph?: number;
  };
  type Step = { effects: Effect[]; durationMs: number };
  type Schedule = {
    slideId: string;
    steps: Step[];
    hiddenAtStart: string[];
    transition: { kind: string; durationMs: number } | null;
  };
  type Payload = {
    page: { width: number; height: number };
    order: string[];
    schedules: Record<string, Schedule>;
    autoplay?: { intervalMs: number; loop: boolean };
  };

  const source = document.getElementById('ts-motion');
  if (!source) return;
  let payload: Payload;
  try {
    payload = JSON.parse(source.textContent || '{}') as Payload;
  } catch {
    return;
  }
  const schedules = payload.schedules || {};
  const stageEl =
    document.getElementById('stage') || document.querySelector<HTMLElement>('.ts-stage');
  if (!stageEl) return;
  const stage: HTMLElement = stageEl;
  const slides = Array.prototype.slice.call(stage.querySelectorAll('.slide')) as HTMLElement[];
  const ENTRANCE = ['appear', 'fadeIn', 'flyIn', 'zoomIn'];
  const EXIT = ['disappear', 'fadeOut', 'flyOut', 'zoomOut'];
  const HIDDEN = 'is-hidden';
  const ENTERING = 'is-entering';
  const LEAVING = 'is-leaving';
  const EMPH = 'is-emph';
  let reduced = false;
  try {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reduced = false;
  }

  function slideIdOf(el: HTMLElement): string {
    return el.getAttribute('data-slide') || '';
  }
  function scheduleOf(el: HTMLElement | null): Schedule | null {
    return el ? schedules[slideIdOf(el)] || null : null;
  }
  function currentIndex(): number {
    for (let k = 0; k < slides.length; k += 1) if (slides[k]!.classList.contains('is-on')) return k;
    return 0;
  }
  function stepCount(schedule: Schedule | null): number {
    return schedule ? Math.max(0, schedule.steps.length - 1) : 0;
  }
  function classOf(effect: string): string {
    if (ENTRANCE.indexOf(effect) >= 0) return 'entrance';
    if (EXIT.indexOf(effect) >= 0) return 'exit';
    if (effect === 'playMedia') return 'media';
    return 'emphasis';
  }
  function unitKey(blockId: string, paragraph: number | undefined): string {
    return paragraph === undefined ? blockId : `${blockId}/${paragraph}`;
  }
  function attr(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /* the paragraph nodes of a block root (render/motion.ts paragraphNodes): the .para spans, else
     the item nodes of a list, else the root */
  function paragraphNodes(root: HTMLElement): HTMLElement[] {
    const paras = Array.prototype.slice.call(root.querySelectorAll('.para')) as HTMLElement[];
    if (paras.length > 0) return paras;
    if (['plain', 'rows', 'refs'].some((name) => root.classList.contains(name)))
      return (Array.prototype.slice.call(root.children) as HTMLElement[]).filter(
        (child) => !/^(svg|style)$/i.test(child.tagName),
      );
    return [root];
  }

  /* one slide's layer: the nodes, the state per step (motionLayer.ts hiddenAfter and stepPlay) */
  type Layer = {
    root: HTMLElement;
    schedule: Schedule;
    step: number;
    paragraphs: Set<string>;
    paraNodes: Map<string, HTMLElement[]>;
    timer: number | null;
    pending: (() => void) | null;
  };
  let layer: Layer | null = null;
  let transitionTimer: number | null = null;

  function paragraphBlocks(schedule: Schedule): Set<string> {
    const out = new Set<string>();
    schedule.steps.forEach((step) =>
      step.effects.forEach((effect) => {
        if (effect.paragraph !== undefined) out.add(effect.animation.blockId);
      }),
    );
    return out;
  }
  function blockRoot(L: Layer, blockId: string): HTMLElement | null {
    return L.root.querySelector<HTMLElement>(`[data-block="${attr(blockId)}"]`);
  }
  function unitNode(L: Layer, key: string): HTMLElement | null {
    const slash = key.indexOf('/');
    if (slash < 0) return blockRoot(L, key);
    const blockId = key.slice(0, slash);
    const index = Number(key.slice(slash + 1));
    const nodes = L.paraNodes.get(blockId);
    if (nodes) return nodes[index] || null;
    const block = blockRoot(L, blockId);
    return block ? paragraphNodes(block)[index] || null : null;
  }
  function paragraphCount(L: Layer, blockId: string): number {
    const nodes = L.paraNodes.get(blockId);
    if (nodes) return nodes.length;
    const block = blockRoot(L, blockId);
    return block ? paragraphNodes(block).length : 0;
  }
  function scheduledParagraphs(schedule: Schedule, blockId: string): number {
    let count = 0;
    schedule.steps.forEach((step) =>
      step.effects.forEach((effect) => {
        if (effect.animation.blockId === blockId && effect.paragraph !== undefined)
          count = Math.max(count, effect.paragraph + 1);
      }),
    );
    return count;
  }
  function allUnits(L: Layer): Set<string> {
    const units = new Set<string>();
    L.schedule.hiddenAtStart.forEach((blockId) => {
      if (!L.paragraphs.has(blockId)) units.add(blockId);
      else {
        const count = Math.max(
          scheduledParagraphs(L.schedule, blockId),
          paragraphCount(L, blockId),
        );
        for (let p = 0; p < count; p += 1) units.add(unitKey(blockId, p));
      }
    });
    L.schedule.steps.forEach((step) =>
      step.effects.forEach((effect) =>
        units.add(unitKey(effect.animation.blockId, effect.paragraph)),
      ),
    );
    return units;
  }
  function hiddenAfter(L: Layer, step: number): Set<string> {
    const hidden = new Set<string>();
    L.schedule.hiddenAtStart.forEach((blockId) => {
      if (!L.paragraphs.has(blockId)) {
        hidden.add(blockId);
        return;
      }
      const count = Math.max(scheduledParagraphs(L.schedule, blockId), paragraphCount(L, blockId));
      for (let p = 0; p < count; p += 1) hidden.add(unitKey(blockId, p));
    });
    const last = Math.min(step, L.schedule.steps.length - 1);
    for (let k = 0; k <= last; k += 1) {
      (L.schedule.steps[k] ? L.schedule.steps[k]!.effects : []).forEach((effect) => {
        const blockId = effect.animation.blockId;
        const key = unitKey(blockId, effect.paragraph);
        const kind = classOf(effect.animation.effect);
        if (kind === 'entrance') {
          hidden.delete(key);
          if (effect.paragraph === undefined && L.paragraphs.has(blockId))
            Array.from(hidden).forEach((unit) => {
              if (unit.indexOf(`${blockId}/`) === 0) hidden.delete(unit);
            });
        } else if (kind === 'exit') hidden.add(key);
      });
    }
    return hidden;
  }
  function applyHidden(L: Layer, hidden: Set<string>): void {
    allUnits(L).forEach((key) => {
      const node = unitNode(L, key);
      if (!node) return;
      if (hidden.has(key)) node.classList.add(HIDDEN);
      else node.classList.remove(HIDDEN);
    });
  }
  function clearTransient(L: Layer): void {
    allUnits(L).forEach((key) => {
      const node = unitNode(L, key);
      if (node) node.classList.remove(ENTERING, LEAVING, EMPH);
    });
  }
  function settle(L: Layer): void {
    if (L.timer !== null) {
      window.clearTimeout(L.timer);
      L.timer = null;
    }
    if (L.pending) {
      const run = L.pending;
      L.pending = null;
      run();
    }
  }
  function mount(root: HTMLElement, schedule: Schedule): Layer {
    const L: Layer = {
      root,
      schedule,
      step: -1,
      paragraphs: paragraphBlocks(schedule),
      paraNodes: new Map(),
      timer: null,
      pending: null,
    };
    L.paragraphs.forEach((blockId) => {
      const block = blockRoot(L, blockId);
      if (!block) return;
      const nodes = paragraphNodes(block);
      nodes.forEach((node, index) => node.setAttribute('data-para', String(index)));
      L.paraNodes.set(blockId, nodes);
    });
    root.setAttribute('data-step', '0');
    applyHidden(L, hiddenAfter(L, -1));
    mountMedia(root);
    return L;
  }
  function seek(L: Layer, step: number): void {
    settle(L);
    clearTransient(L);
    const at = Math.min(step, L.schedule.steps.length - 1);
    applyHidden(L, hiddenAfter(L, at));
    L.root.setAttribute('data-step', String(Math.max(0, at)));
    L.step = at;
  }
  function play(L: Layer, step: number): number {
    settle(L);
    const at = Math.min(step, L.schedule.steps.length - 1);
    if (at < 0) return 0;
    const before = hiddenAfter(L, at - 1);
    const after = hiddenAfter(L, at);
    const row = L.schedule.steps[at];
    const entering: string[] = [];
    const leaving: string[] = [];
    const emphasis: string[] = [];
    const media: string[] = [];
    (row ? row.effects : []).forEach((effect) => {
      const key = unitKey(effect.animation.blockId, effect.paragraph);
      const kind = classOf(effect.animation.effect);
      if (kind === 'entrance') entering.push(key);
      else if (kind === 'exit') leaving.push(key);
      else if (kind === 'media') media.push(effect.animation.blockId);
      else emphasis.push(key);
    });
    clearTransient(L);
    L.root.setAttribute('data-step', String(at));
    L.step = at;
    allUnits(L).forEach((key) => {
      const node = unitNode(L, key);
      if (!node) return;
      if (entering.indexOf(key) >= 0) {
        node.classList.remove(HIDDEN);
        if (!reduced) node.classList.add(ENTERING);
      } else if (before.has(key)) node.classList.add(HIDDEN);
      else node.classList.remove(HIDDEN);
    });
    if (!reduced) {
      leaving.forEach((key) => {
        const node = unitNode(L, key);
        if (node) node.classList.add(LEAVING);
      });
      emphasis.forEach((key) => {
        const node = unitNode(L, key);
        if (node) node.classList.add(EMPH);
      });
    }
    media.forEach((blockId) => playMedia(blockId));
    const finish = (): void => {
      clearTransient(L);
      applyHidden(L, after);
    };
    const duration = row ? row.durationMs : 0;
    if (reduced || duration <= 0) {
      finish();
      return 0;
    }
    L.pending = finish;
    L.timer = window.setTimeout(() => {
      L.timer = null;
      settle(L);
    }, duration);
    return duration;
  }
  function unmount(L: Layer): void {
    settle(L);
    clearTransient(L);
    allUnits(L).forEach((key) => {
      const node = unitNode(L, key);
      if (node) node.classList.remove(HIDDEN);
    });
    L.paraNodes.forEach((nodes) => nodes.forEach((node) => node.removeAttribute('data-para')));
    L.root.removeAttribute('data-step');
    unmountMedia(L.root);
  }

  /* ---- media (R11 5; the port of present/media-controller.ts's rules) ---- */
  type Mounted = {
    root: HTMLElement;
    slideRoot: HTMLElement;
    element: HTMLMediaElement | null;
    iframe: HTMLIFrameElement | null;
    startMs: number;
    endMs: number | null;
    loop: boolean;
    stopOnChange: boolean;
    play: string;
    inLayer: boolean;
    endTimer: number | null;
  };
  const mountedMedia = new Map<string, Mounted>();
  let soundOffTold = false;
  function say(message: string): void {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-on');
    window.setTimeout(() => toast.classList.remove('is-on'), 1800);
  }
  function mediaLayer(): HTMLElement {
    let el = document.getElementById('ts-media-layer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ts-media-layer';
      el.className = 'ts-media-layer';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      (document.getElementById('ts-stagewrap') || document.body).appendChild(el);
    }
    return el;
  }
  function armEnd(entry: Mounted): void {
    const element = entry.element;
    if (!element || entry.endMs === null) return;
    if (entry.endTimer !== null) window.clearTimeout(entry.endTimer);
    const remaining = entry.endMs / 1000 - element.currentTime;
    if (remaining <= 0.05) {
      onRangeEnd(entry);
      return;
    }
    entry.endTimer = window.setTimeout(
      () => onRangeEnd(entry),
      Math.max(0, Math.round(remaining * 1000)),
    );
  }
  function onRangeEnd(entry: Mounted): void {
    const element = entry.element;
    if (!element) return;
    entry.endTimer = null;
    element.pause();
    element.currentTime = entry.startMs / 1000;
    if (entry.loop) void startPlayback(entry);
  }
  function startPlayback(entry: Mounted): Promise<void> {
    const element = entry.element;
    if (!element) {
      if (entry.iframe && entry.iframe.contentWindow)
        entry.iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
          'https://www.youtube-nocookie.com',
        );
      return Promise.resolve();
    }
    return element.play().then(
      () => armEnd(entry),
      (error: unknown) => {
        const name = error && typeof error === 'object' ? (error as { name?: string }).name : '';
        if (name !== 'NotAllowedError') return;
        element.muted = true;
        entry.root.setAttribute('data-sound-off', '1');
        return element.play().then(
          () => {
            if (!soundOffTold) {
              soundOffTold = true;
              say('Sound is off until you click');
            }
            armEnd(entry);
          },
          () => undefined,
        );
      },
    );
  }
  function mountMedia(slideRoot: HTMLElement): void {
    const roots = Array.prototype.slice.call(
      slideRoot.querySelectorAll('.ts-media[data-media]'),
    ) as HTMLElement[];
    roots.forEach((root) => {
      const blockId = root.getAttribute('data-media') || '';
      const existing = mountedMedia.get(blockId);
      if (existing && existing.inLayer) {
        existing.slideRoot = slideRoot;
        existing.root = root;
        return;
      }
      if (existing) teardown(existing);
      const kind = root.getAttribute('data-kind') === 'audio' ? 'audio' : 'video';
      const src = root.getAttribute('data-src') || '';
      const youtube = root.getAttribute('data-youtube') || '';
      const entry: Mounted = {
        root,
        slideRoot,
        element: null,
        iframe: null,
        startMs: Number(root.getAttribute('data-start') || '0') || 0,
        endMs: root.getAttribute('data-end') ? Number(root.getAttribute('data-end')) : null,
        loop: root.getAttribute('data-loop') === '1',
        stopOnChange: root.getAttribute('data-stop-on-change') !== '0',
        play: root.getAttribute('data-play') || 'click',
        inLayer: false,
        endTimer: null,
      };
      if (youtube !== '') {
        const iframe = document.createElement('iframe');
        iframe.className = 'ts-media-player';
        const params = ['enablejsapi=1', 'playsinline=1', 'rel=0', 'controls=1'];
        if (entry.startMs > 0) params.push(`start=${Math.floor(entry.startMs / 1000)}`);
        if (entry.endMs !== null) params.push(`end=${Math.floor(entry.endMs / 1000)}`);
        if (root.getAttribute('data-mute') === '1') params.push('mute=1');
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtube)}?${params.join('&')}`;
        iframe.title = root.getAttribute('data-title') || 'Video';
        iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        root.appendChild(iframe);
        entry.iframe = iframe;
      } else if (src !== '') {
        const element = document.createElement(kind);
        element.className = `ts-media-element is-${kind}`;
        element.preload = 'metadata';
        if ('playsInline' in element) (element as HTMLVideoElement).playsInline = true;
        element.muted = root.getAttribute('data-mute') === '1';
        element.volume = Math.max(
          0,
          Math.min(1, Number(root.getAttribute('data-volume') || '100') / 100),
        );
        if (entry.loop && entry.endMs === null && entry.startMs === 0) element.loop = true;
        element.src = src;
        element.addEventListener('loadedmetadata', () => {
          if (entry.startMs > 0) element.currentTime = entry.startMs / 1000;
        });
        element.addEventListener('timeupdate', () => armEnd(entry));
        element.addEventListener('ended', () => {
          if (entry.loop) {
            element.currentTime = entry.startMs / 1000;
            void startPlayback(entry);
          }
        });
        root.appendChild(element);
        entry.element = element;
      }
      root.classList.add('is-mounted');
      mountedMedia.set(blockId, entry);
      if (entry.play === 'manual') {
        root.addEventListener('click', (event) => {
          event.stopPropagation();
          toggleMedia(blockId);
        });
      }
    });
  }
  function teardown(entry: Mounted): void {
    if (entry.endTimer !== null) window.clearTimeout(entry.endTimer);
    if (entry.element) {
      entry.element.pause();
      entry.element.remove();
    }
    if (entry.iframe) entry.iframe.remove();
    entry.root.classList.remove('is-mounted');
  }
  function unmountMedia(slideRoot: HTMLElement): void {
    mountedMedia.forEach((entry, blockId) => {
      if (entry.slideRoot !== slideRoot) return;
      // an audio with Stop on slide change off keeps playing in the layer (R11 5.4)
      if (
        !entry.stopOnChange &&
        entry.element &&
        entry.element.tagName === 'AUDIO' &&
        !entry.element.paused
      ) {
        mediaLayer().appendChild(entry.element);
        entry.inLayer = true;
        return;
      }
      teardown(entry);
      mountedMedia.delete(blockId);
    });
  }
  function playMedia(blockId: string): void {
    const entry = mountedMedia.get(blockId);
    if (!entry) return;
    if (entry.element) entry.element.currentTime = entry.startMs / 1000;
    void startPlayback(entry);
  }
  function toggleMedia(blockId: string): void {
    const entry = mountedMedia.get(blockId);
    if (!entry || !entry.element) return;
    if (entry.element.paused) void startPlayback(entry);
    else entry.element.pause();
  }
  /* the click media with no Play row play on the click after the slide's steps (R11 5.4) */
  function playClickMedia(slideRoot: HTMLElement): boolean {
    let played = false;
    const schedule = scheduleOf(slideRoot);
    const rowed = new Set<string>();
    if (schedule)
      schedule.steps.forEach((step) =>
        step.effects.forEach((effect) => {
          if (effect.animation.effect === 'playMedia') rowed.add(effect.animation.blockId);
        }),
      );
    mountedMedia.forEach((entry, blockId) => {
      if (entry.slideRoot !== slideRoot || entry.play !== 'click' || rowed.has(blockId)) return;
      if (entry.element && !entry.element.paused) return;
      if (
        entry.element &&
        entry.element.ended === false &&
        entry.element.currentTime > entry.startMs / 1000 + 0.1
      )
        return;
      playMedia(blockId);
      played = true;
    });
    return played;
  }
  function unmuteAll(): void {
    mountedMedia.forEach((entry) => {
      if (entry.root.getAttribute('data-sound-off') === '1' && entry.element) {
        entry.element.muted = entry.root.getAttribute('data-mute') === '1';
        entry.root.removeAttribute('data-sound-off');
      }
    });
  }

  /* ---- the show ---- */
  let lastIndex = -1;
  let pendingStep: { step: number; reverse: boolean } | null = null;

  /* the runtime changed the slide: play the transition (the outgoing kept drawn), then the entry step */
  function shown(k: number, previous: number): void {
    const root = slides[k];
    if (!root) return;
    if (layer && layer.root !== root) {
      unmount(layer);
      layer = null;
    }
    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
      stage.removeAttribute('data-transition');
      stage.removeAttribute('data-reverse');
      slides.forEach((s) => s.classList.remove(ENTERING, LEAVING));
    }
    const move = pendingStep;
    pendingStep = null;
    const schedule = scheduleOf(root);
    if (!layer) {
      layer = schedule ? mount(root, schedule) : null;
      if (!schedule) mountMedia(root);
    }
    const target = move ? move.step : 0;
    const reverse = move ? move.reverse : previous > k;
    const finish = (): void => {
      if (!layer) return;
      if (reverse) seek(layer, target);
      else if (target <= 0) play(layer, 0);
      else seek(layer, target);
    };
    const outgoing = previous >= 0 && previous !== k ? slides[previous] || null : null;
    const scope = reverse ? scheduleOf(outgoing) : schedule;
    const transition = outgoing && scope ? scope.transition : null;
    if (!outgoing || !transition || transition.kind === 'none' || reduced) {
      if (outgoing && !reduced) unmountMedia(outgoing);
      else if (outgoing) unmountMedia(outgoing);
      finish();
      return;
    }
    unmountMedia(outgoing);
    outgoing.classList.add(LEAVING);
    root.classList.add(ENTERING);
    stage.setAttribute('data-transition', scope!.slideId);
    if (reverse) stage.setAttribute('data-reverse', '');
    else stage.removeAttribute('data-reverse');
    transitionTimer = window.setTimeout(() => {
      transitionTimer = null;
      stage.removeAttribute('data-transition');
      stage.removeAttribute('data-reverse');
      outgoing.classList.remove(LEAVING);
      root.classList.remove(ENTERING);
      finish();
    }, transition.durationMs);
  }

  /* a move of one asked of the show: true when it was a step of the current slide */
  function go(from: number, to: number): boolean {
    const root = slides[from];
    if (!root || Math.abs(to - from) !== 1) return false;
    const schedule = scheduleOf(root);
    const steps = stepCount(schedule);
    const at = layer && layer.root === root ? layer.step : -1;
    if (to > from) {
      if (layer && layer.root === root && at < steps) {
        play(layer, at + 1);
        return true;
      }
      if (at >= steps && playClickMedia(root)) return true;
      pendingStep = { step: 0, reverse: false };
      return false;
    }
    if (layer && layer.root === root && at > 0) {
      seek(layer, at - 1);
      return true;
    }
    const previous = slides[to];
    pendingStep = { step: stepCount(scheduleOf(previous || null)), reverse: true };
    return false;
  }

  /* the runtime's `.is-on` toggles, whichever runtime made them */
  const observer = new MutationObserver(() => {
    const k = currentIndex();
    if (k === lastIndex) return;
    const previous = lastIndex;
    lastIndex = k;
    shown(k, previous);
  });
  slides.forEach((slide) =>
    observer.observe(slide, { attributes: true, attributeFilter: ['class'] }),
  );
  lastIndex = currentIndex();
  shown(lastIndex, -1);

  /* autoplay (SPEC-5 2.3): one advance per tick; a click or a key pauses it */
  const autoplayMs =
    Number(
      stage.getAttribute('data-autoplay') || (payload.autoplay ? payload.autoplay.intervalMs : 0),
    ) || 0;
  const loop =
    stage.hasAttribute('data-loop') || Boolean(payload.autoplay && payload.autoplay.loop);
  let autoTimer: number | null = null;
  function advance(dir: number): boolean {
    const from = currentIndex();
    const to = from + dir;
    if (go(from, to)) return true;
    if (to >= 0 && to < slides.length) {
      show(to);
      return true;
    }
    return false;
  }
  /* a slide change through the runtime when it exposes one, else by toggling the classes ourselves */
  function show(k: number): void {
    const runtime = (window as unknown as { __tsRuntime?: { show?: (n: number) => void } })
      .__tsRuntime;
    if (runtime && runtime.show) {
      runtime.show(k);
      return;
    }
    slides.forEach((s, j) => s.classList.toggle('is-on', j === k));
    try {
      history.replaceState(null, '', `#${k + 1}`);
    } catch {
      /* a sandboxed document */
    }
  }
  function tick(): void {
    const from = currentIndex();
    if (!advance(1)) {
      if (loop) {
        pendingStep = { step: 0, reverse: false };
        show(0);
      } else stopAutoplay();
    }
    if (from === currentIndex() && !layer) stopAutoplay();
  }
  function startAutoplay(): void {
    if (autoplayMs <= 0 || autoTimer !== null) return;
    autoTimer = window.setInterval(tick, autoplayMs);
    stage.setAttribute('data-autoplay-running', '1');
  }
  function stopAutoplay(): void {
    if (autoTimer !== null) window.clearInterval(autoTimer);
    autoTimer = null;
    stage.removeAttribute('data-autoplay-running');
  }
  if (autoplayMs > 0) startAutoplay();

  /* without the runtime's hook the keys and the click halves are taken here first */
  const hooked = { value: false };
  document.addEventListener(
    'keydown',
    (event) => {
      unmuteAll();
      if (autoTimer !== null) stopAutoplay();
      if (hooked.value || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const k = event.key;
      const dir =
        k === 'ArrowRight' ||
        k === ' ' ||
        k === 'PageDown' ||
        (k === 'Enter' && !(target && target.tagName === 'BUTTON'))
          ? 1
          : k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace'
            ? -1
            : 0;
      if (dir === 0) return;
      const from = currentIndex();
      if (go(from, from + dir)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      unmuteAll();
      if (autoTimer !== null) stopAutoplay();
      if (hooked.value) return;
      const target = event.target as HTMLElement | null;
      if (!target || !stage.contains(target)) return;
      if (target.closest('a, button, input, textarea, select, .ts-media')) return;
      const r = stage.getBoundingClientRect();
      const dir = event.clientX > r.left + r.width / 2 ? 1 : -1;
      const from = currentIndex();
      if (go(from, from + dir)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  (window as unknown as { __tsMotion: unknown }).__tsMotion = {
    /** the runtime's hook: true when the move was a step */
    go(from: number, to: number): boolean {
      hooked.value = true;
      return go(from, to);
    },
    advance,
    step(): number {
      return layer ? Math.max(0, layer.step) : 0;
    },
    steps(): number {
      return stepCount(scheduleOf(slides[currentIndex()] || null));
    },
    schedules,
    autoplay: { start: startAutoplay, stop: stopAutoplay, intervalMs: autoplayMs, loop },
  };
})();
