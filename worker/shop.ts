// Shop facts the Worker needs and `catalog.json` does not carry. They mirror
// `brand` in src/content/settings/shop.yml; a unit test keeps them in sync.
export const SHOP = {
  name: 'Racines en Partage',
  email: 'racinesenpartage@gmail.com',
  phone: '0775689108',
  address: { street: '9 Rue du Marché', postcode: '95400', city: 'Arnouville', country: 'FR' },
} as const;

export const STRIPE_DASHBOARD_PAYMENT_URL = 'https://dashboard.stripe.com/payments/';
