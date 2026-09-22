// Trashes and deletes forever one scratch deck by id, through the product's own controls (File >
// Move to trash, then Delete forever on /decks/trash), and confirms the 404.
//   node destroy.mjs <deckId>
import { existsSync } from 'node:fs';
import { STORAGE_FILE, chromium, destroyDeck, newContext } from './lib.mjs';

const id = process.argv[2];
if (!id) throw new Error('usage: node destroy.mjs <deckId>');
const browser = await chromium.launch({ headless: true });
try {
  const context = await newContext(browser, {
    width: 1440,
    height: 900,
    theme: 'light',
    storageState: existsSync(STORAGE_FILE) ? STORAGE_FILE : null,
  });
  const page = await context.newPage();
  const result = await destroyDeck(page, id);
  console.log(JSON.stringify(result));
  await context.close();
} finally {
  await browser.close();
}
