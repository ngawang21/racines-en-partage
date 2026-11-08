// Daily budget of form-triggered e-mails (contact, stock alert, newsletter
// confirmation), counted in Workers KV. It keeps a flood of form posts from
// spending the Resend quota the order e-mails need. KV is eventually
// consistent, so the count is approximate, which is enough for a ceiling.
import { describeError, logError } from './log';

export const DEFAULT_FORMS_DAILY_LIMIT = 60;
/** A day's key outlives the day, then KV drops it. */
export const BUDGET_TTL_SECONDS = 2 * 24 * 60 * 60;

/** The part of a KV namespace the budget uses (`KVNamespace` in workers-types). */
export interface BudgetStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Takes one unit of today's budget; false once it is spent. */
export interface FormsBudget {
  take(): Promise<boolean>;
}

/** `FORMS_DAILY_LIMIT` as a positive integer, 60 when unset or invalid. */
export function dailyLimit(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_FORMS_DAILY_LIMIT;
}

/** `forms:2026-11-08`, the UTC day. */
export function budgetKey(now: Date): string {
  return `forms:${now.toISOString().slice(0, 10)}`;
}

export function createKvBudget(store: BudgetStore, limit: number, now: () => Date): FormsBudget {
  return {
    async take() {
      const key = budgetKey(now());
      try {
        const used = Number((await store.get(key)) ?? '0') || 0;
        if (used >= limit) return false;
        await store.put(key, String(used + 1), { expirationTtl: BUDGET_TTL_SECONDS });
        return true;
      } catch (err) {
        // A KV outage must not close the contact form: count nothing, let it through.
        logError('forms.budget_unavailable', { error: describeError(err) });
        return true;
      }
    },
  };
}
