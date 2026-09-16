import { describe, expect, it } from 'vitest';

import type { PresentMediaState } from '../presentSync';
import type { DocumentLike, MediaElementLike, RootLike } from '../media-controller';
import {
  MOUNTED_CLASS,
  SPOTLIGHT_LIVE_CLASS,
  SPOTLIGHT_ROOT_SELECTOR,
  createMediaController,
  isMediaTarget,
  readRoot,
  youtubePlayerUrl,
} from '../media-controller';

// The media controller over fake roots and elements (gslides-parity SPEC-5 0.17, 0.21, 3.5; R11
// 5.2 to 5.5): the eight fields read from a poster root, the video mounted in its slide and gone
// with it, the cross slide audio moved to the deck level layer and kept through a slide change,
// Start at and End at through currentTime and the re-armed timer, the range loop, the
// NotAllowedError path playing muted with one report, the click and key rules for manual roots,
// the first click rule for click roots, the state events, and the YouTube URL.

class FakeNode {
  children: unknown[] = [];
  parent: FakeNode | null = null;
  appendChild(child: unknown): unknown {
    const node = child as FakeNode;
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = this;
    this.children.push(child);
    return child;
  }
  remove(): void {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
}

class FakeRoot extends FakeNode implements RootLike {
  attributes: Record<string, string>;
  classes = new Set<string>();
  id = '';
  className = '';
  constructor(attributes: Record<string, string>) {
    super();
    this.attributes = attributes;
  }
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };
  querySelectorAll(): ArrayLike<RootLike> {
    return this.children.filter(
      (child): child is FakeRoot => child instanceof FakeRoot && 'data-media' in child.attributes,
    );
  }
  querySelector(): RootLike | null {
    return null;
  }
  closest(selectors: string): RootLike | null {
    if (selectors.includes('.ts-media') && 'data-media' in this.attributes) return this;
    if (selectors.includes('ts-media-layer') && this.className === 'ts-media-layer') return this;
    return this.parent instanceof FakeRoot ? this.parent.closest(selectors) : null;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

class FakeMedia extends FakeNode implements MediaElementLike {
  src = '';
  currentTime = 0;
  duration = 130;
  paused = true;
  ended = false;
  muted = false;
  volume = 1;
  loop = false;
  preload = '';
  playsInline = false;
  crossOrigin: string | null = null;
  className = '';
  attributes: Record<string, string> = {};
  handlers = new Map<string, Set<(event: unknown) => void>>();
  /** the next play() rejects with NotAllowedError unless the element is muted */
  refuseUnmuted = false;
  plays = 0;
  readonly tag: 'audio' | 'video';
  constructor(tag: 'audio' | 'video') {
    super();
    this.tag = tag;
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(listener);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.handlers.get(type)?.delete(listener);
  }
  fire(type: string): void {
    for (const listener of this.handlers.get(type) ?? []) listener({});
  }
  async play(): Promise<void> {
    if (this.refuseUnmuted && !this.muted) {
      const error = new Error(
        'play() failed because the user didn’t interact with the document first',
      );
      error.name = 'NotAllowedError';
      throw error;
    }
    this.plays += 1;
    this.paused = false;
    this.fire('play');
  }
  pause(): void {
    this.paused = true;
    this.fire('pause');
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

class FakeIframe extends FakeNode {
  src = '';
  title = '';
  className = '';
  attributes: Record<string, string> = {};
  posted: string[] = [];
  contentWindow = { postMessage: (message: string) => this.posted.push(message) };
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

class FakeScript extends FakeNode {
  src = '';
  async = false;
  attributes: Record<string, string> = {};
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  addEventListener(): void {}
}

function fakeDocument(): DocumentLike & { made: unknown[]; head: FakeNode } {
  const made: unknown[] = [];
  const head = new FakeNode();
  return {
    made,
    head,
    createElement(tag) {
      const node =
        tag === 'audio' || tag === 'video'
          ? new FakeMedia(tag)
          : tag === 'iframe'
            ? new FakeIframe()
            : tag === 'script'
              ? new FakeScript()
              : new FakeRoot({});
      made.push(node);
      return node;
    },
  };
}

function root(attributes: Record<string, string>): FakeRoot {
  return new FakeRoot({
    'data-media': 'clip',
    'data-kind': 'video',
    'data-src': 'decks/t/assets/bars-1s.e5f1f192.webm',
    'data-youtube': '',
    'data-title': 'Colour bars',
    'data-duration': '130000',
    'data-start': '0',
    'data-end': '',
    'data-play': 'click',
    'data-loop': '0',
    'data-volume': '100',
    'data-mute': '0',
    'data-stop-on-change': '1',
    'data-hide-icon': '0',
    ...attributes,
  });
}

function slideWith(...roots: FakeRoot[]): FakeRoot {
  const slide = new FakeRoot({});
  for (const each of roots) slide.appendChild(each);
  return slide;
}

/** A manual timer the tests fire by hand. */
function timers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    pending,
    setTimeout: (fn: () => void, ms: number) => {
      const handle = next++;
      pending.set(handle, { fn, ms });
      return handle;
    },
    clearTimeout: (handle: unknown) => pending.delete(handle as number),
    fire: () => {
      for (const [handle, { fn }] of [...pending]) {
        pending.delete(handle);
        fn();
      }
    },
  };
}

describe('readRoot and the URLs', () => {
  it('reads the eight fields and the facts from a poster root, with the defaults for a bare root', () => {
    expect(
      readRoot(
        root({
          'data-play': 'auto',
          'data-start': '12000',
          'data-end': '90000',
          'data-mute': '1',
          'data-volume': '40',
        }),
      ),
    ).toEqual({
      blockId: 'clip',
      kind: 'video',
      src: 'decks/t/assets/bars-1s.e5f1f192.webm',
      youtube: '',
      title: 'Colour bars',
      durationMs: 130_000,
      startMs: 12_000,
      endMs: 90_000,
      play: 'auto',
      loop: false,
      volume: 40,
      mute: true,
      stopOnSlideChange: true,
      hideIcon: false,
    });
    expect(readRoot(new FakeRoot({ 'data-media': 'x' }))).toMatchObject({
      kind: 'video',
      play: 'click',
      volume: 100,
      stopOnSlideChange: true,
      durationMs: null,
      endMs: null,
    });
    expect(readRoot(new FakeRoot({}))).toBeNull();
    const url = new URL(
      youtubePlayerUrl(
        readRoot(
          root({
            'data-youtube': 'M7lc1UVf-VE',
            'data-src': '',
            'data-play': 'auto',
            'data-start': '30000',
          }),
        )!,
        'https://turboslide.vercel.app',
      ),
    );
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/M7lc1UVf-VE');
    expect(url.searchParams.get('enablejsapi')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('https://turboslide.vercel.app');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('start')).toBe('30');
    expect(url.searchParams.get('controls')).toBe('1');
    expect(url.searchParams.has('loop')).toBe(false);
  });
});

describe('createMediaController', () => {
  it('mounts a video in its slide root with the fields applied and unmounts it with the slide', async () => {
    const doc = fakeDocument();
    const states: PresentMediaState[] = [];
    const controller = createMediaController({ document: doc });
    controller.onState((state) => states.push(state));
    const video = root({
      'data-play': 'auto',
      'data-start': '12000',
      'data-mute': '1',
      'data-volume': '40',
    });
    const slide = slideWith(video);
    controller.mount(slide);
    const element = doc.made.find((node) => node instanceof FakeMedia) as FakeMedia;
    expect(element.tag).toBe('video');
    expect(element.parent).toBe(video);
    expect(element.src).toBe('decks/t/assets/bars-1s.e5f1f192.webm');
    expect(element.muted).toBe(true);
    expect(element.volume).toBe(0.4);
    expect(element.currentTime).toBe(12);
    expect(element.crossOrigin).toBe('anonymous');
    expect(element.playsInline).toBe(true);
    expect(video.classes.has(MOUNTED_CLASS)).toBe(true);
    expect(controller.mounted()).toEqual(['clip']);
    await controller.play('clip');
    expect(element.plays).toBe(1);
    expect(states.at(-1)).toMatchObject({
      blockId: 'clip',
      state: 'playing',
      title: 'Colour bars',
      durationMs: 118_000,
    });
    controller.pause('clip');
    expect(element.paused).toBe(true);
    expect(states.at(-1)?.state).toBe('paused');
    element.currentTime = 20;
    await controller.restart('clip');
    expect(element.currentTime).toBe(12);
    expect(states.at(-1)?.state).toBe('playing');
    controller.unmount(slide);
    expect(element.parent).toBeNull();
    expect(video.classes.has(MOUNTED_CLASS)).toBe(false);
    expect(controller.mounted()).toEqual([]);
    expect(states.at(-1)?.state).toBe('paused');
  });

  it('seeks by a delta inside the Start at and End at range and reports the position (the show’s U and O keys)', () => {
    const doc = fakeDocument();
    const states: PresentMediaState[] = [];
    const controller = createMediaController({ document: doc });
    controller.onState((state) => states.push(state));
    const video = root({ 'data-play': 'manual', 'data-start': '12000', 'data-end': '40000' });
    const slide = slideWith(video);
    controller.mount(slide);
    const element = doc.made.find((node) => node instanceof FakeMedia) as FakeMedia;
    expect(element.currentTime).toBe(12);
    controller.seek('clip', 10_000);
    expect(element.currentTime).toBe(22);
    expect(states.at(-1)).toMatchObject({ blockId: 'clip', positionMs: 10_000 });
    controller.seek('clip', -30_000);
    expect(element.currentTime).toBe(12);
    controller.seek('clip', 60_000);
    expect(element.currentTime).toBe(40);
    /* an unmounted id and a root without End at (the file's duration is the ceiling) */
    controller.seek('missing', 10_000);
    controller.unmount(slide);
    const open = root({ 'data-play': 'manual' });
    controller.mount(slideWith(open));
    const second = doc.made.filter((node) => node instanceof FakeMedia).at(-1) as FakeMedia;
    controller.seek('clip', 1_000_000);
    expect(second.currentTime).toBe(second.duration);
  });

  it('keeps an audio with Stop on slide change off in the deck level layer across a slide change', async () => {
    const doc = fakeDocument();
    const show = new FakeRoot({});
    const controller = createMediaController({ document: doc, showRoot: show });
    const tone = root({
      'data-media': 'tone',
      'data-kind': 'audio',
      'data-src': 'decks/t/assets/tone.wav',
      'data-stop-on-change': '0',
      'data-play': 'auto',
    });
    const slide = slideWith(tone);
    controller.mount(slide);
    const layer = show.children.find(
      (child) => child instanceof FakeRoot && child.id === 'ts-media-layer',
    ) as FakeRoot;
    expect(layer).toBeDefined();
    expect(layer.className).toBe('ts-media-layer');
    const element = doc.made.find((node) => node instanceof FakeMedia) as FakeMedia;
    expect(element.tag).toBe('audio');
    expect(element.parent).toBe(layer);
    await controller.play('tone');
    controller.unmount(slide);
    // still there and still playing
    expect(element.parent).toBe(layer);
    expect(element.paused).toBe(false);
    expect(controller.mounted()).toEqual(['tone']);
    // the slide comes back: the element is left alone
    controller.mount(slide);
    expect(doc.made.filter((node) => node instanceof FakeMedia)).toHaveLength(1);
    // a stopping audio in another slide leaves with its slide
    const stopping = root({
      'data-media': 'tone2',
      'data-kind': 'audio',
      'data-src': 'decks/t/assets/tone2.wav',
    });
    const other = slideWith(stopping);
    controller.mount(other);
    expect(doc.made.filter((node) => node instanceof FakeMedia)).toHaveLength(2);
    controller.unmount(other);
    expect(controller.mounted()).toEqual(['tone']);
    controller.destroy();
    expect(element.parent).toBeNull();
    expect(controller.mounted()).toEqual([]);
  });

  it('ends at End at through the re-armed timer and loops the range from Start at when Loop is on', async () => {
    const doc = fakeDocument();
    const clock = timers();
    const states: PresentMediaState[] = [];
    const controller = createMediaController({
      document: doc,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    controller.onState((state) => states.push(state));
    const trimmed = root({ 'data-start': '500', 'data-end': '800' });
    const slide = slideWith(trimmed);
    controller.mount(slide);
    const element = doc.made.find((node) => node instanceof FakeMedia) as FakeMedia;
    expect(element.loop).toBe(false);
    await controller.play('clip');
    expect(clock.pending.size).toBe(1);
    expect([...clock.pending.values()][0]?.ms).toBe(300);
    // a timeupdate re-arms the timer from the current time
    element.currentTime = 0.7;
    element.fire('timeupdate');
    expect(clock.pending.size).toBe(1);
    expect([...clock.pending.values()][0]?.ms).toBe(100);
    element.currentTime = 0.8;
    clock.fire();
    expect(element.paused).toBe(true);
    expect(element.currentTime).toBe(0.5);
    expect(states.at(-1)?.state).toBe('ended');
    controller.unmount(slide);
    // the range loop plays again from Start at
    const looping = root({
      'data-media': 'loop',
      'data-start': '500',
      'data-end': '800',
      'data-loop': '1',
    });
    const slide2 = slideWith(looping);
    controller.mount(slide2);
    const second = doc.made.filter((node) => node instanceof FakeMedia).at(-1) as FakeMedia;
    await controller.play('loop');
    second.currentTime = 0.8;
    clock.fire();
    await Promise.resolve();
    expect(second.currentTime).toBe(0.5);
    expect(second.plays).toBe(2);
    expect(second.paused).toBe(false);
    // a whole file loop takes the attribute
    const whole = root({ 'data-media': 'whole', 'data-loop': '1' });
    controller.mount(slideWith(whole));
    expect((doc.made.filter((node) => node instanceof FakeMedia).at(-1) as FakeMedia).loop).toBe(
      true,
    );
  });

  it('plays muted after a NotAllowedError, reports sound off once, and unmutes on the next click', async () => {
    const doc = fakeDocument();
    let told = 0;
    const controller = createMediaController({ document: doc, onSoundOff: () => (told += 1) });
    const a = root({ 'data-media': 'a', 'data-play': 'auto' });
    const b = root({ 'data-media': 'b', 'data-play': 'auto', 'data-src': 'decks/t/assets/b.webm' });
    const slide = slideWith(a, b);
    controller.mount(slide);
    const elements = doc.made.filter((node) => node instanceof FakeMedia) as FakeMedia[];
    for (const element of elements) element.refuseUnmuted = true;
    await controller.play('a');
    await controller.play('b');
    expect(elements.every((element) => element.muted && !element.paused)).toBe(true);
    expect(told).toBe(1);
    expect(a.attributes['data-sound-off']).toBe('1');
    // the next click anywhere on a media root unmutes; a click elsewhere is not a media click
    expect(controller.handleClick(new FakeRoot({}))).toBe(false);
    controller.unmuteAll();
    expect(elements.every((element) => !element.muted)).toBe(true);
    expect(a.attributes['data-sound-off']).toBe('0');
    expect(controller.stateOf('a')).toMatchObject({
      blockId: 'a',
      state: 'playing',
      durationMs: 130_000,
    });
    expect(controller.stateOf('nothing')).toBeNull();
  });

  it('treats a manual root as a control (click, Enter and Space toggle and never advance) and plays click roots once', async () => {
    const doc = fakeDocument();
    const controller = createMediaController({ document: doc });
    const manual = root({ 'data-media': 'manual', 'data-play': 'manual' });
    const click = root({ 'data-media': 'click', 'data-play': 'click' });
    const auto = root({ 'data-media': 'auto', 'data-play': 'auto' });
    const slide = slideWith(manual, click, auto);
    controller.mount(slide);
    const [manualElement, clickElement, autoElement] = doc.made.filter(
      (node) => node instanceof FakeMedia,
    ) as FakeMedia[];
    expect(controller.handleClick(manual)).toBe(true);
    await Promise.resolve();
    expect(manualElement?.paused).toBe(false);
    expect(controller.handleClick(manual)).toBe(true);
    expect(manualElement?.paused).toBe(true);
    expect(controller.handleKey(' ', manual)).toBe(true);
    await Promise.resolve();
    expect(manualElement?.paused).toBe(false);
    expect(controller.handleKey('ArrowRight', manual)).toBe(false);
    expect(controller.handleKey('Enter', new FakeRoot({}))).toBe(false);
    // a click on an auto root is a media click (the browser's controls) but does not toggle
    expect(controller.handleClick(auto)).toBe(true);
    expect(autoElement?.paused).toBe(true);
    // the first click past the slide's own steps plays every click root once (R11 5.4)
    expect(await controller.playClickMedia(slide)).toBe(true);
    expect(clickElement?.paused).toBe(false);
    expect(await controller.playClickMedia(slide)).toBe(false);
    expect(isMediaTarget(click)).toBe(click);
    expect(isMediaTarget(null)).toBeNull();
  });

  it('mounts a YouTube root as the privacy enhanced iframe and loads the API once through a nonced script', () => {
    const doc = fakeDocument();
    const controller = createMediaController({
      document: doc,
      origin: 'https://turboslide.vercel.app',
      nonce: 'n0nce',
    });
    const yt = root({
      'data-media': 'talk',
      'data-youtube': 'M7lc1UVf-VE',
      'data-src': '',
      'data-title': 'Introducing the API',
      'data-mute': '1',
    });
    const yt2 = root({ 'data-media': 'talk2', 'data-youtube': 'M7lc1UVf-VE', 'data-src': '' });
    controller.mount(slideWith(yt, yt2));
    const frames = doc.made.filter((node) => node instanceof FakeIframe) as FakeIframe[];
    expect(frames).toHaveLength(2);
    expect(frames[0]?.parent).toBe(yt);
    expect(frames[0]?.src.startsWith('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?')).toBe(
      true,
    );
    expect(frames[0]?.src).toContain('mute=1');
    expect(frames[0]?.title).toBe('Introducing the API');
    expect(frames[0]?.attributes['allow']).toBe('autoplay; fullscreen; picture-in-picture');
    const scripts = doc.made.filter((node) => node instanceof FakeScript) as FakeScript[];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe('https://www.youtube.com/iframe_api');
    expect(scripts[0]?.attributes['nonce']).toBe('n0nce');
    expect(scripts[0]?.parent).toBe(doc.head);
    controller.pause('talk');
    expect(frames[0]?.posted).toEqual([
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
    ]);
  });
});

describe('the speaker spotlight mount (SPEC-5 3.7; R11 6)', () => {
  class SpotRoot extends FakeRoot {
    override querySelectorAll(selectors = ''): ArrayLike<RootLike> {
      return this.children.filter(
        (child): child is FakeRoot =>
          child instanceof FakeRoot &&
          (selectors === SPOTLIGHT_ROOT_SELECTOR
            ? 'data-spotlight' in child.attributes
            : 'data-media' in child.attributes),
      );
    }
  }
  class FakeVideo extends FakeNode {
    autoplay = false;
    muted = false;
    playsInline = false;
    className = '';
    srcObject: unknown = undefined;
    attributes: Record<string, string> = {};
    setAttribute(name: string, value: string): void {
      this.attributes[name] = value;
    }
    play(): void {}
  }
  function fakeDocument(): DocumentLike & { videos: FakeVideo[] } {
    const videos: FakeVideo[] = [];
    return {
      videos,
      createElement: (tag: string) => {
        if (tag === 'video') {
          const video = new FakeVideo();
          videos.push(video);
          return video as never;
        }
        return new FakeMedia(tag as 'audio' | 'video') as never;
      },
      getElementById: () => null,
      head: { appendChild: () => undefined } as never,
    } as unknown as DocumentLike & { videos: FakeVideo[] };
  }

  it('asks for the camera once per show, feeds every spotlight root a muted video, and stops the tracks on destroy', async () => {
    const doc = fakeDocument();
    let asked = 0;
    const stopped: string[] = [];
    const stream = {
      getTracks: () => [{ stop: () => stopped.push('a') }, { stop: () => stopped.push('b') }],
    };
    const controller = createMediaController({
      document: doc,
      camera: async () => {
        asked += 1;
        return stream;
      },
    });
    const slideA = new SpotRoot({});
    const spotA = new SpotRoot({ 'data-spotlight': 'me', 'data-shape': 'ellipse' });
    slideA.appendChild(spotA);
    const slideB = new SpotRoot({});
    const spotB = new SpotRoot({ 'data-spotlight': 'me2', 'data-shape': 'rect' });
    slideB.appendChild(spotB);
    controller.mount(slideA);
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toBe(1);
    expect(doc.videos).toHaveLength(1);
    expect(doc.videos[0]?.muted).toBe(true);
    expect(doc.videos[0]?.autoplay).toBe(true);
    expect(doc.videos[0]?.playsInline).toBe(true);
    expect(doc.videos[0]?.srcObject).toBe(stream);
    expect(spotA.children).toContain(doc.videos[0]);
    expect(spotA.classes.has(SPOTLIGHT_LIVE_CLASS)).toBe(true);
    // the next spotlight slide reuses the one stream
    controller.unmount(slideA);
    expect(spotA.children).toHaveLength(0);
    expect(spotA.classes.has(SPOTLIGHT_LIVE_CLASS)).toBe(false);
    controller.mount(slideB);
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toBe(1);
    expect(spotB.classes.has(SPOTLIGHT_LIVE_CLASS)).toBe(true);
    controller.destroy();
    await Promise.resolve();
    expect(stopped).toEqual(['a', 'b']);
    expect(spotB.children).toHaveLength(0);
  });

  it('leaves the placeholder when the camera is refused and never asks again in the show', async () => {
    const doc = fakeDocument();
    let asked = 0;
    const controller = createMediaController({
      document: doc,
      camera: async () => {
        asked += 1;
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      },
    });
    const slide = new SpotRoot({});
    const spot = new SpotRoot({ 'data-spotlight': 'me', 'data-shape': 'rect' });
    slide.appendChild(spot);
    controller.mount(slide);
    await Promise.resolve();
    await Promise.resolve();
    expect(spot.classes.has(SPOTLIGHT_LIVE_CLASS)).toBe(false);
    expect(spot.children).toHaveLength(0);
    controller.unmount(slide);
    controller.mount(slide);
    await Promise.resolve();
    expect(asked).toBe(1);
  });
});
