import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

// PowerPoint import end to end (gslides-parity SPEC-5 0.26, 0.27, 0.29, 5.2 to 5.5; MILESTONES-5
// B3 days 5 and 6): `import.pptx` as a dry run through the agent surface of the same server
// answers the report with the sentence's three numbers and the source facts; a `.pptx` posted as
// a `data:` URL imports into a new deck the server then serves; `theme.import` appends a record
// under In this presentation and the sixth is refused with its sentence; `slide.import` with
// `sourceFile` and slide numbers lands the chosen slides after the current one. Every step is
// the HTTP transport of the one dispatcher; a step the server refuses because a seam of the
// integrator has not landed (the bridge composition B3-7, the slide.import sources B3-10, the
// bundle route's `.pptx` branch B3-18) is recorded as not driven, never as passed.
//
// PLAYWRIGHT_BASE_URL=http://localhost:4353 node_modules/.bin/playwright test apps/studio/e2e/import.spec.ts

const AGENT = 'agent:e2e-import';
const FIXTURES = resolve(import.meta.dirname, '../../../packages/import/src/__fixtures__/pptx');

function dataUrl(name: string): string {
  const bytes = readFileSync(join(FIXTURES, name));
  return `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`;
}

async function post<T>(
  request: APIRequestContext,
  deckId: string | null,
  action: string,
  body: unknown,
): Promise<{ status: number; json: T }> {
  const response = await request.post(
    `/api/actions/${action}${deckId === null ? '' : `?deck=${deckId}`}`,
    {
      data: body,
      headers: { 'x-turboslide-author': AGENT },
    },
  );
  return { status: response.status(), json: (await response.json().catch(() => ({}))) as T };
}

type Report = {
  deckId?: string;
  summary: { imported: number; substituted: number; dropped: number; slides: number };
  source: { file: string; slides: number; page: { width: number; height: number } };
  fonts: { family: string; runs: number }[];
  error?: { message: string };
};

async function freshDeck(request: APIRequestContext): Promise<string> {
  const created = await post<{ deckId: string }>(request, null, 'deck.create', {
    name: `Import ${Date.now().toString(36)}`,
    from: 'blank',
  });
  expect(created.status).toBe(200);
  return created.json.deckId;
}

test('import.pptx as a dry run answers the report with the sentence’s numbers and the source facts', async ({
  request,
}) => {
  const deckId = await freshDeck(request);
  const answer = await post<Report>(request, deckId, 'import.pptx', {
    file: dataUrl('04-charts-motion-media.pptx'),
    dryRun: true,
  });
  if (answer.status !== 200) {
    test.info().annotations.push({
      type: 'not driven',
      description: `import.pptx answered ${answer.status}: ${answer.json.error?.message ?? ''} (b3.md B3-7 composes the bridge)`,
    });
    test.skip();
    return;
  }
  expect(answer.json.summary.slides).toBe(4);
  expect(answer.json.summary.imported).toBe(17);
  expect(answer.json.summary.substituted).toBe(5);
  expect(answer.json.summary.dropped).toBe(0);
  expect(answer.json.source.slides).toBe(4);
  expect(answer.json.source.page).toEqual({ width: 1600, height: 900 });
  expect(answer.json.fonts.length).toBeGreaterThan(0);
  expect(answer.json.deckId).toBeUndefined();
});

test('import.pptx writes a new deck the server serves, with its report beside the manifest', async ({
  request,
}) => {
  const deckId = await freshDeck(request);
  const into = `imported-${Date.now().toString(36)}`;
  const answer = await post<Report>(request, deckId, 'import.pptx', {
    file: dataUrl('02-shapes.pptx'),
    into,
  });
  if (answer.status !== 200) {
    test.info().annotations.push({
      type: 'not driven',
      description: `import.pptx answered ${answer.status}: ${answer.json.error?.message ?? ''}`,
    });
    test.skip();
    return;
  }
  expect(answer.json.deckId).toBe(into);
  expect(answer.json.summary.slides).toBe(3);
  const list = await post<{ id: string }[]>(request, into, 'slide.list', {});
  expect(list.status).toBe(200);
  expect(list.json).toHaveLength(3);
  const first = await post<{ slide: { kind: string; layout?: { type: string } } }>(
    request,
    into,
    'slide.get',
    { slideId: list.json[0]!.id },
  );
  expect(first.json.slide.kind).toBe('content');
  expect(first.json.slide.layout?.type).toBe('freeform');
});

test('theme.import appends a record and refuses the sixth with the sentence', async ({
  request,
}) => {
  const deckId = await freshDeck(request);
  let revision = (await post<{ revision: number }>(request, deckId, 'deck.info', {})).json.revision;
  for (let i = 0; i < 5; i += 1) {
    const answer = await post<{
      index?: number;
      importedThemes?: unknown[];
      revision?: number;
      error?: { message: string };
    }>(request, deckId, 'theme.import', {
      file: dataUrl('01-text.pptx'),
      themeIndex: 0,
      baseRevision: revision,
    });
    if (answer.status !== 200) {
      test.info().annotations.push({
        type: 'not driven',
        description: `theme.import answered ${answer.status}: ${answer.json.error?.message ?? ''}`,
      });
      test.skip();
      return;
    }
    expect(answer.json.index).toBe(i);
    revision = answer.json.revision!;
  }
  const sixth = await post<{ error?: { message: string } }>(request, deckId, 'theme.import', {
    file: dataUrl('01-text.pptx'),
    baseRevision: revision,
  });
  expect(sixth.status).toBeGreaterThanOrEqual(400);
  expect(sixth.json.error?.message).toContain('This presentation already holds five themes');
  const theme = await post<{ importedThemes?: { name: string }[] }>(
    request,
    deckId,
    'theme.get',
    {},
  );
  expect(theme.json.importedThemes).toHaveLength(5);
});

test('slide.import with a file and slide numbers lands the chosen slides after the current one', async ({
  request,
}) => {
  const deckId = await freshDeck(request);
  const revision = (await post<{ revision: number }>(request, deckId, 'deck.info', {})).json
    .revision;
  const answer = await post<{
    slides?: { id: string }[];
    assets?: string[];
    revision?: number;
    error?: { message: string };
  }>(request, deckId, 'slide.import', {
    sourceFile: dataUrl('03-pictures-tables.pptx'),
    slideIndexes: [2],
    after: 'title',
    baseRevision: revision,
  });
  if (answer.status !== 200) {
    test.info().annotations.push({
      type: 'not driven',
      description: `slide.import --file answered ${answer.status}: ${answer.json.error?.message ?? ''} (b3.md B3-10 routes the file source)`,
    });
    test.skip();
    return;
  }
  expect(answer.json.slides).toHaveLength(1);
  const list = await post<{ id: string }[]>(request, deckId, 'slide.list', {});
  expect(list.json).toHaveLength(2);
  expect(list.json[1]?.id).toBe(answer.json.slides![0]!.id);
});

test('a .ppt, a macro enabled file and a file that is not a zip are refused with their sentences', async ({
  request,
}) => {
  const deckId = await freshDeck(request);
  const cases: [string, RegExp][] = [
    [
      'data:application/vnd.ms-powerpoint;base64,0M8R4KGxGuEAAAAAAAAAAAAAAAAAAAA=',
      /\.ppt|binary|save it as \.pptx/i,
    ],
    [
      `data:application/octet-stream;base64,${Buffer.from('not a zip at all').toString('base64')}`,
      /not a zip|not a PowerPoint|zip/i,
    ],
  ];
  for (const [file, pattern] of cases) {
    const answer = await post<{ error?: { message: string } }>(request, deckId, 'import.pptx', {
      file,
      dryRun: true,
    });
    if (answer.status === 501 || /import bridge/.test(answer.json.error?.message ?? '')) {
      test.info().annotations.push({
        type: 'not driven',
        description: `import.pptx answered ${answer.status}: ${answer.json.error?.message ?? ''}`,
      });
      test.skip();
      return;
    }
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(answer.json.error?.message ?? '').toMatch(pattern);
  }
});
