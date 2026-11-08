import { describe, expect, it } from 'vitest';
import { addressLine, displayPhone, relayAddressLines } from '../../src/cart/address';
import { displayCase } from '../../src/cart/relay';

describe('relayAddressLines', () => {
  const full = {
    address1: '2 RUE DE LA GARE',
    address2: 'CENTRE COMMERCIAL',
    postcode: '95400',
    city: 'ARNOUVILLE',
    country: 'FR',
  };

  it('prints every line with the country, in the page locale', () => {
    expect(relayAddressLines(full, 'fr')).toEqual([
      '2 Rue De La Gare',
      'Centre Commercial',
      '95400 Arnouville',
      'France',
    ]);
    expect(relayAddressLines({ ...full, country: 'BE' }, 'en').at(-1)).toBe('Belgium');
  });

  it('renders a partial relay with the fields it has, without throwing', () => {
    expect(
      relayAddressLines({ postcode: '95400', city: 'ARNOUVILLE', country: 'FR' }, 'fr'),
    ).toEqual(['95400 Arnouville', 'France']);
    expect(relayAddressLines({ address1: 'Rue X', city: 'Lyon' }, 'fr')).toEqual(['Rue X', 'Lyon']);
    expect(relayAddressLines({ address1: 42, postcode: null, country: 'nope' }, 'fr')).toEqual([]);
    expect(relayAddressLines({}, 'en')).toEqual([]);
  });

  it('displayCase tolerates a missing value', () => {
    expect(displayCase(undefined)).toBe('');
    expect(displayCase(null)).toBe('');
    expect(displayCase('LOCKER 24/7 LIDL')).toBe('Locker 24/7 Lidl');
  });
});

describe('shop address and phone (spec 8.4)', () => {
  const address = {
    street: '9 Rue du Marché',
    postcode: '95400',
    city: 'Arnouville',
    country: 'FR',
  };
  it('ends the address with the country', () => {
    expect(addressLine(address, 'fr')).toBe('9 Rue du Marché, 95400 Arnouville, France');
    expect(addressLine(address, 'en')).toBe('9 Rue du Marché, 95400 Arnouville, France');
  });
  it('prints the phone nationally in French, internationally in English', () => {
    expect(displayPhone('0775689108', 'fr')).toBe('07 75 68 91 08');
    expect(displayPhone('0775689108', 'en')).toBe('+33 7 75 68 91 08');
  });
});
