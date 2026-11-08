// Go-live gate (spec 8). Fails while an owner input is missing: the SIRET,
// the price confirmation, or a TODO left in a legal text; and while a setting
// still switches a feature off: the Turnstile site key (without it the
// contact, newsletter, stock alert and sign-in forms answer CAPTCHA_FAILED),
// the Mondial Relay brand (BDTEST is the test code), the FORMS_KV binding (the
// daily form e-mail ceiling). Part of the launch checklist, not of CI:
// previews may deploy with placeholders, the live shop may not.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** Luhn checksum over the digits of a SIRET (or any SIREN-style number). */
function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const root = fileURLToPath(new URL('../', import.meta.url));
const problems = [];

const settings = parse(readFileSync(join(root, 'src/content/settings/shop.yml'), 'utf8'));
const siret = String(settings?.brand?.siret ?? '').replace(/\s/g, '');
if (!/^\d{14}$/.test(siret)) {
  problems.push('src/content/settings/shop.yml: brand.siret is empty or not 14 digits');
} else if (!luhnValid(siret)) {
  problems.push(
    `src/content/settings/shop.yml: brand.siret ${siret} fails the Luhn checksum (typing error?)`,
  );
}
if (settings?.launch?.pricesConfirmed !== true) {
  problems.push('src/content/settings/shop.yml: launch.pricesConfirmed is not true');
}

if (!String(settings?.forms?.turnstileSiteKey ?? '').trim()) {
  problems.push(
    'src/content/settings/shop.yml: forms.turnstileSiteKey is empty (contact, newsletter, stock alert and sign-in forms would answer CAPTCHA_FAILED)',
  );
}

/** The value of `name` in a dotenv file, or undefined (no quotes handling beyond one pair). */
function dotenvValue(text, name) {
  const line = text.split('\n').find((l) => l.trim().startsWith(`${name}=`));
  return line
    ?.slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
}
// The build reads the environment first, then .env (Workers Builds sets a build variable).
const envFile = join(root, '.env');
const relayBrand =
  process.env.PUBLIC_MONDIAL_RELAY_BRAND ??
  (existsSync(envFile)
    ? (dotenvValue(readFileSync(envFile, 'utf8'), 'PUBLIC_MONDIAL_RELAY_BRAND') ?? '')
    : undefined);
if (relayBrand === undefined) {
  problems.push(
    'no .env: relay brand unknown (PUBLIC_MONDIAL_RELAY_BRAND, same value as the Workers Builds variable)',
  );
} else if (!relayBrand.trim() || relayBrand.trim().toUpperCase() === 'BDTEST') {
  problems.push(
    `${process.env.PUBLIC_MONDIAL_RELAY_BRAND === undefined ? '.env' : 'environment'}: PUBLIC_MONDIAL_RELAY_BRAND is ${relayBrand.trim() ? 'BDTEST (the test code)' : 'unset'}, not the owner's Mondial Relay code`,
  );
}

const wrangler = readFileSync(join(root, 'wrangler.jsonc'), 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');
if (!/"binding"\s*:\s*"FORMS_KV"/.test(wrangler)) {
  problems.push(
    'wrangler.jsonc: the FORMS_KV binding is still commented out (no daily ceiling on form e-mails)',
  );
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
console.log(
  'launch-check: SIRET set and valid, prices confirmed, no TODO in the legal texts, Turnstile site key set, relay brand set, FORMS_KV bound.',
);
