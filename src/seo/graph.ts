// The schema.org graph of one page (spec 7). Pure: no Astro import, unit tested.
import { SITE, type Locale } from '../consts';
import type { Product, Settings, Stock } from '../content/schemas';
import { toCents } from '../i18n/format';

export const STORE_ID = `${SITE.url}/#store`;
export const WEBSITE_ID = `${SITE.url}/#website`;

export type PageKind = 'home' | 'shop' | 'category' | 'product' | 'faq' | 'page';

/** One breadcrumb step: a name and the absolute url it points at. */
export interface Crumb {
  name: string;
  url: string;
}

export interface StoreInfo {
  name: string;
  description: string;
  slogan: string;
  email: string;
  /** E.164, "+33775689108". */
  telephone: string;
  address: { street: string; postcode: string; city: string; country: string };
  /** Absolute URL. */
  logo: string;
  /** Absolute URL of a representative image. */
  image?: string;
  sameAs?: string[];
}

export interface ProductGraph {
  name: string;
  description: string;
  sku: string;
  /** Absolute image URLs, main image first. */
  images: string[];
  /** Integer cents. */
  priceCents: number;
  currency: string;
  stock: Stock;
  weightGrams: number;
  category?: string;
  originCountryCode?: string;
  /** The relay method: amount in cents and destination countries. */
  shipping?: { amountCents: number; countries: string[]; minDays?: number; maxDays?: number };
}

export interface GraphInput {
  kind: PageKind;
  /** Absolute url of the page, the same value as the canonical link. */
  canonical: string;
  locale: Locale;
  title: string;
  description: string;
  store: StoreInfo;
  breadcrumbs?: Crumb[];
  /** product pages */
  product?: ProductGraph;
  /** shop and category pages: the listed products */
  items?: Crumb[];
  /** FAQ page */
  faq?: Array<{ question: string; answer: string }>;
}

type Node = Record<string, unknown>;

export function robotsContent(noindex: boolean): string {
  return noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
}

const AVAILABILITY: Record<Stock, string> = {
  in_stock: 'https://schema.org/InStock',
  low: 'https://schema.org/LimitedAvailability',
  out: 'https://schema.org/OutOfStock',
};

export function availability(stock: Stock): string {
  return AVAILABILITY[stock];
}

/** Cents to the schema.org price string, "8.90". */
export function schemaPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function storeNode(store: StoreInfo): Node {
  return {
    '@type': 'OnlineStore',
    '@id': STORE_ID,
    name: store.name,
    url: `${SITE.url}/`,
    logo: store.logo,
    ...(store.image ? { image: store.image } : {}),
    description: store.description,
    slogan: store.slogan,
    email: store.email,
    telephone: store.telephone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: store.address.street,
      postalCode: store.address.postcode,
      addressLocality: store.address.city,
      addressCountry: store.address.country,
    },
    currenciesAccepted: 'EUR',
    ...(store.sameAs && store.sameAs.length > 0 ? { sameAs: store.sameAs } : {}),
  };
}

const PAGE_TYPE: Record<PageKind, string> = {
  home: 'WebPage',
  page: 'WebPage',
  product: 'ItemPage',
  shop: 'CollectionPage',
  category: 'CollectionPage',
  faq: 'FAQPage',
};

function productNode(input: GraphInput, p: ProductGraph): Node {
  const offer: Node = {
    '@type': 'Offer',
    url: input.canonical,
    price: schemaPrice(p.priceCents),
    priceCurrency: p.currency.toUpperCase(),
    availability: availability(p.stock),
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@id': STORE_ID },
  };
  if (p.shipping) {
    const details: Node = {
      '@type': 'OfferShippingDetails',
      shippingRate: {
        '@type': 'MonetaryAmount',
        value: schemaPrice(p.shipping.amountCents),
        currency: p.currency.toUpperCase(),
      },
      shippingDestination: p.shipping.countries.map((c) => ({
        '@type': 'DefinedRegion',
        addressCountry: c,
      })),
    };
    if (p.shipping.minDays !== undefined && p.shipping.maxDays !== undefined) {
      details.deliveryTime = {
        '@type': 'ShippingDeliveryTime',
        transitTime: {
          '@type': 'QuantitativeValue',
          minValue: p.shipping.minDays,
          maxValue: p.shipping.maxDays,
          unitCode: 'DAY',
        },
      };
    }
    offer.shippingDetails = details;
  }
  return {
    '@type': 'Product',
    '@id': `${input.canonical}#product`,
    name: p.name,
    description: p.description,
    sku: p.sku,
    image: p.images,
    url: input.canonical,
    brand: { '@type': 'Brand', name: input.store.name },
    ...(p.category ? { category: p.category } : {}),
    weight: { '@type': 'QuantitativeValue', value: p.weightGrams, unitCode: 'GRM' },
    ...(p.originCountryCode
      ? { countryOfOrigin: { '@type': 'Country', name: p.originCountryCode } }
      : {}),
    offers: offer,
  };
}

/**
 * Product node input from a merged product: offer in EUR, shipping details
 * from the relay method (the first enabled method when relay is off), delivery
 * days read from its French estimate ("3 à 5 jours ouvrés").
 */
export function productGraphInput(
  p: Product,
  settings: Settings,
  imageUrls: string[],
  categoryName?: string,
): ProductGraph {
  const enabled = settings.shipping.filter((s) => s.enabled);
  const method = enabled.find((s) => s.id === 'relay') ?? enabled[0];
  const days = method?.estimate.fr.match(/(\d+)\D+(\d+)/);
  return {
    name: p.name,
    description: p.seoDescription ?? p.description,
    sku: p.sku,
    images: imageUrls,
    priceCents: toCents(p.price),
    currency: settings.shop.currency,
    stock: p.stock,
    weightGrams: p.weightGrams,
    category: categoryName,
    originCountryCode: p.originCountryCode,
    shipping: method && {
      amountCents: toCents(method.price),
      countries: method.countries,
      ...(days ? { minDays: Number(days[1]), maxDays: Number(days[2]) } : {}),
    },
  };
}

/**
 * The schema.org graph of one page. The store and the site are the same nodes
 * everywhere, referenced by `@id`; the page node is typed by its kind
 * (CollectionPage on shop and category, FAQPage on the FAQ, ItemPage on a
 * product, WebPage otherwise) and adds breadcrumbs, a product or a list.
 */
export function buildGraph(input: GraphInput): { '@context': string; '@graph': Node[] } {
  const { canonical, locale, title, description, kind } = input;
  const page: Node = {
    '@type': PAGE_TYPE[kind],
    '@id': canonical,
    url: canonical,
    name: title,
    description,
    inLanguage: locale,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': STORE_ID },
  };
  const graph: Node[] = [
    storeNode(input.store),
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      url: `${SITE.url}/`,
      name: input.store.name,
      inLanguage: ['fr', 'en'],
      publisher: { '@id': STORE_ID },
    },
    page,
  ];
  if (input.breadcrumbs?.length) {
    page.breadcrumb = { '@id': `${canonical}#breadcrumbs` };
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumbs`,
      itemListElement: input.breadcrumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    });
  }
  if (kind === 'product' && input.product) {
    page.mainEntity = { '@id': `${canonical}#product` };
    graph.push(productNode(input, input.product));
  }
  if ((kind === 'shop' || kind === 'category') && input.items?.length) {
    page.mainEntity = {
      '@type': 'ItemList',
      numberOfItems: input.items.length,
      itemListElement: input.items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    };
  }
  if (kind === 'faq' && input.faq?.length) {
    page.mainEntity = input.faq.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    }));
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** The JSON-LD script body: `<` escaped so the text can never close the tag. */
export function serializeGraph(graph: ReturnType<typeof buildGraph>): string {
  return JSON.stringify(graph).replaceAll('<', '\\u003c');
}
