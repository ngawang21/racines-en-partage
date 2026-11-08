// A small YAML writer for flat mappings of strings, numbers and booleans (the
// review files). Every string is quoted, so no value can turn into a comment,
// a list, a mapping, a date or a boolean. The quote style is the one Prettier
// (`singleQuote: true`) keeps, so a committed file passes `prettier --check`.

export type YamlScalar = string | number | boolean;

/** Characters YAML forbids or reads as line breaks; the forms strip them first anyway. */
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\ufeff]/g;
/** Unpaired UTF-16 surrogates cannot be written as UTF-8. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

export function yamlString(value: string): string {
  const clean = value.replace(UNSAFE, ' ').replace(LONE_SURROGATE, '').replace(/\t/g, ' ');
  if (clean.includes('\n') || clean.includes('\\')) {
    // Only double quotes carry escapes: backslash first, then quotes and line breaks.
    const escaped = clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `"${escaped}"`;
  }
  if (clean.includes('"')) return `'${clean.replace(/'/g, "''")}'`;
  if (clean.includes("'")) return `"${clean}"`;
  return `'${clean}'`;
}

function scalar(value: YamlScalar): string {
  if (typeof value === 'string') return yamlString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (!Number.isFinite(value)) throw new Error('YAML: numbers must be finite');
  return String(value);
}

/** `key: value` lines in the given order, with a final newline. Keys are plain identifiers. */
export function toYaml(record: Record<string, YamlScalar>): string {
  return Object.entries(record)
    .map(([key, value]) => {
      if (!/^[a-z][A-Za-z0-9_]*$/.test(key)) throw new Error(`YAML: unsafe key ${key}`);
      return `${key}: ${scalar(value)}`;
    })
    .join('\n')
    .concat('\n');
}
