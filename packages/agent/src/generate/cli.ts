// The CLI option parsers (SPEC 7.1, 7.2), generated from the action table: for every action with
// a cli transport, the command words, the positionals named in the usage, the options derived from
// the input schema (with the usage's flag aliases), the custom flags the usage names, and the
// stdin key. apps/cli reads packages/agent/generated/cli.json instead of hand-writing parsers.
import type { ActionSpec } from '@turboslide/schema/actions';
import { actionsOn } from '@turboslide/schema/actions';
import { summarizeProperties, toJsonSchema } from './json-schema.ts';

export type CliOption = {
  key: string;
  flag: string;
  type: string;
  required: boolean;
  description?: string;
  enum?: ReadonlyArray<string | number | boolean>;
};

export type CliAction = {
  action: string;
  usage: string;
  command: string[];
  positionals: string[];
  stdin?: string;
  options: CliOption[];
  /** Flags the usage names that map to no single input key (turboslide fills them by hand). */
  custom: { flag: string; template?: string }[];
  mutates: boolean;
  milestone: string;
};

export type CliContract = {
  version: 1;
  binary: 'turboslide';
  globalFlags: { flag: string; description: string }[];
  exitCodes: Record<string, string>;
  actions: CliAction[];
};

export const GLOBAL_FLAGS: CliContract['globalFlags'] = [
  {
    flag: '--deck <dir>',
    description: 'The deck directory; defaults to the nearest deck.json upward',
  },
  { flag: '--json', description: 'Machine output on stdout, human output on stderr' },
  {
    flag: '--author <name>',
    description: 'Defaults to $USER or TURBOSLIDE_AUTHOR; agents pass agent:<runId>',
  },
  {
    flag: '--base-revision <n>',
    description:
      'For writes; defaults to the current revision when omitted (the convenience mode for a human)',
  },
];

export const EXIT_CODES: CliContract['exitCodes'] = {
  '0': 'success',
  '1': 'findings at the gate or a verify failure',
  '2': 'usage or validation error',
};

export function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function cliActionFor(spec: ActionSpec): CliAction | undefined {
  if (spec.cli === undefined) return undefined;
  const usage = spec.cli.usage;
  const tokens = usage.split(/\s+/).slice(1);
  const command: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('<') || token.startsWith('--') || token.startsWith('-') || token === '<')
      break;
    command.push(token);
  }
  const schema = toJsonSchema(spec.input);
  const properties = summarizeProperties(schema);
  const keys = new Set(properties.map((property) => property.name));
  const positionals: string[] = [];
  const aliases = new Map<string, string>();
  const custom: CliAction['custom'] = [];
  let previousFlag: string | undefined;
  for (const token of tokens) {
    if (token === '<') break;
    const placeholder = /^<([A-Za-z]+)>(?:#<([A-Za-z]+)>)?$/.exec(token);
    if (token.startsWith('--') || token.startsWith('-')) {
      previousFlag = token;
      continue;
    }
    if (placeholder !== null) {
      const names = [placeholder[1], placeholder[2]].filter(
        (name): name is string => name !== undefined,
      );
      if (previousFlag !== undefined) {
        const key = names[0];
        if (key !== undefined && keys.has(key)) aliases.set(key, previousFlag);
        else custom.push({ flag: previousFlag, template: token });
        previousFlag = undefined;
        continue;
      }
      for (const name of names) if (keys.has(name)) positionals.push(name);
      continue;
    }
    if (previousFlag !== undefined) {
      custom.push({ flag: previousFlag, template: token });
      previousFlag = undefined;
    }
  }
  if (previousFlag !== undefined) custom.push({ flag: previousFlag });
  const stdin = spec.cli.stdin;
  const options: CliOption[] = properties
    .filter((property) => !positionals.includes(property.name) && property.name !== stdin)
    .map((property) => {
      const option: CliOption = {
        key: property.name,
        flag: aliases.get(property.name) ?? `--${kebab(property.name)}`,
        type: property.type,
        required: property.required,
      };
      const description = property.description ?? property.title;
      if (description !== undefined) option.description = description;
      if (property.enumValues !== undefined) option.enum = property.enumValues;
      return option;
    });
  const action: CliAction = {
    action: spec.id,
    usage,
    command,
    positionals,
    ...(stdin !== undefined ? { stdin } : {}),
    options,
    custom,
    mutates: spec.mutates,
    milestone: spec.milestone,
  };
  return action;
}

export function generateCli(): CliContract {
  const actions = actionsOn('cli')
    .map(cliActionFor)
    .filter((action): action is CliAction => action !== undefined);
  return {
    version: 1,
    binary: 'turboslide',
    globalFlags: GLOBAL_FLAGS,
    exitCodes: EXIT_CODES,
    actions,
  };
}
