// describe().actions for the window API (SPEC 7.4): the actions offered on the window transport,
// the six Glyphfield standard actions, the global, the ready event and the error classes. The
// studio's adapters (M3) return this shape from window.turboslide.studio.describe().
import { actionsOn } from '@turboslide/schema/actions';

export const WINDOW_GLOBAL = 'window.turboslide.studio';
export const READY_EVENT = 'turboslide:studio-api-ready';

export const STANDARD_ACTIONS = [
  'source.read',
  'source.apply',
  'controls.list',
  'control.activate',
  'control.set',
  'artifact.download',
] as const;

export const WINDOW_METHODS = [
  { name: 'version', description: 'The API version, 1' },
  {
    name: 'describe()',
    description: 'The active owner, its actions and whether source read and apply are supported',
  },
  {
    name: 'controls()',
    description: 'Visible interactive controls with accessible labels, data-control ids and values',
  },
  {
    name: 'activate(label)',
    description:
      'Activates a control by accessible label or data-control id; RangeError when missing',
  },
  {
    name: 'set(label, value)',
    description: 'Sets a control by label or data-control id and dispatches input and change',
  },
  { name: 'readSource()', description: 'The exact current source document of the active owner' },
  {
    name: 'applySource(doc)',
    description:
      'Applies a JSON string or object through the validator, then waits two animation frames',
  },
  {
    name: 'invoke(action, input)',
    description: 'Runs a standard action or delegates to the active owner',
  },
  {
    name: 'download(artifact)',
    description: 'Saves a returned artifact with its deterministic file name',
  },
] as const;

export const ERROR_CLASSES = [
  { name: 'TypeError', status: 400, when: 'malformed input, with the Zod path' },
  { name: 'RangeError', status: 404, when: 'an unknown action, label or id' },
  {
    name: 'ConflictError',
    status: 409,
    when: 'a stale baseRevision or a held lease, with the holder and the current document attached',
  },
  {
    name: 'NotImplementedError',
    status: 501,
    when: 'an action declared in the table whose implementation lands in a later milestone',
  },
  { name: 'Error', status: 500, when: 'renderer and codec failures' },
] as const;

export type Describe = {
  version: 1;
  global: string;
  event: string;
  owners: { id: string; when: string; actions: string[] }[];
  standardActions: string[];
  actions: string[];
  details: Record<
    string,
    { label: string; doc: string; mutates: boolean; milestone: string; group: string }
  >;
  methods: typeof WINDOW_METHODS;
  errors: typeof ERROR_CLASSES;
};

export function generateDescribe(): Describe {
  const windowActions = actionsOn('window');
  const details: Describe['details'] = {};
  for (const spec of windowActions) {
    details[spec.id] = {
      label: spec.label,
      doc: spec.doc,
      mutates: spec.mutates,
      milestone: spec.milestone,
      group: spec.group,
    };
  }
  const ids = windowActions.map((spec) => spec.id);
  const viewIds = ids.filter((id) => id.startsWith('view.'));
  return {
    version: 1,
    global: WINDOW_GLOBAL,
    event: READY_EVENT,
    owners: [
      {
        id: 'editor',
        when: 'a deck is open at /edit/:deckId',
        actions: ids.filter(
          (id) => !STANDARD_ACTIONS.includes(id as (typeof STANDARD_ACTIONS)[number]),
        ),
      },
      {
        id: 'viewer',
        when: '/deck/:deckId in slide, grid or book mode (the window API on every viewer page; the studio session an agent drives over MCP only when the address carries ?agent=1 and while the page is visible)',
        actions: [...viewIds, 'render.slide', 'render.sheet'],
      },
      {
        id: 'source-drawer',
        when: 'the source drawer is open; delegates to the editor',
        actions: ['source.read', 'source.apply'],
      },
      { id: 'presenter', when: '/present/:deckId', actions: ['view.goto', 'view.present'] },
    ],
    standardActions: [...STANDARD_ACTIONS],
    actions: ids,
    details,
    methods: WINDOW_METHODS,
    errors: ERROR_CLASSES,
  };
}
