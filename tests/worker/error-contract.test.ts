// Every code the Worker can answer reaches the customer as a translated
// message: the storefront parses it and maps it to a non-empty string.
import { describe, expect, it } from 'vitest';
import en from '../../src/content/locales/en.json';
import fr from '../../src/content/locales/fr.json';
import { ERROR_KEY, parseApiError } from '../../src/cart/api';
import { ERROR_CODES } from '../../worker/errors';

describe('error codes, Worker to storefront', () => {
  it.each(ERROR_CODES)('%s is recognised and has a French and English message', (code) => {
    expect(parseApiError(400, { error: { code, message: 'x' } }).code).toBe(code);
    const key = ERROR_KEY[code] as keyof typeof fr.errors;
    expect(key).toBeTruthy();
    expect(fr.errors[key]?.trim()).toBeTruthy();
    expect(en.errors[key]?.trim()).toBeTruthy();
  });

  it('a response that is not the API (no body, an HTML error page) still has a message', () => {
    for (const key of [ERROR_KEY.UNKNOWN, ERROR_KEY.NETWORK] as Array<keyof typeof fr.errors>) {
      expect(fr.errors[key]).toBeTruthy();
      expect(en.errors[key]).toBeTruthy();
    }
  });
});
