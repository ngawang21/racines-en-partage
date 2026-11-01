import { describe, expect, it } from 'vitest';
import {
  renderCustomerEmail,
  renderOwnerEmail,
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
    expect(email.subject).toBe('Merci pour votre commande E5F6G7H8');
    expect(email.html).toMatchSnapshot('customer-fr.html');
    expect(email.text).toMatchSnapshot('customer-fr.txt');
  });

  it('EN customer e-mail (home, discount, free shipping) matches the snapshot', () => {
    const email = renderCustomerEmail(homeOrderEn());
    expect(email.subject).toBe('Thank you for your order E5F6G7H8');
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
      'ID Point Relais : FR-012345',
      'REP-MOR-100',
      'https://dashboard.stripe.com/test/payments/pi_3TestPaymentIntent',
      fr('17,80 €'),
    ]) {
      expect(text).toContain(expected);
    }
    expect(html).toContain(
      'href="https://dashboard.stripe.com/test/payments/pi_3TestPaymentIntent"',
    );
  });

  it('owner e-mail (EN home order) stays in French and shows the shipping address', () => {
    const { text } = renderOwnerEmail(homeOrderEn());
    expect(text).toContain('Livraison : Livraison à domicile (Colissimo)');
    expect(text).toContain('Langue du client : anglais');
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
      'Contacter le client pour convenir du rendez-vous',
    );
  });
});
