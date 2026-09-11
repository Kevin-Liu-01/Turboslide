#!/usr/bin/env node
// MILESTONES M2 acceptance, `node apps/cli/e2e/mcp-stdio.mjs`: an MCP client over stdio starts
// `turboslide mcp` on a scratch deck, lists the tools, inserts a slide, renders it (image content
// comes back), receives a finding from lint, patches the slide, re-lints, saves a version, then
// starts a second server on the calibration deck (packages/export/src/calibration/deck.ts) and
// exports it to PPTX through deck_export without verification, and exits 0 only if every step
// succeeds. The scratch decks live under .turboslide/e2e-mcp/ so the committed decks are not
// touched; the derived files (renders, sheets, the export) land beside them through `--derived`.
// Stderr of each server is collected and printed on failure.
import { existsSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import {
  CALIBRATION_DECK_ID,
  CALIBRATION_SLIDE_IDS,
  writeCalibrationDeck,
} from '../../../packages/export/src/calibration/deck.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRATCH = join(ROOT, '.turboslide', 'e2e-mcp');
const DECK_DIR = join(SCRATCH, 'deck');
const DERIVED = join(SCRATCH, 'derived');
const CALIBRATION_DIR = join(SCRATCH, 'calibration');
const CALIBRATION_DERIVED = join(SCRATCH, 'calibration-derived');
const DECK_ID = 'mcp-e2e';
const RUN_ID = 'mcp-e2e';
const PNG_SIGNATURE = '89504e470d0a1a0a';
/** The tools `turboslide mcp` serves, as a floor: every action on the mcp transport with a handler in the CLI (M2's 25 plus deck_create, deck_rename and deck_judge_bundle). */
const TOOL_COUNT = 28;

const log = (line) => process.stderr.write(`${line}\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** The scratch deck: one section, one statement slide, no assets (SPEC 4.1). */
async function writeScratchDeck() {
  await rm(SCRATCH, { recursive: true, force: true });
  await mkdir(join(DECK_DIR, 'slides'), { recursive: true });
  const now = new Date().toISOString();
  const deck = {
    schemaVersion: 1,
    id: DECK_ID,
    title: 'MCP stdio e2e',
    theme: 'gt-ink-paper',
    sections: [{ id: 'brand', name: 'Brand', slideIds: ['thesis'] }],
    assets: {},
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const thesis = {
    schemaVersion: 1,
    id: 'thesis',
    kind: 'statement',
    big: 'Every product in every language',
    measure: 22,
  };
  await writeFile(join(DECK_DIR, 'deck.json'), `${JSON.stringify(deck, null, 2)}\n`);
  await writeFile(join(DECK_DIR, 'slides', 'thesis.json'), `${JSON.stringify(thesis, null, 2)}\n`);
}

/** The slide the client inserts: the content-rule archetype with a heading that ends in a period (copy/heading-period, severity 3). */
const INSERTED_SLIDE = {
  schemaVersion: 1,
  id: 'content-rule',
  kind: 'content',
  layout: { type: 'cols', ratio: '1/1' },
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'The content rule.' },
      {
        id: 'p1',
        type: 'paragraph',
        measure: 56,
        text: 'Every post states what was built, what it cost, and what changed.',
      },
    ],
    right: [
      {
        id: 'list',
        type: 'plain',
        items: [
          {
            icon: { name: 'check-circle', color: 'ok' },
            text: 'A measured result with the method',
          },
          {
            icon: { name: 'x-circle', color: 'no' },
            no: true,
            text: 'Announcements without a result',
          },
        ],
      },
    ],
  },
};

function textOf(result) {
  const text = result.content.find((item) => item.type === 'text');
  return text ? text.text : '';
}

function errorOf(result) {
  try {
    return JSON.parse(textOf(result)).error;
  } catch {
    return undefined;
  }
}

/** True when LibreOffice is reachable the way the server resolves it (TURBOSLIDE_SOFFICE, the macOS app, PATH). */
function hasSoffice() {
  const explicit = process.env.TURBOSLIDE_SOFFICE;
  if (explicit) return explicit.includes('/') ? existsSync(explicit) : onPath(explicit);
  if (existsSync('/Applications/LibreOffice.app/Contents/MacOS/soffice')) return true;
  return onPath('soffice');
}

function onPath(bin) {
  return (process.env.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir !== '' && existsSync(join(dir, bin)));
}

/** A server on `deckDir` with its stderr collected; `--author` marks every write with the run id. */
function startServer(deckDir, derived, stderr) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs'),
      'mcp',
      '--deck',
      deckDir,
      '--derived',
      derived,
      '--author',
      `agent:${RUN_ID}`,
    ],
    cwd: ROOT,
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
  return transport;
}

async function main() {
  await writeScratchDeck();
  const stderr = [];
  const transport = startServer(DECK_DIR, DERIVED, stderr);
  const client = new Client({ name: 'turboslide-e2e', version: '0.0.0' });
  const exportClient = new Client({ name: 'turboslide-e2e-export', version: '0.0.0' });
  const steps = [];
  let current = '';
  const step = async (name, fn) => {
    current = name;
    const startedAt = Date.now();
    const value = await fn();
    steps.push(`${name} (${Date.now() - startedAt} ms)`);
    log(`ok   ${name}`);
    return value;
  };
  try {
    await step('connect', () => client.connect(transport));

    const tools = await step('tools/list', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      for (const name of [
        'deck_get_info',
        'deck_get_slide',
        'deck_list_slides',
        'deck_insert_slide',
        'deck_update_block',
        'deck_render',
        'deck_lint',
        'deck_version_save',
        'deck_version_list',
        'deck_export',
        'deck_judge_bundle',
      ])
        assert(names.includes(name), `tools/list lacks ${name}: ${names.join(', ')}`);
      // a floor, not an exact count: every milestone adds tools (M4 added deck_judge_bundle)
      assert(
        tools.length >= TOOL_COUNT,
        `expected at least ${TOOL_COUNT} tools, got ${tools.length}: ${names.join(', ')}`,
      );
      const exportTool = tools.find((tool) => tool.name === 'deck_export');
      assert(
        exportTool.inputSchema.required.includes('format'),
        'deck_export does not require format',
      );
      assert(
        exportTool.outputSchema.properties.slides.items.properties.theme,
        'deck_export slides carry no theme in the outputSchema',
      );
      const insert = tools.find((tool) => tool.name === 'deck_insert_slide');
      assert(
        insert.inputSchema.type === 'object',
        'deck_insert_slide inputSchema is not an object',
      );
      assert(
        insert.inputSchema.required.includes('baseRevision'),
        'deck_insert_slide does not require baseRevision',
      );
      assert(
        insert.outputSchema && insert.outputSchema.type === 'object',
        'deck_insert_slide has no outputSchema',
      );
      return tools;
    });
    log(`     ${tools.length} tools: ${tools.map((tool) => tool.name).join(', ')}`);

    const info = await step('deck_get_info', async () => {
      const result = await client.callTool({ name: 'deck_get_info', arguments: {} });
      assert(!result.isError, `deck_get_info failed: ${textOf(result)}`);
      const info = result.structuredContent;
      assert(info.id === DECK_ID, `deck id ${info.id}`);
      assert(info.counts.slides === 1, `expected 1 slide, got ${info.counts.slides}`);
      return info;
    });

    const inserted = await step('deck_insert_slide', async () => {
      const result = await client.callTool({
        name: 'deck_insert_slide',
        arguments: {
          sectionId: 'brand',
          after: 'thesis',
          slide: INSERTED_SLIDE,
          baseRevision: info.revision,
        },
      });
      assert(!result.isError, `deck_insert_slide failed: ${textOf(result)}`);
      const out = result.structuredContent;
      assert(
        out.revision === info.revision + 1,
        `revision ${out.revision} after insert at ${info.revision}`,
      );
      assert(out.slide.id === 'content-rule', 'the inserted slide came back with another id');
      const brand = out.outline.find((section) => section.id === 'brand');
      assert(
        brand.slides.map((slide) => slide.id).join(',') === 'thesis,content-rule',
        'outline order',
      );
      assert(brand.slides[1].n === 2, 'the inserted slide is not n 2');
      return out;
    });

    await step('deck_render returns image content', async () => {
      const result = await client.callTool({
        name: 'deck_render',
        arguments: { slideIds: ['content-rule'], themes: ['light', 'dark'], scale: 1 },
      });
      assert(!result.isError, `deck_render failed: ${textOf(result)}`);
      const images = result.content.filter((item) => item.type === 'image');
      assert(images.length === 2, `expected 2 images, got ${images.length}`);
      for (const image of images) {
        assert(image.mimeType === 'image/png', `image mimeType ${image.mimeType}`);
        const head = Buffer.from(image.data, 'base64').subarray(0, 8).toString('hex');
        assert(head === PNG_SIGNATURE, `image content is not a PNG (${head})`);
      }
      const { records } = result.structuredContent;
      assert(records.length === 2, `expected 2 records, got ${records.length}`);
      for (const record of records) {
        assert(record.slideId === 'content-rule', `record for ${record.slideId}`);
        assert(record.pageErrors.length === 0, `page errors: ${record.pageErrors.join('; ')}`);
        assert(record.revision === inserted.revision, `record revision ${record.revision}`);
      }
      log(`     renderer: ${records[0].renderer}`);
    });

    await step('deck_lint reports copy/heading-period on the inserted slide', async () => {
      const result = await client.callTool({
        name: 'deck_lint',
        arguments: { slideIds: ['content-rule'], layers: 'both' },
      });
      assert(!result.isError, `deck_lint failed: ${textOf(result)}`);
      const { items, count } = result.structuredContent;
      assert(count === items.length, 'count does not match items');
      const finding = items.find((row) => row.rule === 'copy/heading-period');
      assert(
        finding,
        `no copy/heading-period finding among ${items.map((row) => row.rule).join(', ')}`,
      );
      assert(
        finding.slideId === 'content-rule' && finding.blockId === 'h',
        'the finding names another block',
      );
      assert(finding.severity === 3, `severity ${finding.severity}`);
      log(`     ${count} finding(s); ${finding.rule}: ${finding.proposal}`);
    });

    const patched = await step('deck_update_block patches the heading', async () => {
      const result = await client.callTool({
        name: 'deck_update_block',
        arguments: {
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          value: 'The content rule',
          baseRevision: inserted.revision,
        },
      });
      assert(!result.isError, `deck_update_block failed: ${textOf(result)}`);
      const out = result.structuredContent;
      assert(out.revision === inserted.revision + 1, `revision ${out.revision} after patch`);
      assert(out.slide.slots.left[0].text === 'The content rule', 'the heading was not patched');
      assert(
        !out.findings.some((row) => row.rule === 'copy/heading-period'),
        'the write result still carries the finding',
      );
      return out;
    });

    await step('a stale baseRevision is refused with 409 and the current revision', async () => {
      const result = await client.callTool({
        name: 'deck_update_block',
        arguments: {
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          value: 'Another heading',
          baseRevision: inserted.revision,
        },
      });
      assert(result.isError === true, 'the stale write was accepted');
      const error = errorOf(result);
      assert(error && error.status === 409, `expected status 409, got ${JSON.stringify(error)}`);
      assert(
        error.currentRevision === patched.revision,
        `currentRevision ${error.currentRevision}`,
      );
      assert(
        error.current && error.current.slides['content-rule'],
        'the 409 body lacks the current slide',
      );
    });

    await step('deck_lint is clean of copy/heading-period after the patch', async () => {
      const result = await client.callTool({
        name: 'deck_lint',
        arguments: { slideIds: ['content-rule'], layers: 'both' },
      });
      assert(!result.isError, `deck_lint failed: ${textOf(result)}`);
      const { items } = result.structuredContent;
      assert(
        !items.some((row) => row.rule === 'copy/heading-period'),
        'copy/heading-period is still reported',
      );
      const blocking = items.filter((row) => row.severity === 3);
      assert(
        blocking.length === 0,
        `severity 3 findings remain: ${blocking.map((row) => row.rule).join(', ')}`,
      );
    });

    const saved = await step('deck_version_save records the agent author', async () => {
      const result = await client.callTool({
        name: 'deck_version_save',
        arguments: { note: 'mcp e2e' },
      });
      assert(!result.isError, `deck_version_save failed: ${textOf(result)}`);
      // The store appends a log entry per committed write (the insert, the patch) and one for the
      // save, so the named version is the third entry with an empty mutation list and the note.
      const version = result.structuredContent;
      assert(version.note === 'mcp e2e', `version note ${JSON.stringify(version.note)}`);
      assert(version.revision === patched.revision, `version revision ${version.revision}`);
      assert(
        version.author.kind === 'agent' && version.author.runId === RUN_ID,
        `author ${JSON.stringify(version.author)}`,
      );
      assert(Number.isInteger(version.n) && version.n >= 1, `version n ${version.n}`);
      return version;
    });

    await step('deck_version_list lists the writes and the saved version', async () => {
      const result = await client.callTool({ name: 'deck_version_list', arguments: {} });
      assert(!result.isError, `deck_version_list failed: ${textOf(result)}`);
      const { items } = result.structuredContent;
      assert(
        items.some(
          (row) => row.n === saved.n && row.note === 'mcp e2e' && row.author.runId === RUN_ID,
        ),
        'the saved version is not listed',
      );
      const ops = items.flatMap((row) => row.mutations.map((mutation) => mutation.op));
      assert(
        ops.includes('slide.insert') && ops.includes('block.set'),
        `the log lacks the writes: ${ops.join(', ')}`,
      );
      assert(
        items.every((row) => row.author.runId === RUN_ID),
        'an entry has another author',
      );
    });

    await step('resources: the slide, the manifest, the latest render', async () => {
      const slide = await client.readResource({ uri: `deck://${DECK_ID}/slides/content-rule` });
      const doc = JSON.parse(slide.contents[0].text);
      assert(
        doc.slots.left[0].text === 'The content rule',
        'deck://<id>/slides/<slideId> is stale',
      );
      const manifest = await client.readResource({ uri: `deck://${DECK_ID}/manifest` });
      assert(
        JSON.parse(manifest.contents[0].text).revision === patched.revision,
        'manifest revision',
      );
      const render = await client.readResource({ uri: 'deck://render/content-rule/light' });
      const png = render.contents.find((content) => content.mimeType === 'image/png');
      assert(
        png && Buffer.from(png.blob, 'base64').subarray(0, 8).toString('hex') === PNG_SIGNATURE,
        'the render resource is not a PNG',
      );
      const lint = await client.readResource({ uri: `deck://lint/${DECK_ID}` });
      assert(
        Array.isArray(JSON.parse(lint.contents[0].text)),
        'deck://lint/<id> is not a Finding[]',
      );
      const templates = await client.listResourceTemplates();
      assert(
        templates.resourceTemplates.some((row) => row.uriTemplate === 'deck://sheet/{theme}'),
        'no sheet template',
      );
    });

    await step('deck_review prompt', async () => {
      const { prompts } = await client.listPrompts();
      assert(
        prompts.some((prompt) => prompt.name === 'deck_review'),
        'no deck_review prompt',
      );
      const prompt = await client.getPrompt({ name: 'deck_review', arguments: { lens: 'copy' } });
      const text = prompt.messages[0].content.text;
      assert(
        text.includes(`revision ${patched.revision}`),
        'the prompt does not name the revision',
      );
      assert(text.includes('Copy and case'), 'the prompt lacks the copy lens');
    });

    await step('close', async () => {
      await client.close();
    });

    // deck_export on the calibration deck (MILESTONES M2 item 3: every implemented action on the
    // mcp transport is a tool; SPEC 8.5: the report is the result). Flatten, one theme, no
    // verification, so the step needs Chromium and pptxgenjs but not LibreOffice.
    await step('calibration deck written and its server connected', async () => {
      await writeCalibrationDeck(CALIBRATION_DIR);
      await exportClient.connect(startServer(CALIBRATION_DIR, CALIBRATION_DERIVED, stderr));
      const { tools } = await exportClient.listTools();
      assert(
        tools.length >= TOOL_COUNT,
        `expected at least ${TOOL_COUNT} tools, got ${tools.length}`,
      );
    });

    await step('deck_export with verify false returns the report', async () => {
      const result = await exportClient.callTool({
        name: 'deck_export',
        arguments: { format: 'pptx', mode: 'flatten', theme: ['light'], verify: false },
      });
      assert(!result.isError, `deck_export failed: ${textOf(result)}`);
      const report = result.structuredContent;
      assert(report.deckId === CALIBRATION_DECK_ID, `report deckId ${report.deckId}`);
      assert(report.format === 'pptx' && report.mode === 'flatten', 'report format or mode');
      assert(report.theme === 'light', `report theme ${report.theme}`);
      assert(report.fontSet === 'exact', `report fontSet ${report.fontSet}`);
      assert(report.files.length === 1, `expected 1 file, got ${report.files.length}`);
      const [file] = report.files;
      assert(
        file.path.endsWith(`${CALIBRATION_DECK_ID}-light.pptx`) && existsSync(file.path),
        `the exported file is missing: ${file.path}`,
      );
      assert(statSync(file.path).size === file.bytes, 'the report misstates the file size');
      assert(
        file.path.startsWith(join(CALIBRATION_DERIVED, 'export')),
        `the export landed outside the derived directory: ${file.path}`,
      );
      assert(
        report.slides.length === CALIBRATION_SLIDE_IDS.length,
        `expected ${CALIBRATION_SLIDE_IDS.length} slide entries, got ${report.slides.length}`,
      );
      assert(
        report.slides.every((slide) => slide.theme === 'light'),
        'a slide entry does not name its theme',
      );
      assert(
        report.slides.every((slide) => slide.verify === undefined),
        'verify false still filled a verify section',
      );
      assert(typeof report.passed === 'boolean', 'passed is not a boolean');
      assert(report.geometryInBounds === true, 'the geometry is out of bounds');
      assert(Array.isArray(report.residual), 'residual is not a list');
      log(
        `     ${report.files.length} file, ${report.slides.length} slides, passed ${report.passed}, ${report.fonts.embedded.length} font(s) embedded`,
      );
    });

    if (hasSoffice()) {
      log(
        'skip deck_export with verify true is refused without soffice (LibreOffice is installed)',
      );
    } else {
      await step('deck_export with verify true is refused without soffice', async () => {
        const result = await exportClient.callTool({
          name: 'deck_export',
          arguments: { format: 'pptx', mode: 'flatten', theme: ['light'], verify: true },
        });
        assert(result.isError === true, 'the verify request was not refused');
        const error = errorOf(result);
        assert(
          error && /turboslide-render-worker/.test(error.message),
          `the error does not name the render worker image: ${JSON.stringify(error)}`,
        );
      });
    }

    await step('close export server', async () => {
      await exportClient.close();
    });
    log(
      `mcp-stdio: ${steps.length} steps passed; scratch deck at ${DECK_DIR}, derived files at ${DERIVED}, calibration export under ${CALIBRATION_DERIVED}`,
    );
    return 0;
  } catch (error) {
    log(
      `mcp-stdio: step "${current}" failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    if (stderr.length > 0)
      log(`server stderr:\n${stderr.join('').split('\n').slice(-40).join('\n')}`);
    for (const c of [client, exportClient]) {
      try {
        await c.close();
      } catch {
        // the transport may already be gone
      }
    }
    return 1;
  }
}

process.exitCode = await main();
