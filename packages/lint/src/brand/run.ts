// The brand lint over the tree (docs/NEXT.md 4.1.3 item 25): the files of LINT_ROOTS that git
// tracks or would track (new files of a lane included, ignored files never), the source rules on
// each script, the CSS rules on each stylesheet, the credits check over decks/ and
// apps/studio/public/, then the overrides and, in enforce mode, the acceptances of config.ts.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACCEPTED,
  BRAND_LINT_MODE,
  CREDITS,
  CSS_RULES,
  EXCLUDED_FILES,
  LINT_ROOTS,
  OVERRIDES,
  SOURCE_RULES,
} from './config.ts';
import type { Acceptance, BrandFinding, BrandLintMode, BrandRuleId } from './config.ts';
import { checkCredits } from './credits.ts';
import { lintCss } from './css.ts';
import { lintSource } from './source.ts';

export type BrandLintOptions = {
  /** the tree's root */
  root: string;
  /** the mode; config.ts BRAND_LINT_MODE when absent */
  mode?: BrandLintMode;
  /** only these rules; every rule when absent */
  rules?: ReadonlySet<BrandRuleId>;
  /** only these files (paths from the root) for the source and CSS rules */
  files?: readonly string[];
  /** the acceptances; config.ts ACCEPTED when absent */
  accepted?: readonly Acceptance[];
  /**
   * A commit to read in place of the working tree (`HEAD`, a sha): the files and their text come
   * from git's objects, so a run on a worktree several lanes edit reads what is committed alone.
   */
  ref?: string;
};

export type BrandLintResult = {
  mode: BrandLintMode;
  /** how many files each part read */
  read: { scripts: number; stylesheets: number; pictures: number };
  /** every finding after the overrides */
  findings: BrandFinding[];
  /** the findings an acceptance names (enforce mode) */
  accepted: BrandFinding[];
  /** the findings no acceptance names */
  open: BrandFinding[];
  /** the acceptances that match no finding */
  stale: Acceptance[];
  /** files that did not parse: an infrastructure failure in either mode */
  broken: BrandFinding[];
  /** true when the run fails: a broken file, or in enforce mode an open finding or a stale acceptance */
  failed: boolean;
};

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;
const isPicture = (file: string): boolean => CREDITS.pictures.test(file);
const STYLESHEET = /\.css$/;

/** The files git tracks or would track under `paths`, that exist on disk. */
export function listFiles(root: string, paths: readonly string[]): string[] {
  const out = spawnSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', ...paths],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (out.status !== 0) throw new Error(`git ls-files failed: ${out.stderr.trim()}`);
  return [...new Set(out.stdout.split('\n').filter(Boolean))]
    .filter((file) => existsSync(join(root, file)))
    .sort();
}

/** The files of a commit's tree under `paths`. */
export function listCommitFiles(root: string, ref: string, paths: readonly string[]): string[] {
  const out = spawnSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', ref, '--', ...paths], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (out.status !== 0) throw new Error(`git ls-tree ${ref} failed: ${out.stderr.trim()}`);
  return out.stdout.split('\n').filter(Boolean).sort();
}

/** The text of each of `files` at `ref`, read in one `git cat-file --batch`; a missing file is absent. */
export function readCommitFiles(
  root: string,
  ref: string,
  files: readonly string[],
): Map<string, string> {
  const out = spawnSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: files.map((f) => `${ref}:${f}`).join('\n') + '\n',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (out.status !== 0) throw new Error(`git cat-file failed: ${String(out.stderr).trim()}`);
  const buf = out.stdout;
  const texts = new Map<string, string>();
  let at = 0;
  for (const file of files) {
    const eol = buf.indexOf(10, at);
    if (eol < 0) break;
    const head = buf.subarray(at, eol).toString('utf8');
    at = eol + 1;
    const m = /^[0-9a-f]+ (\w+) (\d+)$/.exec(head);
    if (!m) continue; // "<object> missing"
    const size = Number(m[2]);
    if (m[1] === 'blob') texts.set(file, buf.subarray(at, at + size).toString('utf8'));
    at += size + 1;
  }
  return texts;
}

export function isExcluded(file: string): boolean {
  return EXCLUDED_FILES.some((re) => re.test(file));
}

/** True when an override turns `rule` off for `file`. */
export function isOverridden(file: string, rule: BrandRuleId): boolean {
  return OVERRIDES.some(
    (o) =>
      o.rules.includes(rule) &&
      o.files.some((f) => (f.endsWith('/') ? file.startsWith(f) : file === f)),
  );
}

/**
 * Splits findings into the accepted and the open ones, and names the acceptances nothing matched.
 * An acceptance takes one finding, so a second finding of the same text in the same file (a new
 * button with an old label) stays open.
 */
export function applyAcceptances(
  findings: readonly BrandFinding[],
  accepted: readonly Acceptance[],
): { accepted: BrandFinding[]; open: BrandFinding[]; stale: Acceptance[] } {
  const used = new Set<Acceptance>();
  const take: BrandFinding[] = [];
  const open: BrandFinding[] = [];
  for (const finding of findings) {
    const match = accepted.find(
      (a) =>
        !used.has(a) &&
        a.rule === finding.rule &&
        a.file === finding.file &&
        finding.text.includes(a.match),
    );
    if (match) {
      used.add(match);
      take.push(finding);
    } else open.push(finding);
  }
  return { accepted: take, open, stale: accepted.filter((a) => !used.has(a)) };
}

export function runBrandLint(options: BrandLintOptions): BrandLintResult {
  const { root } = options;
  const mode = options.mode ?? BRAND_LINT_MODE;
  const rules =
    options.rules ?? new Set<BrandRuleId>([...SOURCE_RULES, ...CSS_RULES, 'brand/credits']);
  const { ref } = options;
  const committed = new Map<string, string>();
  const list = (paths: readonly string[]): string[] => {
    if (!ref) return listFiles(root, paths);
    const found = listCommitFiles(root, ref, paths);
    for (const [file, text] of readCommitFiles(
      root,
      ref,
      found.filter((f) => !isPicture(f)),
    ))
      committed.set(file, text);
    return found;
  };
  const read = (file: string): string | null => {
    if (ref) return committed.get(file) ?? null;
    try {
      return readFileSync(join(root, file), 'utf8');
    } catch {
      return null;
    }
  };
  const files = (options.files ?? list(LINT_ROOTS)).filter((f) => !isExcluded(f));
  if (ref && options.files)
    for (const [file, text] of readCommitFiles(root, ref, files)) committed.set(file, text);
  const findings: BrandFinding[] = [];
  let scripts = 0;
  let stylesheets = 0;
  for (const file of files) {
    const text = read(file);
    if (text === null) continue;
    if (SCRIPT.test(file)) {
      scripts += 1;
      findings.push(...lintSource(file, text, rules));
    } else if (STYLESHEET.test(file)) {
      stylesheets += 1;
      findings.push(...lintCss(file, text, rules));
    }
  }
  let pictures = 0;
  // the credits check reads the whole picture set; a run over named files skips it unless asked
  const credited =
    rules.has('brand/credits') && (!options.files || options.rules?.has('brand/credits') === true);
  if (credited) {
    const pictureFiles = list(CREDITS.roots);
    if (ref)
      for (const [file, text] of readCommitFiles(root, ref, [CREDITS.record]))
        committed.set(file, text);
    const credits = checkCredits(pictureFiles, read, read(CREDITS.record));
    pictures = credits.pictures.length;
    findings.push(...credits.findings);
  }
  const kept = findings.filter((f) => f.rule === 'brand/parse' || !isOverridden(f.file, f.rule));
  const broken = kept.filter((f) => f.rule === 'brand/parse');
  const judged = kept.filter((f) => f.rule !== 'brand/parse');
  // a run narrowed by --files or --rules weighs only the acceptances it could have matched, so an
  // acceptance in a file or rule it did not read is not stale
  const readFiles = new Set(files);
  const inScope = (options.accepted ?? ACCEPTED).filter(
    (a) => rules.has(a.rule) && (a.rule === 'brand/credits' ? credited : readFiles.has(a.file)),
  );
  const split =
    mode === 'enforce'
      ? applyAcceptances(judged, inScope)
      : { accepted: [], open: judged, stale: [] };
  return {
    mode,
    read: { scripts, stylesheets, pictures },
    findings: judged,
    accepted: split.accepted,
    open: split.open,
    stale: split.stale,
    broken,
    failed:
      broken.length > 0 ||
      (mode === 'enforce' && (split.open.length > 0 || split.stale.length > 0)),
  };
}

/** The human lines of a run: a summary, the counts per rule, then each open finding. */
export function formatBrandLint(result: BrandLintResult): string[] {
  const lines: string[] = [];
  const count = new Map<string, number>();
  for (const f of result.open) count.set(f.rule, (count.get(f.rule) ?? 0) + 1);
  const files = new Set(result.open.map((f) => f.file)).size;
  lines.push(
    `brand lint (${result.mode} mode): ${result.read.scripts} scripts, ${result.read.stylesheets} stylesheets and ${result.read.pictures} mood pictures read; ${result.open.length} open finding(s) in ${files} file(s), ${result.accepted.length} accepted, ${result.stale.length} stale acceptance(s), ${result.broken.length} file(s) that do not parse`,
  );
  for (const [rule, n] of [...count.entries()].sort()) lines.push(`  ${rule}: ${n}`);
  for (const f of [...result.broken, ...result.open])
    lines.push(`${f.file}:${f.line}:${f.column}  ${f.rule}  ${f.text}`);
  for (const a of result.stale)
    lines.push(
      `stale acceptance: ${a.rule} ${a.file} "${a.match}" (${a.owner}) matches no finding`,
    );
  return lines;
}
