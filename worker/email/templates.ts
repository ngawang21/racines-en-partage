// Order e-mails (spec 6.3): the owner's, always in French, and the customer's,
// in the checkout locale. HTML with inline styles plus a plain-text twin.
import { INTL_LOCALE } from '../../src/consts';
import { escapeHtml } from '../../src/i18n/fallback';
import { formatPhone, formatPrice } from '../../src/i18n/format';
import { frenchTypographyHtml, frenchTypographyText } from '../../src/i18n/typography';
import type { OrderSummary, PostalAddress } from '../orders';
import { SHOP, STRIPE_DASHBOARD_PAYMENT_URL } from '../shop';
import type { Delivery, Locale } from '../types';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const C = {
  cream: '#fbf6ea',
  forest: '#163a1c',
  hibiscus: '#e03a3a',
  kraft: '#d8b98e',
  white: '#ffffff',
  muted: '#4a5d4c',
} as const;

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const esc = escapeHtml;

const COUNTRY_NAMES: Record<Locale, Record<string, string>> = {
  fr: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' },
  en: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg' },
};

function countryName(code: string | null, locale: Locale): string {
  if (!code) return '';
  return COUNTRY_NAMES[locale][code] ?? code;
}

/** "+33612345678" or "0612345678" to "06 12 34 56 78"; other numbers unchanged. */
function displayPhone(raw: string): string {
  const compact = raw.replace(/[\s.-]/g, '');
  return /^\+33\d{9}$/.test(compact) ? formatPhone(`0${compact.slice(3)}`) : formatPhone(raw);
}

function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date);
}

function addressLines(address: PostalAddress | null, locale: Locale): string[] {
  if (!address) return [];
  return [
    address.line1,
    address.line2,
    [address.postcode, address.city].filter(Boolean).join(' '),
    address.state,
    countryName(address.country, locale),
  ].filter((l): l is string => Boolean(l && l.trim()));
}

function relayLines(delivery: Extract<Delivery, { method: 'relay' }>, locale: Locale): string[] {
  const r = delivery.relay;
  return [r.name, r.address1, `${r.postcode} ${r.city}`, countryName(r.country, locale)].filter(
    Boolean,
  );
}

const SHOP_ADDRESS_LINES = [SHOP.address.street, `${SHOP.address.postcode} ${SHOP.address.city}`];

// HTML building blocks -------------------------------------------------------

function layout(locale: Locale, title: string, preheader: string, body: string): string {
  return [
    '<!doctype html>',
    `<html lang="${locale}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${C.cream};color:${C.forest};font-family:${SANS};">`,
    `<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};">`,
    '<tr><td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.white};border:1px solid ${C.kraft};border-radius:8px;overflow:hidden;">`,
    `<tr><td style="background:${C.forest};color:${C.cream};padding:20px 28px;font-family:${SERIF};font-size:22px;letter-spacing:0.5px;">${esc(SHOP.name)}</td></tr>`,
    `<tr><td style="height:4px;line-height:4px;font-size:0;background:${C.hibiscus};">&nbsp;</td></tr>`,
    `<tr><td style="padding:28px;font-size:15px;line-height:1.55;color:${C.forest};">${body}</td></tr>`,
    `<tr><td style="background:${C.kraft};color:${C.forest};padding:16px 28px;font-size:12px;line-height:1.5;">${esc(SHOP.name)} · ${esc(SHOP.address.street)}, ${esc(SHOP.address.postcode)} ${esc(SHOP.address.city)} · <a href="mailto:${esc(SHOP.email)}" style="color:${C.forest};">${esc(SHOP.email)}</a></td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('\n');
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${SERIF};font-size:24px;font-weight:normal;color:${C.forest};">${esc(text)}</h1>`;
}

function subheading(text: string): string {
  return `<h2 style="margin:24px 0 8px;font-family:${SERIF};font-size:18px;font-weight:normal;color:${C.forest};border-bottom:1px solid ${C.kraft};padding-bottom:4px;">${esc(text)}</h2>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 12px;">${html}</p>`;
}

function block(lines: string[]): string {
  return `<p style="margin:0 0 12px;padding:12px 16px;background:${C.cream};border-left:3px solid ${C.hibiscus};">${lines.map(esc).join('<br>')}</p>`;
}

function linesTable(summary: OrderSummary, locale: Locale, withSku: boolean): string {
  const cell = 'padding:8px 0;border-bottom:1px solid #eee3cf;vertical-align:top;';
  const rows = summary.lines
    .map((l) => {
      const sku =
        withSku && l.sku
          ? `<br><span style="color:${C.muted};font-size:12px;">${esc(l.sku)}</span>`
          : '';
      return `<tr><td style="${cell}">${esc(l.name)}${sku}</td><td style="${cell}text-align:center;white-space:nowrap;">× ${l.quantity}</td><td style="${cell}text-align:right;white-space:nowrap;">${esc(formatPrice(l.amount, locale))}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows}</table>`;
}

interface TotalsLabels {
  subtotal: string;
  shipping: string;
  free: string;
  discount: string;
  total: string;
}

function totalsRows(summary: OrderSummary, locale: Locale, t: TotalsLabels) {
  const a = summary.amounts;
  const rows: Array<[string, string]> = [
    [t.subtotal, formatPrice(a.subtotal, locale)],
    [t.shipping, a.shipping === 0 ? t.free : formatPrice(a.shipping, locale)],
  ];
  if (a.discount > 0) rows.push([t.discount, `−${formatPrice(a.discount, locale)}`]);
  rows.push([t.total, formatPrice(a.total, locale)]);
  return rows;
}

function totalsTable(rows: Array<[string, string]>): string {
  const last = rows.length - 1;
  const html = rows
    .map(([label, value], i) => {
      const strong =
        i === last ? `font-weight:bold;font-size:16px;border-top:1px solid ${C.kraft};` : '';
      return `<tr><td style="padding:6px 0;${strong}">${esc(label)}</td><td style="padding:6px 0;text-align:right;white-space:nowrap;${strong}">${esc(value)}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-top:8px;">${html}</table>`;
}

/** The relay point ID, large, above the point's details: what the label needs. */
function relayIdBox(id: string): string {
  return `<p style="margin:0 0 12px;padding:12px 16px;border:2px solid ${C.forest};border-radius:6px;font-size:13px;line-height:1.4;">N° du Point Relais<br><strong style="font-family:${SERIF};font-size:26px;letter-spacing:1px;color:${C.forest};">${esc(id)}</strong></p>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0;"><a href="${esc(href)}" style="display:inline-block;background:${C.hibiscus};color:${C.white};text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold;">${esc(label)}</a></p>`;
}

// Plain-text building blocks -------------------------------------------------

const colon = (locale: Locale) => (locale === 'fr' ? '\u00a0: ' : ': ');

function textLines(summary: OrderSummary, locale: Locale, withSku: boolean): string[] {
  return summary.lines.map((l) => {
    const sku = withSku && l.sku ? ` (${l.sku})` : '';
    return `- ${l.quantity} × ${l.name}${sku}${colon(locale)}${formatPrice(l.amount, locale)}`;
  });
}

function textTotals(rows: Array<[string, string]>, locale: Locale): string[] {
  return rows.map(([label, value]) => `${label}${colon(locale)}${value}`);
}

/** French no-break spaces on the final strings; English is returned as is. */
function typeset(locale: Locale, email: RenderedEmail): RenderedEmail {
  if (locale !== 'fr') return email;
  return {
    subject: frenchTypographyText(email.subject),
    html: frenchTypographyHtml(email.html),
    text: frenchTypographyText(email.text),
  };
}

/** Dashboard link of the payment; test-mode sessions open the test dashboard. */
export function stripePaymentUrl(summary: OrderSummary): string | null {
  if (!summary.paymentIntentId) return null;
  const base = summary.sessionId.startsWith('cs_test_')
    ? STRIPE_DASHBOARD_PAYMENT_URL.replace('/payments/', '/test/payments/')
    : STRIPE_DASHBOARD_PAYMENT_URL;
  return `${base}${summary.paymentIntentId}`;
}

// Owner e-mail (French) ------------------------------------------------------

const OWNER_METHOD: Record<Delivery['method'], string> = {
  relay: 'Point Relais Mondial Relay',
  home: 'Livraison à domicile (Colissimo)',
  pickup: 'Retrait à Arnouville',
};

const FR_TOTALS: TotalsLabels = {
  subtotal: 'Sous-total',
  shipping: 'Livraison',
  free: 'Offerte',
  discount: 'Remise',
  total: 'Total payé',
};

const EN_TOTALS: TotalsLabels = {
  subtotal: 'Subtotal',
  shipping: 'Delivery',
  free: 'Free',
  discount: 'Discount',
  total: 'Total paid',
};

export function renderOwnerEmail(summary: OrderSummary): RenderedEmail {
  const locale: Locale = 'fr';
  const c = summary.customer;
  const total = formatPrice(summary.amounts.total, locale);
  const subject = `Nouvelle commande ${summary.number} : ${total}`;
  const date = formatDateTime(summary.createdAt, locale);
  const method = summary.delivery ? OWNER_METHOD[summary.delivery.method] : 'Non précisé';
  const languageLine = `Langue du client : ${summary.locale === 'en' ? 'anglais' : 'français'}`;
  const paymentUrl = stripePaymentUrl(summary);
  const totals = totalsRows(summary, locale, FR_TOTALS);
  const units = summary.lines.reduce((n, l) => n + l.quantity, 0);

  const customerLines = [
    c.name ?? 'Nom non communiqué',
    c.email ?? 'E-mail non communiqué',
    c.phone ? displayPhone(c.phone) : 'Téléphone non communiqué',
  ];
  const billing = addressLines(c.billingAddress, locale);

  let deliveryTitle = `Livraison : ${method}`;
  let deliveryLines: string[] = [];
  let deliveryNote = '';
  let relayId: string | null = null;
  const d = summary.delivery;
  if (d?.method === 'relay') {
    relayId = d.relay.id;
    deliveryLines = relayLines(d, locale);
    // The name and address come from the customer's browser: the ID is what counts.
    deliveryNote =
      'Avant d’imprimer l’étiquette, vérifiez ce Point Relais avec son ID dans votre espace Mondial Relay.';
  } else if (d?.method === 'home') {
    deliveryLines = c.shipping
      ? [c.shipping.name, ...addressLines(c.shipping.address, locale)]
      : [];
    deliveryNote = 'Expédiez en Colissimo à cette adresse.';
  } else if (d?.method === 'pickup') {
    deliveryLines = SHOP_ADDRESS_LINES;
    deliveryNote = 'Contactez la cliente ou le client pour convenir du rendez-vous de retrait.';
  } else {
    deliveryTitle = 'Livraison : non précisée';
  }

  const html = layout(
    locale,
    subject,
    `${units} ${units > 1 ? 'produits' : 'produit'}, ${total}`,
    [
      heading(`Nouvelle commande ${summary.number}`),
      paragraph(`${esc(date)}<br>${esc(languageLine)}`),
      paymentUrl ? button(paymentUrl, 'Voir le paiement dans Stripe') : '',
      subheading('Articles'),
      linesTable(summary, locale, true),
      totalsTable(totals),
      subheading('Client'),
      block(customerLines),
      billing.length ? paragraph(`<strong>Adresse de facturation</strong>`) + block(billing) : '',
      subheading(deliveryTitle),
      relayId ? relayIdBox(relayId) : '',
      deliveryLines.length ? block(deliveryLines) : '',
      deliveryNote ? paragraph(esc(deliveryNote)) : '',
    ].join('\n'),
  );

  const text = [
    `Nouvelle commande ${summary.number}`,
    date,
    languageLine,
    '',
    'Articles',
    ...textLines(summary, locale, true),
    '',
    ...textTotals(totals, locale),
    '',
    'Client',
    ...customerLines,
    ...(billing.length ? ['', 'Adresse de facturation', ...billing] : []),
    '',
    deliveryTitle,
    ...(relayId ? [`N° DU POINT RELAIS : ${relayId}`, ''] : []),
    ...deliveryLines,
    ...(deliveryNote ? [deliveryNote] : []),
    ...(paymentUrl ? ['', `Paiement dans Stripe : ${paymentUrl}`] : []),
    '',
  ].join('\n');

  return typeset(locale, { subject, html, text });
}

// Customer e-mail (FR or EN) -------------------------------------------------

interface CustomerStrings {
  subject: (n: string) => string;
  heading: string;
  greeting: (name: string | null) => string;
  intro: (n: string) => string;
  items: string;
  totals: TotalsLabels;
  delivery: string;
  method: Record<Delivery['method'], string>;
  next: string;
  nextBy: Record<Delivery['method'], string>;
  contactTitle: string;
  /** Around the e-mail link and the phone number: "{before}{email}{between}{phone}{after}". */
  contact: { before: string; between: string; after: string };
  signature: string;
}

const CUSTOMER: Record<Locale, CustomerStrings> = {
  fr: {
    subject: (n) => `Votre commande n° ${n} est confirmée`,
    heading: 'Merci pour votre commande',
    greeting: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    intro: (n) =>
      `Nous avons bien reçu votre commande n° ${n} et votre paiement. Nous la préparons avec soin.`,
    items: 'Votre commande',
    totals: FR_TOTALS,
    delivery: 'Livraison',
    method: {
      relay: 'Point Relais Mondial Relay',
      home: 'Livraison à domicile (Colissimo)',
      pickup: 'Retrait gratuit à Arnouville',
    },
    next: 'Et maintenant ?',
    nextBy: {
      relay:
        'Nous préparons votre colis et le confions à Mondial Relay. Vous recevrez un SMS et un e-mail de Mondial Relay dès qu’il vous attend dans votre Point Relais. Pensez à vous munir d’une pièce d’identité pour le retirer.',
      home: 'Nous préparons votre colis et l’expédions en Colissimo. Vous recevrez le numéro de suivi dès son expédition.',
      pickup:
        'Nous vous contactons très vite par téléphone ou par e-mail pour convenir d’un rendez-vous de retrait.',
    },
    contactTitle: 'Une question ?',
    contact: {
      before: 'Répondez simplement à cet e-mail, écrivez-nous à ',
      between: ' ou appelez-nous au ',
      after: '.',
    },
    signature: 'À très bientôt,\nRacines en Partage',
  },
  en: {
    subject: (n) => `Your Racines en Partage order no. ${n}`,
    heading: 'Thank you for your order',
    greeting: (name) => (name ? `Hello ${name},` : 'Hello,'),
    intro: (n) =>
      `We have received your order no. ${n} and your payment. We are preparing it with care.`,
    items: 'Your order',
    totals: EN_TOTALS,
    delivery: 'Delivery',
    method: {
      relay: 'Mondial Relay pickup point',
      home: 'Home delivery (Colissimo)',
      pickup: 'Free collection in Arnouville',
    },
    next: 'What happens next?',
    nextBy: {
      relay:
        'We prepare your parcel and hand it to Mondial Relay. Mondial Relay will send you a text message and an e-mail as soon as it is waiting at your pickup point. Please bring photo ID when you collect it.',
      home: 'We prepare your parcel and ship it with Colissimo. You will receive the tracking number as soon as it has been dispatched.',
      pickup: 'We will contact you shortly by phone or e-mail to arrange a collection time.',
    },
    contactTitle: 'Any questions?',
    contact: {
      before: 'Simply reply to this e-mail, write to ',
      between: ' or call us on ',
      after: '.',
    },
    signature: 'Warm wishes,\nRacines en Partage',
  },
};

export function renderCustomerEmail(summary: OrderSummary): RenderedEmail {
  const locale = summary.locale;
  const t = CUSTOMER[locale];
  const c = summary.customer;
  const subject = t.subject(summary.number);
  const totals = totalsRows(summary, locale, t.totals);
  const d = summary.delivery;
  const methodLabel = d ? t.method[d.method] : (summary.deliveryLabel ?? '');

  let deliveryLines: string[] = [];
  if (d?.method === 'relay') deliveryLines = relayLines(d, locale);
  else if (d?.method === 'home' && c.shipping) {
    deliveryLines = [c.shipping.name, ...addressLines(c.shipping.address, locale)];
  } else if (d?.method === 'pickup') deliveryLines = SHOP_ADDRESS_LINES;
  const next = d ? t.nextBy[d.method] : '';
  const phone = formatPhone(SHOP.phone);

  const html = layout(
    locale,
    subject,
    t.intro(summary.number),
    [
      heading(t.heading),
      paragraph(esc(t.greeting(c.name))),
      paragraph(esc(t.intro(summary.number))),
      subheading(t.items),
      linesTable(summary, locale, false),
      totalsTable(totals),
      subheading(`${t.delivery}${colon(locale)}${methodLabel}`),
      deliveryLines.length ? block(deliveryLines) : '',
      next ? subheading(t.next) + paragraph(esc(next)) : '',
      subheading(t.contactTitle),
      paragraph(
        `${esc(t.contact.before)}<a href="mailto:${esc(SHOP.email)}" style="color:${C.forest};">${esc(SHOP.email)}</a>${esc(t.contact.between)}${esc(phone)}${esc(t.contact.after)}`,
      ),
      paragraph(esc(t.signature).replace('\n', '<br>')),
    ].join('\n'),
  );

  const text = [
    t.heading,
    '',
    t.greeting(c.name),
    t.intro(summary.number),
    '',
    t.items,
    ...textLines(summary, locale, false),
    '',
    ...textTotals(totals, locale),
    '',
    `${t.delivery}${colon(locale)}${methodLabel}`,
    ...deliveryLines,
    ...(next ? ['', t.next, next] : []),
    '',
    t.contactTitle,
    `${t.contact.before}${SHOP.email}${t.contact.between}${phone}${t.contact.after}`,
    '',
    t.signature,
    '',
  ].join('\n');

  return typeset(locale, { subject, html, text });
}
