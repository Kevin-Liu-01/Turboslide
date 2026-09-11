// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { MaterialBlock } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { LIQUID_METAL_DIAMOND, WORKED_DECK } from '@turboslide/schema/fixtures';

import { AssetPicker, filterAssets } from '../AssetPicker';
import type { EditorDispatch } from '../dispatch';
import { Inspector } from '../Inspector';
import { AssetIntake } from '../inspector/asset';
import { DitherSection, defaultPlate, draftTreatment } from '../inspector/dither';
import { MaterialSection } from '../inspector/material';

// The M5 editor surfaces (MILESTONES M5 items 1 to 3): the asset picker over the deck's twins,
// the dither tool with its generated treatment controls and its two writes, the Material section
// with its preset, uniform, anchor, two-tone and plate controls and its capture that ends in one
// block.set of the frame, and the intake form that ends in one asset.add. Every control carries
// the label and data-control id the window API matches (SPEC 6.5, 7.4).

afterEach(cleanup);

const block: MaterialBlock = {
  id: 'mat',
  type: 'material',
  materialId: 'paper:liquid-metal',
  preset: 'diamond',
  anchor: 5500,
  twoTone: true,
  plate: 'lower-left',
  alt: 'A liquid metal diamond, dithered',
};

const slide: Slide = {
  schemaVersion: 1,
  id: 'mats',
  kind: 'content',
  layout: { type: 'center' },
  slots: { main: [block] },
};

describe('AssetPicker', () => {
  it('lists the deck assets with data-control ids, filters, and picks on click', () => {
    const onPick = vi.fn();
    render(
      <AssetPicker
        assets={WORKED_DECK.assets}
        value="site-home"
        label="fig: Asset picker"
        control="block.fig.asset.picker"
        onPick={onPick}
      />,
    );
    const list = screen.getByRole('listbox', { name: 'fig: Asset picker list' });
    expect(list.querySelectorAll('[role="option"]').length).toBe(
      Object.keys(WORKED_DECK.assets).length,
    );
    const row = screen.getByRole('option', { name: /liquid-metal-diamond/ });
    expect(row.getAttribute('data-control')).toBe('block.fig.asset.picker.liquid-metal-diamond');
    fireEvent.change(screen.getByLabelText('fig: Asset picker filter'), {
      target: { value: 'earth' },
    });
    expect(list.querySelectorAll('[role="option"]').length).toBe(1);
    fireEvent.click(screen.getByRole('option', { name: /mood-earth/ }));
    expect(onPick).toHaveBeenCalledWith('mood-earth');
    expect(filterAssets(WORKED_DECK.assets, '', 'opener').map((a) => a.id)).toEqual([
      'liquid-metal-diamond',
    ]);
  });
});

describe('DitherSection', () => {
  it('generates the treatment controls, shows the recorded metrics without a source, and writes asset.dither', async () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const asset: Asset = LIQUID_METAL_DIAMOND;
    render(<DitherSection asset={asset} revision={13} dispatch={dispatch} />);
    for (const label of [
      'Black point',
      'White point',
      'Gamma',
      'Blur',
      'Channel',
      'Invert',
      'Min filter',
      'Polarity',
      'Crop',
    ]) {
      expect(screen.getByLabelText(`liquid-metal-diamond: ${label}`), label).toBeTruthy();
    }
    expect(
      screen.getByLabelText('liquid-metal-diamond: Black point').getAttribute('data-control'),
    ).toBe('asset.liquid-metal-diamond.treatment.black');
    expect(screen.getByText('20.7 percent')).toBeTruthy();
    expect(screen.getAllByText('0 cells')).toHaveLength(2);
    expect(screen.getByText(/not in the deck \(sourceFile\)/)).toBeTruthy();
    expect(defaultPlate(asset)).toBe('lower-left');
    expect(draftTreatment(asset)).toBe(asset.treatment);
    fireEvent.click(screen.getByRole('button', { name: /^Recapture/ }));
    expect(dispatch).toHaveBeenCalledWith('asset.dither', {
      assetId: 'liquid-metal-diamond',
      treatment: asset.treatment,
      plate: 'lower-left',
      baseRevision: 13,
    });
    fireEvent.click(screen.getByRole('button', { name: /^Measure/ }));
    expect(dispatch).toHaveBeenLastCalledWith('asset.dither', {
      assetId: 'liquid-metal-diamond',
      fromRecorded: true,
      plate: 'lower-left',
      baseRevision: 13,
    });
    expect(screen.getByRole('button', { name: /^Recapture/ }).getAttribute('data-control')).toBe(
      'asset.liquid-metal-diamond.recapture',
    );
  });
});

describe('MaterialSection', () => {
  it('shows the preset, the uniforms, the anchor, two-tone and plate with labels and ids, and writes block.set', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <MaterialSection
        target={{ kind: 'block', slideId: 'mats', block }}
        revision={7}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByLabelText('mat: Preset').getAttribute('data-control')).toBe(
      'block.mat.preset',
    );
    expect((screen.getByLabelText('mat: Preset') as HTMLSelectElement).value).toBe('diamond');
    const scale = screen.getByLabelText('mat: Scale') as HTMLInputElement;
    expect(scale.getAttribute('data-control')).toBe('block.mat.uniforms.u_scale');
    expect(scale.value).toBe('0.5');
    expect((screen.getByLabelText('mat: Shape') as HTMLSelectElement).value).toBe('diamond');
    expect(screen.getByLabelText('mat: Anchor (ms)').getAttribute('data-control')).toBe(
      'block.mat.anchor',
    );
    expect((screen.getByLabelText('mat: Two-tone') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('mat: Plate') as HTMLSelectElement).value).toBe('lower-left');
    fireEvent.change(screen.getByLabelText('mat: Preset'), { target: { value: 'sphere' } });
    expect(dispatch).toHaveBeenCalledWith('block.set', {
      slideId: 'mats',
      blockId: 'mat',
      path: '/preset',
      value: 'sphere',
      baseRevision: 7,
    });
    fireEvent.change(scale, { target: { value: '0.7' } });
    expect(dispatch).toHaveBeenLastCalledWith('block.set', {
      slideId: 'mats',
      blockId: 'mat',
      path: '/uniforms',
      value: { u_scale: 0.7 },
      baseRevision: 7,
    });
  });

  it('captures the frame and points the block at it once the document moves past the capture revision', async () => {
    const calls: { action: string; input: unknown }[] = [];
    const dispatch: EditorDispatch = async (action, input) => {
      calls.push({ action, input });
      if (action === 'material.capture') return { id: 'mats-mat-5500' };
      return {};
    };
    const view = render(
      <MaterialSection
        target={{ kind: 'block', slideId: 'mats', block }}
        revision={7}
        dispatch={dispatch}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Capture frame/ }));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0]).toMatchObject({
      action: 'material.capture',
      input: {
        materialId: 'paper:liquid-metal',
        preset: 'diamond',
        anchors: [5500],
        id: 'mats-mat-5500',
        twoTone: true,
        plate: 'lower-left',
        role: 'frame',
        baseRevision: 7,
      },
    });
    view.rerender(
      <MaterialSection
        target={{ kind: 'block', slideId: 'mats', block }}
        revision={8}
        dispatch={dispatch}
      />,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[1]).toMatchObject({
      action: 'block.set',
      input: {
        slideId: 'mats',
        blockId: 'mat',
        path: '/asset',
        value: 'mats-mat-5500',
        baseRevision: 8,
      },
    });
  });
});

describe('AssetIntake', () => {
  it('dispatches one asset.add with the license fields', async () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({ id: 'wave', role: 'mood' }));
    render(<AssetIntake revision={3} dispatch={dispatch} defaultRole="mood" plate="lower-right" />);
    fireEvent.change(screen.getByLabelText('asset intake: URL'), {
      target: { value: 'https://commons.wikimedia.org/wiki/File:Wave.jpg' },
    });
    fireEvent.change(screen.getByLabelText('asset intake: Alt text'), {
      target: { value: 'The Great Wave' },
    });
    fireEvent.change(screen.getByLabelText('asset intake: Artist'), {
      target: { value: 'Katsushika Hokusai' },
    });
    fireEvent.change(screen.getByLabelText('asset intake: License'), {
      target: { value: 'public domain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add asset/ }));
    expect(dispatch).toHaveBeenCalledWith('asset.add', {
      url: 'https://commons.wikimedia.org/wiki/File:Wave.jpg',
      role: 'mood',
      alt: 'The Great Wave',
      artist: 'Katsushika Hokusai',
      license: 'public domain',
      twoTone: true,
      plate: 'lower-right',
      baseRevision: 3,
    });
    expect(screen.getByLabelText('asset intake: drop zone').getAttribute('data-control')).toBe(
      'asset.intake.drop',
    );
  });
});

describe('Inspector', () => {
  it('shows the Material section for a selected material block and the intake in the Asset section', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    render(
      <Inspector deck={WORKED_DECK} slide={slide} blockId="mat" revision={5} dispatch={dispatch} />,
    );
    expect(screen.getByRole('button', { name: 'Material · mat' })).toBeTruthy();
    expect(screen.getByLabelText('mat: Preset')).toBeTruthy();
    expect(screen.getByLabelText('asset intake: Alt text')).toBeTruthy();
  });
});
