import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mergeProduct } from '../../src/content/merge';
import { settingsSchema } from '../../src/content/schemas';
import {
  STORE_ID,
  WEBSITE_ID,
  availability,
  buildGraph,
  productGraphInput,
  robotsContent,
  schemaPrice,
  serializeGraph,
  type GraphInput,
} from '../../src/seo/graph';
import { CONTENT, readYaml, yamlFolder } from './helpers';

const store: GraphInput['store'] = {
  name: 'Racines en Partage',
  description: 'Poudres et tisanes',
  slogan: 'Deux terres. Un rituel. Un bien-être à partager.',
  email: 'racinesenpartage@outlook.com',
  telephone: '+33775689108',
  address: { street: '9 Rue du Marché', postcode: '95400', city: 'Arnouville', country: 'FR' },
  logo: 'https://racinesenpartage.fr/icons/icon-512.png',
};
const home: GraphInput = {
  kind: 'home',
  canonical: 'https://racinesenpartage.fr/',
  locale: 'fr',
  title: 'Racines en Partage',
  description: 'Accueil',
  store,
};
const types = (input: GraphInput) => buildGraph(input)['@graph'].map((n) => n['@type']);
const node = (input: GraphInput, type: string) =>
  buildGraph(input)['@graph'].find((n) => n['@type'] === type) as Record<string, any> | undefined;

const settings = settingsSchema.parse(readYaml(join(CONTENT, 'settings/shop.yml')));
const moringa = mergeProduct(
  'poudre-de-moringa-100g',
  yamlFolder('products', 'fr').get('poudre-de-moringa-100g'),
);

describe('seo graph', () => {
  it('always carries the store, the site and the page', () => {
    expect(types(home)).toEqual(['OnlineStore', 'WebSite', 'WebPage']);
    expect(buildGraph(home)['@context']).toBe('https://schema.org');
  });
  it('describes the store with its address, phone and e-mail', () => {
    const org = node(home, 'OnlineStore');
    expect(org?.['@id']).toBe(STORE_ID);
    expect(org?.telephone).toBe('+33775689108');
    expect(org?.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '9 Rue du Marché',
      postalCode: '95400',
      addressLocality: 'Arnouville',
      addressCountry: 'FR',
    });
    expect(org?.sameAs).toBeUndefined();
    expect(
      node({ ...home, store: { ...store, sameAs: ['https://instagram.com/x'] } }, 'OnlineStore')
        ?.sameAs,
    ).toEqual(['https://instagram.com/x']);
  });
  it('ties the page to the site and the store by id', () => {
    const page = node(home, 'WebPage');
    expect(page?.['@id']).toBe('https://racinesenpartage.fr/');
    expect(page?.isPartOf).toEqual({ '@id': WEBSITE_ID });
    expect(page?.about).toEqual({ '@id': STORE_ID });
    expect(page?.inLanguage).toBe('fr');
  });
  it('types shop and category pages as CollectionPage with their item list', () => {
    const shop: GraphInput = {
      ...home,
      kind: 'category',
      canonical: 'https://racinesenpartage.fr/boutique/cacao/',
      breadcrumbs: [
        { name: 'Accueil', url: 'https://racinesenpartage.fr/' },
        { name: 'Boutique', url: 'https://racinesenpartage.fr/boutique/' },
        { name: 'Cacao', url: 'https://racinesenpartage.fr/boutique/cacao/' },
      ],
      items: [{ name: 'Grués', url: 'https://racinesenpartage.fr/produits/grues-de-cacao-100g/' }],
    };
    expect(types(shop)).toEqual(['OnlineStore', 'WebSite', 'CollectionPage', 'BreadcrumbList']);
    const page = node(shop, 'CollectionPage');
    expect(page?.mainEntity.numberOfItems).toBe(1);
    expect(page?.breadcrumb).toEqual({ '@id': `${shop.canonical}#breadcrumbs` });
    expect(node(shop, 'BreadcrumbList')?.itemListElement.map((i: any) => i.position)).toEqual([
      1, 2, 3,
    ]);
  });
  it('adds a Product with an Offer on product pages', () => {
    const input: GraphInput = {
      ...home,
      kind: 'product',
      canonical: 'https://racinesenpartage.fr/produits/poudre-de-moringa-100g/',
      product: productGraphInput(
        moringa,
        settings,
        ['https://racinesenpartage.fr/_astro/m.webp'],
        'Poudres',
      ),
    };
    const product = node(input, 'Product');
    expect(product?.sku).toBe('REP-MOR-100');
    expect(product?.countryOfOrigin).toEqual({ '@type': 'Country', name: 'NE' });
    expect(product?.weight).toEqual({ '@type': 'QuantitativeValue', value: 100, unitCode: 'GRM' });
    expect(product?.offers).toMatchObject({
      '@type': 'Offer',
      price: '8.90',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': STORE_ID },
    });
    expect(product?.offers.shippingDetails.shippingRate).toEqual({
      '@type': 'MonetaryAmount',
      value: '4.90',
      currency: 'EUR',
    });
    expect(
      product?.offers.shippingDetails.shippingDestination.map((d: any) => d.addressCountry),
    ).toEqual(['FR', 'BE', 'LU']);
    expect(product?.offers.shippingDetails.deliveryTime.transitTime).toMatchObject({
      minValue: 3,
      maxValue: 5,
    });
    expect(node(input, 'ItemPage')?.mainEntity).toEqual({ '@id': `${input.canonical}#product` });
  });
  it('turns the FAQ into questions', () => {
    const faq = node({ ...home, kind: 'faq', faq: [{ question: 'Q ?', answer: 'R.' }] }, 'FAQPage');
    expect(faq?.mainEntity).toEqual([
      { '@type': 'Question', name: 'Q ?', acceptedAnswer: { '@type': 'Answer', text: 'R.' } },
    ]);
  });
  it('maps stock to availability and cents to price strings', () => {
    expect(availability('low')).toBe('https://schema.org/LimitedAvailability');
    expect(availability('out')).toBe('https://schema.org/OutOfStock');
    expect(schemaPrice(1590)).toBe('15.90');
  });
  it('escapes < so the script can never be closed', () => {
    const out = serializeGraph(buildGraph({ ...home, title: '</script><b>' }));
    expect(out).not.toContain('<');
    expect(JSON.parse(out)['@graph'][2].name).toBe('</script><b>');
  });
  it('says index or noindex, never both', () => {
    expect(robotsContent(false)).toBe('index, follow, max-image-preview:large');
    expect(robotsContent(true)).toBe('noindex, nofollow');
  });
});
