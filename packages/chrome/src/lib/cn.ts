/**
 * Class joiner for the shell components. Dependency free on purpose. Ported
 * from Prototemplate/src/lib/cn.ts (PORTED_FROM.json).
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}
