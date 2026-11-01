// Go-live gate (spec 8). Fails while an owner input is missing: the SIREN,
// the price confirmation, or a TODO left in a legal text. Part of the launch
// checklist, not of CI: previews may deploy with placeholders, the live shop
// may not.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const problems = [];

const settings = parse(readFileSync(join(root, 'src/content/settings/shop.yml'), 'utf8'));
const siren = String(settings?.brand?.siren ?? '').replace(/\s/g, '');
if (!/^\d{9}$/.test(siren)) {
  problems.push('src/content/settings/shop.yml: brand.siren is empty or not 9 digits');
}
if (settings?.launch?.pricesConfirmed !== true) {
  problems.push('src/content/settings/shop.yml: launch.pricesConfirmed is not true');
}

const legalDir = join(root, 'src/content/legal');
for (const locale of readdirSync(legalDir)) {
  for (const file of readdirSync(join(legalDir, locale)).filter((f) => f.endsWith('.md'))) {
    const lines = readFileSync(join(legalDir, locale, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('TODO')) {
        problems.push(`src/content/legal/${locale}/${file}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

if (problems.length > 0) {
  console.error(`launch-check: ${problems.length} item(s) to settle before going live:`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log('launch-check: SIREN set, prices confirmed, no TODO in the legal texts.');
