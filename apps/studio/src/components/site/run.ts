/**
 * The command line run screen 02 shows (docs/SITE.md A.4): the three commands of the run the
 * landing recorded from the CLI (`apps/studio/home-deck/recorded/run.json`, written by the real
 * `turboslide` binary against the page's deck) with the first line of each answer, as text. The
 * page does not import the recording, which carries every finding line and the gestures; run.test.ts
 * reads it and fails when a command or an answer here differs from it.
 */
export type RunStep = {
  /** the arguments after `turboslide`, as the recording holds them */
  argv: readonly string[];
  /** the first line the command printed */
  answer: string;
};

export const RECORDED_RUN: readonly RunStep[] = [
  {
    argv: ['slide', 'new', '--layout', 'rows', '--after', 'ships', '--id', 'next-steps'],
    answer: 'new rows slide next-steps after ships: revision 1',
  },
  {
    argv: ['block', 'set', 'next-steps#h', '/text', 'Next steps with Northwind'],
    answer: 'set h /text on next-steps: revision 2, 8 finding(s)',
  },
  {
    argv: [
      'block',
      'set',
      'next-steps#rows',
      '/items',
      '[\n{"key": "Monday", "value": "Northwind sellers get the deck"},\n{"key": "Wednesday", "value": "Agents draft slides over MCP"},\n{"key": "Friday", "value": "The first call uses this deck"}\n]',
    ],
    answer: 'set rows /items on next-steps: revision 3, 2 finding(s)',
  },
];

/**
 * One argument as a shell reads it back: bare when it is a plain word, in double quotes when it
 * holds a space, in single quotes when it holds a double quote.
 */
export function quoteArgument(arg: string): string {
  if (/^[\w#/.:=@-]+$/.test(arg)) return arg;
  if (arg.includes('"')) return `'${arg}'`;
  return `"${arg}"`;
}

/**
 * The command's parts for the terminal: the command words, then each flag with its value as one
 * part, so a line breaks between parts and never inside a flag and its value.
 */
export function commandParts(argv: readonly string[]): string[] {
  const parts: string[] = ['turboslide'];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const next = argv[i + 1];
    if (arg.startsWith('--') && next !== undefined && !next.startsWith('--')) {
      parts.push(`${arg} ${quoteArgument(next)}`);
      i += 1;
    } else parts.push(quoteArgument(arg));
  }
  return parts;
}
