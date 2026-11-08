import { describe, expect, it } from 'vitest';
import {
  lookupUrl,
  renderContactEmail,
  renderCustomerEmail,
  renderLoginEmail,
  renderNewsletterConfirmation,
  renderOwnerEmail,
  renderReviewInvitation,
  renderStockAlertEmail,
  stripePaymentUrl,
} from '../../worker/email/templates';
import { summariseSession } from '../../worker/orders';
import { fr, sessionFixture } from './fixtures';

const relayOrder = () => summariseSession(sessionFixture());

const homeOrderEn = () =>
  summariseSession(
    sessionFixture({
      locale: 'en',
      amount_subtotal: 5340,
      amount_total: 4806,
      metadata: { locale: 'en', delivery_method: 'home', skus: 'REP-MOR-100' },
      shipping_cost: {
        amount_subtotal: 0,
        amount_tax: 0,
        amount_total: 0,
        shipping_rate: { id: 'shr_home', display_name: 'Home delivery (Colissimo)' },
      },
      total_details: { amount_discount: 534, amount_shipping: 0, amount_tax: 0 },
      collected_information: {
        business_name: null,
        individual_name: null,
        shipping_details: {
          name: 'John Smith',
          address: {
            line1: '1 Place de la Mairie',
            line2: 'Bât. B',
            postal_code: '75001',
            city: 'Paris',
            state: null,
            country: 'FR',
          },
        },
      },
      line_items: {
        object: 'list',
        has_more: false,
        url: '/v1/checkout/sessions/cs_test/line_items',
        data: [
          {
            id: 'li_1',
            description: 'Moringa powder 100 g',
            quantity: 6,
            amount_subtotal: 5340,
            amount_total: 4806,
            price: {
              unit_amount: 890,
              product: { id: 'prod_1', metadata: { sku: 'REP-MOR-100' } },
            },
          },
        ],
      },
    }),
  );

describe('order e-mails', () => {
  it('FR owner e-mail (relay) matches the snapshot', () => {
    const email = renderOwnerEmail(relayOrder());
    expect(email.subject).toBe(fr('Nouvelle commande E5F6G7H8 : 30,60 €'));
    expect(email.html).toMatchSnapshot('owner-fr.html');
    expect(email.text).toMatchSnapshot('owner-fr.txt');
  });

  it('FR customer e-mail (relay) matches the snapshot', () => {
    const email = renderCustomerEmail(relayOrder());
    expect(email.subject).toBe(fr('Votre commande n° E5F6G7H8 est confirmée'));
    expect(email.html).toMatchSnapshot('customer-fr.html');
    expect(email.text).toMatchSnapshot('customer-fr.txt');
  });

  it('EN customer e-mail (home, discount, free shipping) matches the snapshot', () => {
    const email = renderCustomerEmail(homeOrderEn());
    expect(email.subject).toBe('Your Racines en Partage order no. E5F6G7H8');
    expect(email.html).toMatchSnapshot('customer-en.html');
    expect(email.text).toMatchSnapshot('customer-en.txt');
  });

  it('owner e-mail carries what the owner needs to ship', () => {
    const { html, text } = renderOwnerEmail(relayOrder());
    for (const expected of [
      'Awa Diallo',
      'awa.diallo@example.com',
      '06 12 34 56 78',
      'Tabac de la Gare',
      '12 Avenue de la Gare, Galerie marchande',
      '95400 Arnouville',
      fr('N° DU POINT RELAIS : FR-012345'),
      'vérifiez ce Point Relais avec son ID dans votre espace Mondial Relay',
      'REP-MOR-100',
      'https://dashboard.stripe.com/test/payments/pi_3TestPaymentIntent',
      fr('17,80 €'),
    ]) {
      expect(text).toContain(expected);
    }
    expect(html).toContain(
      'href="https://dashboard.stripe.com/test/payments/pi_3TestPaymentIntent"',
    );
    // The relay ID stands out above the point's details, which come from the browser.
    const id = html.indexOf('>FR-012345</strong>');
    expect(id).toBeGreaterThan(-1);
    expect(id).toBeLessThan(html.indexOf('Tabac de la Gare'));
    expect(html).toContain('espace Mondial Relay');
  });

  it('owner e-mail (EN home order) stays in French and shows the shipping address', () => {
    const { text } = renderOwnerEmail(homeOrderEn());
    expect(text).toContain(fr('Livraison : Livraison à domicile (Colissimo)'));
    expect(text).toContain(fr('Langue du client : anglais'));
    expect(text).toContain('John Smith\n1 Place de la Mairie\nBât. B\n75001 Paris\nFrance');
    expect(text).toContain(fr('Remise : −5,34 €'));
  });

  it('live orders link to the live Stripe dashboard', () => {
    const summary = summariseSession(sessionFixture({ id: 'cs_live_a1B2c3D4e5F6g7H8' }));
    expect(stripePaymentUrl(summary)).toBe(
      'https://dashboard.stripe.com/payments/pi_3TestPaymentIntent',
    );
  });

  it('English amounts read "€8.90", French "8,90 €"', () => {
    expect(renderCustomerEmail(homeOrderEn()).text).toContain('Total paid: €48.06');
    expect(renderCustomerEmail(relayOrder()).text).toContain(fr('Total payé : 30,60 €'));
  });

  it('uses the brand colours inline', () => {
    const { html } = renderCustomerEmail(relayOrder());
    for (const colour of ['#fbf6ea', '#163a1c', '#e03a3a', '#d8b98e'])
      expect(html).toContain(colour);
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<script');
  });

  it('escapes customer-controlled text', () => {
    const summary = summariseSession(
      sessionFixture({
        customer_details: {
          name: '<img src=x onerror=alert(1)>',
          email: 'x@example.com',
          phone: null,
          address: null,
        },
      }),
    );
    const owner = renderOwnerEmail(summary).html;
    const customer = renderCustomerEmail(summary).html;
    for (const html of [owner, customer]) {
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });

  it('pickup: shop address and the appointment note', () => {
    const summary = summariseSession(
      sessionFixture({ metadata: { locale: 'fr', delivery_method: 'pickup' } }),
    );
    expect(renderCustomerEmail(summary).text).toContain('9 Rue du Marché\n95400 Arnouville');
    expect(renderOwnerEmail(summary).text).toContain(
      'Contactez la cliente ou le client pour convenir du rendez-vous',
    );
  });
});

describe('order lookup line in the customer e-mail', () => {
  it('links the lookup page of the order language, on SITE_URL', () => {
    expect(renderCustomerEmail(relayOrder()).text).toContain(
      fr('Retrouver ma commande à tout moment : https://racinesenpartage.fr/ma-commande/'),
    );
    expect(renderCustomerEmail(homeOrderEn()).text).toContain(
      'Find your order at any time: https://racinesenpartage.fr/en/my-order/',
    );
    expect(renderCustomerEmail(relayOrder(), 'http://localhost:8787/').html).toContain(
      'href="http://localhost:8787/ma-commande/"',
    );
    expect(lookupUrl('en')).toBe('https://racinesenpartage.fr/en/my-order/');
  });
});

describe('review invitation', () => {
  const input = {
    name: 'Awa Diallo',
    products: ['Poudre de moringa 100 g', 'Poudre de baobab 100 g'],
    url: 'https://racinesenpartage.fr/avis/?t=abc.def',
  };

  it('FR matches the snapshot', () => {
    const email = renderReviewInvitation({ ...input, locale: 'fr' });
    expect(email.subject).toBe('Votre avis compte pour nous');
    expect(email.html).toMatchSnapshot('invitation-fr.html');
    expect(email.text).toMatchSnapshot('invitation-fr.txt');
  });

  it('EN matches the snapshot', () => {
    const email = renderReviewInvitation({
      ...input,
      locale: 'en',
      name: null,
      products: ['Moringa powder 100 g'],
      url: 'https://racinesenpartage.fr/en/review/?t=abc.def',
    });
    expect(email.html).toMatchSnapshot('invitation-en.html');
    expect(email.text).toMatchSnapshot('invitation-en.txt');
  });

  it('one button to the token link, the products, the moderation line', () => {
    const { html, text } = renderReviewInvitation({ ...input, locale: 'fr' });
    expect(
      html.match(/<a href="https:\/\/racinesenpartage\.fr\/avis\/\?t=abc\.def"/g),
    ).toHaveLength(1);
    expect(html).toContain('>Donner mon avis</a>');
    expect(text).toContain(fr('- Poudre de moringa 100 g'));
    expect(text).toContain('Nous lisons chaque avis avant sa mise en ligne.');
  });

  it('escapes product names and the customer name', () => {
    const { html } = renderReviewInvitation({
      ...input,
      locale: 'fr',
      name: '<b>x</b>',
      products: ['<script>'],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('newsletter confirmation', () => {
  const url = 'https://racinesenpartage.fr/api/newsletter/confirm?t=abc.def';

  it('FR with a welcome code matches the snapshot', () => {
    const email = renderNewsletterConfirmation({ locale: 'fr', url, welcomeCode: 'BIENVENUE10' });
    expect(email.html).toMatchSnapshot('newsletter-fr.html');
    expect(email.text).toMatchSnapshot('newsletter-fr.txt');
    expect(email.html).toContain('>Confirmer mon inscription</a>');
  });

  it('EN without a code matches the snapshot', () => {
    const email = renderNewsletterConfirmation({ locale: 'en', url, welcomeCode: '' });
    expect(email.subject).toBe('Please confirm your newsletter subscription');
    expect(email.html).toMatchSnapshot('newsletter-en.html');
    expect(email.text).toMatchSnapshot('newsletter-en.txt');
    expect(email.text).not.toContain('discount code');
  });
});

describe('owner e-mails from the forms', () => {
  it('contact matches the snapshot and escapes the message', () => {
    const email = renderContactEmail({
      name: 'Awa Diallo',
      email: 'awa.diallo@example.com',
      message: 'Bonjour !\nAvez-vous du moringa en 500 g ? <b>merci</b> & "bises"',
      locale: 'fr',
    });
    expect(email.subject).toBe('Message du site de Awa Diallo');
    expect(email.html).toMatchSnapshot('contact.html');
    expect(email.text).toMatchSnapshot('contact.txt');
    expect(email.html).toContain('&lt;b&gt;merci&lt;/b&gt; &amp; &quot;bises&quot;');
    // The customer's words stay as typed: no typography added inside them.
    expect(email.text).toContain('Bonjour !\nAvez-vous du moringa en 500 g ?');
  });

  it('stock alert matches the snapshot', () => {
    const email = renderStockAlertEmail({
      email: 'john@example.com',
      name: '',
      product: 'Poudre de souchet 100 g',
      sku: 'REP-SOU-P100',
      locale: 'en',
    });
    expect(email.subject).toBe(
      fr('Alerte de stock : ') + 'Poudre de souchet 100 g pour john@example.com',
    );
    expect(email.html).toMatchSnapshot('stock-alert.html');
    expect(email.text).toMatchSnapshot('stock-alert.txt');
  });
});

describe('customer space sign-in link', () => {
  it('FR matches the snapshot: one button, 15 minutes, ignore if not asked', () => {
    const email = renderLoginEmail({
      locale: 'fr',
      url: 'https://racinesenpartage.fr/mon-compte/?t=abc.def',
    });
    expect(email.subject).toBe('Votre lien de connexion');
    expect(email.html).toMatchSnapshot('login-fr.html');
    expect(email.text).toMatchSnapshot('login-fr.txt');
    expect(email.html.match(/<a href="https:\/\/racinesenpartage\.fr\/mon-compte\//g)).toHaveLength(
      1,
    );
    expect(email.text).toContain('valable 15 minutes');
    expect(email.text).toContain('Si vous n’avez rien demandé, ignorez ce message');
  });

  it('EN matches the snapshot', () => {
    const email = renderLoginEmail({
      locale: 'en',
      url: 'https://racinesenpartage.fr/en/account/?t=abc.def',
    });
    expect(email.subject).toBe('Your sign-in link');
    expect(email.html).toMatchSnapshot('login-en.html');
    expect(email.text).toMatchSnapshot('login-en.txt');
  });
});
