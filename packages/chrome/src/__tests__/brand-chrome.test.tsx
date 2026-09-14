// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import { rampInk } from '@turboslide/effects/ramp';
import { cellRuns, markBits, markPath } from '@turboslide/theme/brand';

import { APP_BAR_BRAND, AppBarBrand } from '../AppBarBrand';
import type { LinkComponent, LinkSlotProps } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { EmptyFigure, FIGURE_LABELS } from '../EmptyFigure';
import { DEFAULT_MENU_CONTEXT } from '../menus/model';
import { Progress, RAMP_EDGE_CELLS, rampEdgeMask, shiftOf } from '../Progress';
import { ShellContext } from '../shell-context';
import type { ShellState } from '../shell-context';
import { TitleHomeLink, TitleRow } from '../TitleRow';
import { hideTooltip } from '../Tooltip';
import { TurboslideMark } from '../TurboslideMark';

// The brand components of round four (gslides-parity SPEC-4 1.10; MILESTONES-4 B1 day 1): the
// mark draws the solid path below 64 px and the cells from 64 px from the one geometry module,
// names itself alone and stays quiet beside a word; the tile carries the plate, the frame and the
// inset mark; the app bar lockup and the title row render the router's Link through the slot
// when given and a plain anchor when not, both carrying the Tooltip primitive and their
// data-control; the empty figure is a labelled crop with a title, one sentence and one action;
// the progress fill moves with translateX and masks its leading sixteen cells with the ramp.

afterEach(() => {
  hideTooltip();
  cleanup();
});

/** A stand in for the router's Link: an anchor that records the slot's props. */
const FakeLink: LinkComponent = ({ to, preload, className, children, ...rest }: LinkSlotProps) => (
  <a href={to} className={className} data-slot="link" data-preload={preload} {...rest}>
    {children}
  </a>
);

describe('TurboslideMark', () => {
  it('draws the solid path below 64 px and names itself alone', () => {
    const { container } = render(<TurboslideMark size={24} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Turboslide');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(svg.classList.contains('ts-mark')).toBe(true);
    expect(svg.querySelectorAll('rect')).toHaveLength(0);
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(markPath(2));
  });

  it('stays quiet beside a word', () => {
    const { container } = render(<TurboslideMark size={16} aria-hidden="true" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the cells of markBits on the size’s own grid from 64 px', () => {
    const { container } = render(<TurboslideMark size={64} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(svg.getAttribute('data-cells')).toBe('32');
    expect(svg.querySelectorAll('rect')).toHaveLength(cellRuns(markBits(32)).length);
    const big = render(<TurboslideMark size={512} />).container.querySelector('svg')!;
    expect(big.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(big.querySelectorAll('rect')).toHaveLength(cellRuns(markBits(64)).length);
  });

  it('draws the tile of SPEC-4 0.4 at 16, 32 and 48 and refuses another size', () => {
    const { container } = render(<TurboslideMark size={16} tile />);
    const svg = container.querySelector('svg.ts-tile')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.querySelector('.ts-tile-plate')?.getAttribute('width')).toBe('16');
    const frame = svg.querySelector('.ts-tile-frame')!;
    expect(frame.getAttribute('x')).toBe('0.5');
    expect(frame.getAttribute('width')).toBe('15');
    expect(svg.querySelector('.ts-tile-mark')?.getAttribute('d')).toBe('M2 2h12v12H2z M4 8h6v4H4z');
    expect(() => render(<TurboslideMark size={20} tile />)).toThrow(RangeError);
  });
});

describe('AppBarBrand', () => {
  it('renders plain anchors to /decks and /home with their tooltips when no link is given', () => {
    const { container } = render(<AppBarBrand />);
    const mark = container.querySelector<HTMLAnchorElement>('.ts-brand-lockup-mark')!;
    const word = container.querySelector<HTMLAnchorElement>('.ts-brand-lockup-word')!;
    expect(mark.getAttribute('href')).toBe('/decks');
    expect(mark.getAttribute('aria-label')).toBe('Turboslide');
    expect(mark.getAttribute('data-tip')).toBe(APP_BAR_BRAND.home.name);
    expect(mark.getAttribute('data-control')).toBe('appbar.home');
    expect(mark.querySelector('svg.ts-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(word.getAttribute('href')).toBe('/home');
    expect(word.textContent).toBe('Turboslide');
    expect(word.getAttribute('data-tip')).toBe('About Turboslide');
    expect(word.getAttribute('data-control')).toBe('appbar.about');
    expect(container.querySelectorAll('[data-slot="link"]')).toHaveLength(0);
  });

  it('renders the router’s Link through the slot with intent preloading', () => {
    const { container } = render(
      <AppBarBrand linkComponent={FakeLink} homeTo="/decks/trash" aboutTo="/home" />,
    );
    const links = container.querySelectorAll<HTMLAnchorElement>('[data-slot="link"]');
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('href')).toBe('/decks/trash');
    expect(links[0]?.getAttribute('data-preload')).toBe('intent');
    expect(links[0]?.getAttribute('data-tip')).toBe('Turboslide');
    expect(links[1]?.getAttribute('href')).toBe('/home');
    expect(links[1]?.getAttribute('data-tip')).toBe('About Turboslide');
  });
});

describe('EmptyFigure', () => {
  it('is a labelled crop, a title, one sentence and one action', () => {
    const { container } = render(
      <EmptyFigure
        figure="figure"
        title="No presentations yet"
        sentence="A new presentation is one click."
        action={<button type="button">New Presentation</button>}
      />,
    );
    const fig = container.querySelector('.ts-empty-fig')!;
    expect(fig.getAttribute('role')).toBe('img');
    expect(fig.getAttribute('aria-label')).toBe(FIGURE_LABELS.figure);
    expect(fig.getAttribute('data-figure')).toBe('figure');
    expect(container.querySelector('h2.ts-empty-title')?.textContent).toBe('No presentations yet');
    expect(container.querySelector('.ts-empty-sentence')?.textContent).toBe(
      'A new presentation is one click.',
    );
    expect(container.querySelector('.ts-empty-action button')).not.toBeNull();
    expect(container.querySelector('.ts-empty-mark')).toBeNull();
  });

  it('draws the mark over the notfound twin as the page heading for Not found', () => {
    const { container } = render(
      <EmptyFigure
        figure="notfound"
        heading="h1"
        mark={64}
        title="Not found"
        sentence="No page here."
      />,
    );
    expect(container.querySelector('h1.ts-empty-title')?.textContent).toBe('Not found');
    const mark = container.querySelector('.ts-empty-fig .ts-empty-mark svg.ts-mark')!;
    expect(mark.getAttribute('width')).toBe('64');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.ts-empty-fig')?.getAttribute('aria-label')).toBe(
      FIGURE_LABELS.notfound,
    );
    expect(container.querySelector('.ts-empty-action')).toBeNull();
  });
});

describe('the title row’s mark link', () => {
  it('renders the slot when given and a plain anchor when not, with the same label, tooltip and data-control', () => {
    const plain = render(
      <TitleHomeLink
        to="/decks"
        link={undefined}
        label="Turboslide home"
        doc="Every presentation"
        menuItem="title.appIcon"
      />,
    );
    const anchor = plain.container.querySelector<HTMLAnchorElement>('a.ts-title-home')!;
    expect(anchor.getAttribute('href')).toBe('/decks');
    expect(anchor.getAttribute('data-control')).toBe('title.home');
    expect(anchor.getAttribute('data-menu-item')).toBe('title.appIcon');
    expect(anchor.getAttribute('aria-label')).toBe('Turboslide home');
    expect(anchor.getAttribute('data-tip')).toBe('Turboslide home');
    expect(anchor.getAttribute('data-slot')).toBeNull();
    expect(anchor.querySelector('svg.ts-mark')?.getAttribute('width')).toBe('24');
    expect(anchor.querySelector('svg.ts-mark')?.querySelector('path')?.getAttribute('d')).toBe(
      markPath(2),
    );
    cleanup();
    const routed = render(
      <TitleHomeLink
        to="/decks"
        link={FakeLink}
        label="Turboslide home"
        doc="Every presentation"
        menuItem="title.appIcon"
      />,
    );
    const link = routed.container.querySelector<HTMLAnchorElement>('a.ts-title-home')!;
    expect(link.getAttribute('data-slot')).toBe('link');
    expect(link.getAttribute('data-preload')).toBe('intent');
    expect(link.getAttribute('href')).toBe('/decks');
    expect(link.getAttribute('data-control')).toBe('title.home');
    expect(link.getAttribute('data-tip')).toBe('Turboslide home');
  });

  it('is what TitleRow renders from the shell input’s linkComponent', () => {
    const doc = workedDocument();
    const slideId = Object.keys(doc.slides)[0] ?? '';
    const state = (input: Partial<EditorShellState['input']>): EditorShellState =>
      ({
        input: {
          deckId: doc.deck.id,
          document: doc,
          slideId,
          revision: 1,
          dispatch: () => Promise.resolve({}),
          ...input,
        },
        platform: 'mac',
        menuContext: DEFAULT_MENU_CONTEXT,
        settings: {},
        setSetting: () => undefined,
        runItem: () => undefined,
        runControl: () => undefined,
        panel: null,
        openPanel: () => undefined,
        panelSection: null,
        closePanel: () => undefined,
        wordArtOpen: false,
        setWordArtOpen: () => undefined,
        registerFilmstrip: () => undefined,
        setGuideUnderPointer: () => undefined,
        reopenPanel: () => undefined,
        dialog: null,
        openDialog: () => undefined,
        closeDialog: () => undefined,
        layoutGrid: null,
        openLayoutGrid: () => undefined,
        closeLayoutGrid: () => undefined,
        pickLayout: () => undefined,
        renderDynamicSubmenu: () => null,
        menuOpen: null,
        setMenuOpen: () => undefined,
        compact: false,
        setCompact: () => undefined,
        toolFinderOpen: false,
        setToolFinderOpen: () => undefined,
        paletteOpen: false,
        setPaletteOpen: () => undefined,
        say: () => undefined,
        lastLayout: null,
        focusTitle: () => undefined,
        registerTitleField: () => undefined,
        commentCard: null,
        openCommentCard: () => undefined,
        closeCommentCard: () => undefined,
        stepComment: () => undefined,
        diff: null,
      }) as unknown as EditorShellState;
    const row = (input: Partial<EditorShellState['input']>): ReactNode => (
      <EditorShellContext value={state(input)}>
        <TitleRow compact={false} onShowMenus={() => undefined} />
      </EditorShellContext>
    );
    const plain = render(row({}));
    const home = plain.container.querySelector('[data-control="title.home"]')!;
    expect(home.tagName).toBe('A');
    expect(home.getAttribute('href')).toBe('/decks');
    expect(home.getAttribute('data-slot')).toBeNull();
    expect(home.querySelector('svg.ts-mark')).not.toBeNull();
    cleanup();
    const routed = render(row({ linkComponent: FakeLink }));
    const link = routed.container.querySelector('[data-control="title.home"]')!;
    expect(link.getAttribute('data-slot')).toBe('link');
    expect(link.getAttribute('data-preload')).toBe('intent');
    expect(link.getAttribute('href')).toBe('/decks');
    expect(link.getAttribute('aria-label')).toBe('Turboslide home');
  });
});

describe('Progress with the ramp edge (SPEC-4 1.9)', () => {
  it('moves the fill with translateX from hidden to in place', () => {
    expect(shiftOf(0)).toBe('translateX(-100%)');
    expect(shiftOf(1)).toBe('translateX(-0%)');
    expect(shiftOf(0.25)).toBe('translateX(-75%)');
    expect(shiftOf(1 / 3)).toBe('translateX(-66.67%)');
  });

  it('masks the leading sixteen cells with the deck’s ramp, one cell row', () => {
    expect(RAMP_EDGE_CELLS).toBe(16);
    const mask = rampEdgeMask();
    expect(mask.startsWith('url("data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(mask.slice('url("data:image/svg+xml,'.length, -2));
    expect(svg).toContain('viewBox="0 0 16 1"');
    const lit = Array.from({ length: 16 }, (_, x) => x).filter((x) => rampInk(x, 0, 16));
    expect(svg.match(/<rect /g)).toHaveLength(lit.length);
    for (const x of lit) expect(svg).toContain(`<rect x="${x}" y="0" width="1" height="1"/>`);
    expect(lit[0]).toBe(0);
    expect(lit).not.toContain(15);
  });

  it('writes the mask and the transform on the fill', () => {
    const shell = {
      id: 'deck:test',
      modes: ['slide'],
      keys: 'paged',
      noun: 'slide',
      items: [
        { id: 'a', title: 'a' },
        { id: 'b', title: 'b' },
      ],
      paged: [
        { id: 'a', title: 'a' },
        { id: 'b', title: 'b' },
      ],
      mode: 'slide',
      density: 'thumbs',
      sidebarOpen: true,
      sidebarShown: true,
      panelOpen: false,
      helpOpen: false,
      present: false,
      narrow: false,
      active: 'a',
      index: 0,
      dir: 'next',
      total: 2,
      ready: true,
      setMode: () => undefined,
      setDensity: () => undefined,
      setSidebar: () => undefined,
      setPanel: () => undefined,
      setHelp: () => undefined,
      setPresent: () => undefined,
      select: () => undefined,
      step: () => undefined,
      say: () => undefined,
    } as unknown as ShellState;
    const { container } = render(
      <ShellContext value={shell}>
        <Progress />
      </ShellContext>,
    );
    const fill = container.querySelector<HTMLElement>('.pt-progress i')!;
    expect(fill.style.transform).toBe('translateX(-50%)');
    expect(
      fill.style.maskImage ||
        fill.style.getPropertyValue('mask-image') ||
        fill.style.webkitMaskImage,
    ).toContain('data:image/svg+xml');
  });
});
