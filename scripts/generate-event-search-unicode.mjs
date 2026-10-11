import { writeFileSync } from 'node:fs';
// Re-run when upgrading the project's Unicode runtime. No database writes.
const folds = new Map();
for (let code = 128; code <= 0x10ffff; code++) {
  if (code >= 0xac00 && code <= 0xd7a3) continue;
  const char = String.fromCodePoint(code);
  const value = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sk');
  if (value !== char) folds.set(char, value);
}
const singles = [...folds].filter(([, value]) => [...value].length === 1);
const others = [...folds].filter(([, value]) => [...value].length !== 1);
const header = '// Generated from Unicode NFD + removal of U+0300–U+036F + Slovak lowercase.\n// Hangul decomposition is handled arithmetically in event-listing.ts.\n// Static tables avoid Unicode scanning during Worker startup.\n';
writeFileSync(new URL('../lib/event-search-unicode.ts', import.meta.url), header
  + 'export const eventFoldSource = ' + JSON.stringify(singles.map(([char]) => char).join('')) + ';\n'
  + 'export const eventFoldTarget = ' + JSON.stringify(singles.map(([, value]) => value).join('')) + ';\n'
  + 'export const eventOtherFolds: [string, string][] = ' + JSON.stringify(others) + ';\n');
