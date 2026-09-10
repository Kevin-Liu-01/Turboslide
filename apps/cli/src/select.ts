// Slide selection for render, sheet, lint and slide get: `all`, slide ids, deck numbers and
// ranges (`3-7`), in deck order and without duplicates.
import type { LoadedDeck } from './deck-files.ts';
import { UsageError } from './exit.ts';

export function selectSlides(loaded: LoadedDeck, args: readonly string[]): string[] {
  if (args.length === 0 || args.includes('all')) return [...loaded.order];
  const wanted = new Set<string>();
  const byN = new Map(loaded.order.map((id, i) => [i + 1, id]));
  for (const arg of args) {
    for (const part of arg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const range = /^(\d+)-(\d+)$/.exec(part);
      if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        for (let n = Math.min(a, b); n <= Math.max(a, b); n += 1) {
          const id = byN.get(n);
          if (!id) throw new UsageError(`no slide ${n} (the deck has ${loaded.order.length})`);
          wanted.add(id);
        }
        continue;
      }
      if (/^\d+$/.test(part)) {
        const id = byN.get(Number(part));
        if (!id) throw new UsageError(`no slide ${part} (the deck has ${loaded.order.length})`);
        wanted.add(id);
        continue;
      }
      if (!loaded.order.includes(part))
        throw new UsageError(`no slide "${part}" in deck.json sections`);
      wanted.add(part);
    }
  }
  return loaded.order.filter((id) => wanted.has(id));
}
