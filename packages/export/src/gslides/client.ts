// The narrow Slides client the exporter drives (SPEC 8.3): create, get, batchUpdate and
// getThumbnail, plus a byte fetch for thumbnail URLs. It is a structural type so the live path can
// wrap googleapis (auth.ts) and the tests can pass a fake; the exporter never imports googleapis
// itself, which keeps dry runs and the CLI loadable on a machine without the package or any
// credentials. Also here: the live run over a plan, with writeControl.requiredRevisionId chained
// from one batchUpdate to the next and the notes as the second call.
import type { PresentationPlan } from './requests.ts';
import { notesRequests, notesTargets, NOTES_FIELDS } from './notes.ts';
import type { RatePacer } from './pace.ts';
import type { SlidesRequest } from './schema.ts';
import { SLIDES_PAGE_EMU } from './units.ts';

export type Dimension = { magnitude?: number | null; unit?: string | null };

export type PresentationData = {
  presentationId?: string | null;
  revisionId?: string | null;
  title?: string | null;
  pageSize?: { width?: Dimension | null; height?: Dimension | null } | null;
  slides?:
    | {
        objectId?: string | null;
        slideProperties?: {
          notesPage?: {
            notesProperties?: { speakerNotesObjectId?: string | null } | null;
          } | null;
        } | null;
      }[]
    | null;
};

export type BatchUpdateData = {
  presentationId?: string | null;
  writeControl?: { requiredRevisionId?: string | null } | null;
  replies?: unknown[] | null;
};

export type ThumbnailData = {
  contentUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

export type WriteControl = { requiredRevisionId: string };

export type SlidesClient = {
  create: (title: string) => Promise<PresentationData>;
  get: (presentationId: string, fields?: string) => Promise<PresentationData>;
  batchUpdate: (
    presentationId: string,
    requests: readonly SlidesRequest[],
    writeControl?: WriteControl,
  ) => Promise<BatchUpdateData>;
  getThumbnail: (presentationId: string, pageObjectId: string) => Promise<ThumbnailData>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
};

export function presentationUrl(presentationId: string): string {
  return `https://docs.google.com/presentation/d/${presentationId}/edit`;
}

// ---------------------------------------------------------------------------------------------
// Batching

export type Batch = { index: number; requests: SlidesRequest[]; slideIds: string[]; bytes: number };

/**
 * Slides' requests packed into as few batches as the caps allow, never splitting one slide. A slide
 * over the byte cap on its own is a batch of its own and is reported.
 */
export function planBatches(
  plan: PresentationPlan,
  caps: { maxBytes: number; maxRequests: number },
): { batches: Batch[]; oversized: string[] } {
  const batches: Batch[] = [];
  const oversized: string[] = [];
  let current: Batch | null = null;
  for (const slide of plan.slides) {
    if (slide.bytes > caps.maxBytes || slide.requests.length > caps.maxRequests)
      oversized.push(slide.slideId);
    const fits =
      current !== null &&
      current.bytes + slide.bytes <= caps.maxBytes &&
      current.requests.length + slide.requests.length <= caps.maxRequests;
    if (!fits) {
      current = { index: batches.length, requests: [], slideIds: [], bytes: 0 };
      batches.push(current);
    }
    (current as Batch).requests.push(...slide.requests);
    (current as Batch).slideIds.push(slide.slideId);
    (current as Batch).bytes += slide.bytes;
  }
  return { batches, oversized };
}

// ---------------------------------------------------------------------------------------------
// The live run

export type LiveRunOptions = {
  client: SlidesClient;
  pacer: RatePacer;
  title: string;
  plan: PresentationPlan;
  batches: Batch[];
  log?: (line: string) => void;
};

export type LiveRunResult = {
  presentationId: string;
  url: string;
  revisionId: string | null;
  /** The page size read back after create, in EMU; null when the API omitted it. */
  pageSizeEmu: [number, number] | null;
  pageSizeOk: boolean;
  batchesSent: number;
  notesSent: number;
  notesUnresolved: string[];
  warnings: string[];
};

function emuOf(dimension: Dimension | null | undefined): number | null {
  if (!dimension || typeof dimension.magnitude !== 'number') return null;
  if (dimension.unit === 'PT') return Math.round(dimension.magnitude * 12_700);
  return Math.round(dimension.magnitude);
}

/** create, every batch with the chained revision id, then the notes as a second pass. */
export async function runLive(options: LiveRunOptions): Promise<LiveRunResult> {
  const log = options.log ?? (() => {});
  const warnings: string[] = [];
  const created = await options.pacer.run('write', 'presentations.create', () =>
    options.client.create(options.title),
  );
  const presentationId = created.presentationId ?? '';
  if (!presentationId) throw new Error('gslides: presentations.create returned no presentationId');
  let revisionId = created.revisionId ?? null;
  const width = emuOf(created.pageSize?.width);
  const height = emuOf(created.pageSize?.height);
  const pageSizeEmu: [number, number] | null =
    width !== null && height !== null ? [width, height] : null;
  const pageSizeOk =
    pageSizeEmu === null ||
    (pageSizeEmu[0] === SLIDES_PAGE_EMU.width && pageSizeEmu[1] === SLIDES_PAGE_EMU.height);
  if (!pageSizeOk)
    warnings.push(
      `the presentation's page is ${pageSizeEmu.join(' by ')} EMU, not the ${SLIDES_PAGE_EMU.width} by ${SLIDES_PAGE_EMU.height} the requests were built for`,
    );
  log(`gslides: created ${presentationId} (${presentationUrl(presentationId)})`);
  // A new presentation carries one default slide; it is removed with the notes call once ours
  // exist, so the deck starts at slide 1.
  const defaultSlideId = created.slides?.[0]?.objectId ?? null;
  let batchesSent = 0;
  for (const batch of options.batches) {
    const writeControl = revisionId ? { requiredRevisionId: revisionId } : undefined;
    const response = await options.pacer.run(
      'write',
      `batchUpdate ${batch.index + 1}/${options.batches.length}`,
      () => options.client.batchUpdate(presentationId, batch.requests, writeControl),
    );
    batchesSent += 1;
    revisionId = response.writeControl?.requiredRevisionId ?? revisionId;
    log(
      `gslides: batch ${batch.index + 1}/${options.batches.length}: ${batch.requests.length} request(s), ${batch.slideIds.length} slide(s), ${Math.round(batch.bytes / 1024)} KiB`,
    );
  }
  const readBack = await options.pacer.run('read', 'presentations.get', () =>
    options.client.get(presentationId, NOTES_FIELDS),
  );
  revisionId = readBack.revisionId ?? revisionId;
  const targets = notesTargets(readBack);
  const notes = notesRequests(options.plan.slides, targets);
  const second: SlidesRequest[] = [...notes.requests];
  const ours = new Set(options.plan.slides.map((s) => s.objectId));
  if (defaultSlideId && !ours.has(defaultSlideId))
    second.push({ deleteObject: { objectId: defaultSlideId } });
  let notesSent = 0;
  if (second.length > 0) {
    const writeControl = revisionId ? { requiredRevisionId: revisionId } : undefined;
    const response = await options.pacer.run('write', 'batchUpdate notes', () =>
      options.client.batchUpdate(presentationId, second, writeControl),
    );
    revisionId = response.writeControl?.requiredRevisionId ?? revisionId;
    notesSent = notes.requests.length;
    log(
      `gslides: second call: ${notesSent} slide(s) with notes${defaultSlideId ? ', default slide removed' : ''}`,
    );
  }
  for (const id of notes.unresolved) warnings.push(`${id}: no speaker notes shape was read back`);
  return {
    presentationId,
    url: presentationUrl(presentationId),
    revisionId,
    pageSizeEmu,
    pageSizeOk,
    batchesSent,
    notesSent,
    notesUnresolved: notes.unresolved,
    warnings,
  };
}
