import { defineConfig } from 'vitest/config';

// Worker handlers run in Node with fakes (Stripe, mailer, catalogue); no workerd needed.
export default defineConfig({
  test: {
    include: ['tests/worker/**/*.test.ts'],
    environment: 'node',
  },
});
