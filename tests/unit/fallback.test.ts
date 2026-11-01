import { describe, expect, it } from 'vitest';
import {
  deepFallback,
  escapeHtml,
  interpolate,
  interpolateHtml,
  pickLabel,
} from '../../src/i18n/fallback';

describe('deepFallback', () => {
  it('fills empty strings, empty arrays and missing keys, recursively', () => {
    const fr = { a: 'A', list: ['x', 'y'], nested: { b: 'B', c: 'C' }, extra: 'E' };
    const en = { a: '', list: [], nested: { b: 'b-en', c: '  ' } };
    expect(deepFallback(en as unknown as typeof fr, fr)).toEqual({
      a: 'A',
      list: ['x', 'y'],
      nested: { b: 'b-en', c: 'C' },
      extra: 'E',
    });
  });
  it('keeps translated values and merges arrays of objects by index', () => {
    const fr = {
      items: [
        { q: 'Q1', a: 'A1' },
        { q: 'Q2', a: 'A2' },
      ],
    };
    const en = {
      items: [
        { q: 'q1', a: '' },
        { q: '', a: 'a2' },
      ],
    };
    expect(deepFallback(en, fr)).toEqual({
      items: [
        { q: 'q1', a: 'A1' },
        { q: 'Q2', a: 'a2' },
      ],
    });
  });
  it('treats null as missing and keeps numbers and booleans', () => {
    const fr = { n: 1, ok: true, s: 'S' };
    expect(deepFallback({ n: 0, ok: false, s: null } as unknown as typeof fr, fr)).toEqual({
      n: 0,
      ok: false,
      s: 'S',
    });
  });
});

describe('interpolate', () => {
  it('replaces known tokens and leaves unknown ones', () => {
    expect(interpolate('{a} et {b}, {c}', { a: 'un', b: 2 })).toBe('un et 2, {c}');
  });
  it('replaces every occurrence', () => {
    expect(interpolate('{x}{x}', { x: 'y' })).toBe('yy');
  });
  it('escapes values for HTML only in interpolateHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
    expect(interpolateHtml('<p>{company}</p>', { company: 'A & B <i>' })).toBe(
      '<p>A &amp; B &lt;i&gt;</p>',
    );
  });
});

describe('pickLabel', () => {
  it('returns the locale label, French when the translation is empty', () => {
    expect(pickLabel({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello');
    expect(pickLabel({ fr: 'Bonjour', en: ' ' }, 'en')).toBe('Bonjour');
    expect(pickLabel({ fr: 'Bonjour', en: 'Hello' }, 'fr')).toBe('Bonjour');
  });
});
