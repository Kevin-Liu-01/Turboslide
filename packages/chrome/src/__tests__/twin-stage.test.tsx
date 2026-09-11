// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fitSheet } from '@turboslide/viewer/Sheet';
import type { ViewerSlide } from '@turboslide/viewer/model';

import { TWIN_GAP, TWIN_LABEL_H, TwinStage, twinPaneSize } from '../TwinStage';

// The twin view (SPEC 6.8): two .ts-sheet roots, light left and dark right, at half scale, both
// from the same document, with the editor's overlay drawn on both.
const slide: ViewerSlide = {
  id: 'content-rule',
  n: 2,
  title: 'The content rule',
  kind: 'content',
  sectionId: 'all',
  html: '<section class="slide is-on" data-slide="content-rule"><div class="in"><h2 data-block="h">The content rule</h2></div></section>',
};

const picture: ViewerSlide = {
  ...slide,
  id: 'opener',
  kind: 'opener',
  picture: { light: '/decks/x/assets/o-light.png', dark: '/decks/x/assets/o-dark.png' },
};

afterEach(cleanup);

describe('TwinStage', () => {
  it('splits the stage into a light and a dark sheet root, each holding the same slide, and fits each to half the stage', () => {
    const stageSize = { width: 1200, height: 600 };
    const { container } = render(
      <TwinStage
        slide={slide}
        index={1}
        total={85}
        stageSize={stageSize}
        narrow={false}
        dir="next"
      />,
    );
    const roots = container.querySelectorAll<HTMLElement>('.ts-twin-root.ts-sheet');
    expect([...roots].map((root) => root.dataset.theme)).toEqual(['light', 'dark']);
    for (const root of roots) {
      expect(
        root.querySelector('.pt-slide[data-slide-id="content-rule"] [data-block="h"]'),
      ).not.toBeNull();
      expect(root.querySelector('.frame .rule.top')).not.toBeNull();
      expect(root.querySelector('.counter')?.textContent).toBe('02 / 85');
    }
    const pane = twinPaneSize(stageSize);
    expect(pane).toEqual({ width: (1200 - TWIN_GAP) / 2, height: 600 - TWIN_LABEL_H });
    const fit = fitSheet({ aw: pane.width, ah: pane.height, pad: 28 });
    const sheets = container.querySelectorAll<HTMLElement>('.pt-sheet-stage > .sheet');
    expect(sheets).toHaveLength(2);
    expect(sheets[0]?.style.width).toBe(`${fit.width}px`);
    expect(sheets[1]?.style.width).toBe(`${fit.width}px`);
    expect(fit.scale).toBeLessThan(0.5);
    expect([...container.querySelectorAll('.ts-twin-label')].map((el) => el.textContent)).toEqual([
      'Light',
      'Dark',
    ]);
  });

  it('draws the overlay inside both scaled stages and the backdrop for a picture slide', () => {
    const { container } = render(
      <TwinStage
        slide={picture}
        index={0}
        total={1}
        stageSize={{ width: 1000, height: 500 }}
        narrow={false}
        dir="next"
        labels={false}
        overlay={(theme) => <i className="ts-select" data-overlay={theme} />}
      />,
    );
    const overlays = container.querySelectorAll<HTMLElement>('.ts-stage > .ts-select');
    expect([...overlays].map((el) => el.dataset.overlay)).toEqual(['light', 'dark']);
    const roots = container.querySelectorAll<HTMLElement>('.ts-twin-root');
    expect([...roots].every((root) => root.classList.contains('is-picture'))).toBe(true);
    expect(roots[0]?.querySelector('.backdrop img')?.getAttribute('src')).toBe(
      picture.picture?.light,
    );
    expect(roots[1]?.querySelector('.backdrop img')?.getAttribute('src')).toBe(
      picture.picture?.dark,
    );
    expect(container.querySelector('.ts-twin-label')).toBeNull();
    expect(container.querySelector('.ts-twin')?.classList.contains('no-labels')).toBe(true);
  });
});
