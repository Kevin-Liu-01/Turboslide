// Stable ids (SPEC 9): slide ids are slugs from the file names (`05-why.html` becomes `why`), block
// ids follow document order (`h`, `p1`, `p2`, `list`, `fig`, `dia1`), and import-ids.json maps
// source file and block path to id so a re-import keeps ids stable and findings, leases and MCP
// addresses survive.
import type { BlockType } from '@turboslide/schema/blocks';

export function slideIdFromFile(fileName: string): string {
  return fileName
    .replace(/^\d+-/, '')
    .replace(/\.html$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The id stem per block type; a second block of the same stem gets a number. */
const STEMS: Record<BlockType, string> = {
  heading: 'h',
  paragraph: 'p',
  credit: 'credit',
  rows: 'rows',
  plain: 'list',
  refs: 'refs',
  say: 'say',
  scales: 'scales',
  spec: 'spec',
  lang: 'lang',
  ladder: 'ladder',
  swatches: 'swatches',
  shot: 'fig',
  pair: 'pair',
  tiles: 'tiles',
  details: 'grid',
  board: 'board',
  composite: 'group',
  panel: 'code',
  dia: 'dia',
  dither: 'dither',
  mark: 'mark',
  markSizes: 'sizes',
  matrix: 'matrix',
  logoPlates: 'logos',
  html: 'html',
};

/** Types whose first id already carries a number (`p1`, `dia1`), the way the spec writes them. */
const NUMBERED_FROM_ONE = new Set<BlockType>(['paragraph', 'dia']);

export type IdMap = Record<string, string>;

/** Assigns block ids within one slide, honoring the sidecar where the source path is known. */
export class BlockIdAllocator {
  private readonly counts = new Map<string, number>();
  private readonly used = new Set<string>();
  private readonly sourceFile: string;
  private readonly previous: IdMap;
  private readonly next: IdMap;

  constructor(sourceFile: string, previous: IdMap, next: IdMap) {
    this.sourceFile = sourceFile;
    this.previous = previous;
    this.next = next;
  }

  allocate(type: BlockType, path: string): string {
    const key = `${this.sourceFile}#${path}`;
    const remembered = this.previous[key];
    if (remembered && !this.used.has(remembered)) {
      this.used.add(remembered);
      this.next[key] = remembered;
      return remembered;
    }
    const stem = STEMS[type];
    const count = (this.counts.get(stem) ?? 0) + 1;
    this.counts.set(stem, count);
    let id = NUMBERED_FROM_ONE.has(type) || count > 1 ? `${stem}${count}` : stem;
    while (this.used.has(id)) {
      id = `${id}x`;
    }
    this.used.add(id);
    this.next[key] = id;
    return id;
  }
}
