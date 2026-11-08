// Review page (spec iteration 3, 2.1 step 2): one form per product of the
// invitation token, products named from the embedded catalogue (unknown SKUs
// are skipped), each posted to POST /api/reviews.
import {
  errorMessage,
  isBusy,
  liveRevalidation,
  readFormStrings,
  setBusy,
  setFieldError,
  setStatus,
  showDone,
  validateFields,
  value,
  type FormStrings,
} from '../forms/kit';
import { decodeReviewToken, isExpired } from '../forms/review-token';
import { postJson } from './api';
import type { CartContext } from './context';
import { readJson } from './dom';
import type { ClientProduct } from '../catalog/build';

interface ReviewStrings {
  counter: string;
  success: string;
  ratingRequired: string;
  textMax: number;
}

/** Template ids carry "__ID__"; each clone gets its own prefix. */
function stampIds(root: DocumentFragment, prefix: string): void {
  for (const el of root.querySelectorAll('*')) {
    for (const attr of ['id', 'for', 'aria-describedby', 'aria-labelledby']) {
      const v = el.getAttribute(attr);
      if (v?.includes('__ID__')) el.setAttribute(attr, v.replaceAll('__ID__', prefix));
    }
  }
}

function bindForm(
  form: HTMLFormElement,
  product: ClientProduct,
  token: string,
  ctx: CartContext,
  s: FormStrings,
  rs: ReviewStrings,
): void {
  form.noValidate = true;
  liveRevalidation(form, s);
  const stars = form.querySelector<HTMLFieldSetElement>('[data-review-stars]')!;
  const text = form.querySelector<HTMLTextAreaElement>('textarea[name="text"]')!;
  const counter = form.querySelector<HTMLElement>('[data-review-counter]');
  const updateCounter = () => {
    if (counter)
      counter.textContent = ctx.fmt(rs.counter, { count: text.value.length, max: rs.textMax });
  };
  updateCounter();
  text.addEventListener('input', updateCounter);
  const rating = () =>
    Number(form.querySelector<HTMLInputElement>('input[name="rating"]:checked')?.value ?? 0);
  stars.addEventListener('change', () => setFieldError(stars, ''));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isBusy(form)) return;
    const rated = rating() >= 1 && rating() <= 5;
    setFieldError(stars, rated ? '' : rs.ratingRequired);
    const invalid = validateFields(form, s);
    if (!rated || invalid) {
      setStatus(form, '');
      (rated ? invalid : form.querySelector<HTMLElement>('input[name="rating"]'))?.focus();
      return;
    }
    setBusy(form, true, s);
    const title = value(form, 'title');
    const result = await postJson('/api/reviews', {
      token,
      sku: product.sku,
      rating: rating(),
      author: value(form, 'author'),
      ...(title ? { title } : {}),
      text: value(form, 'text'),
      locale: ctx.locale,
    });
    setBusy(form, false, s);
    if (result.ok) {
      showDone(form, ctx.fmt(rs.success, { name: product.name }));
      return;
    }
    // Already reviewed: nothing more to do with this form either.
    if (result.error.code === 'ALREADY_REVIEWED') {
      showDone(form, errorMessage(result.error, s));
      return;
    }
    setStatus(form, errorMessage(result.error, s), 'error');
  });
}

export function initReview(ctx: CartContext): void {
  const root = document.querySelector<HTMLElement>('[data-review-page]');
  const list = root?.querySelector<HTMLElement>('[data-review-list]');
  const template = root?.querySelector<HTMLTemplateElement>('template[data-review-template]');
  const s = readFormStrings();
  const rs = readJson<ReviewStrings>('rep-review-strings');
  if (!root || !list || !template || !s || !rs) return;
  const show = (sel: string) => {
    const el = root.querySelector<HTMLElement>(sel);
    if (el) el.hidden = false;
  };

  const token = new URLSearchParams(window.location.search).get('t');
  const payload = decodeReviewToken(token);
  if (!token || !payload) return show('[data-review-invalid]');
  if (isExpired(payload)) return show('[data-review-expired]');
  const products = payload.k
    .map((sku) => (Object.hasOwn(ctx.catalog.products, sku) ? ctx.catalog.products[sku] : null))
    .filter((p): p is ClientProduct => !!p);
  if (products.length === 0) return show('[data-review-invalid]');

  products.forEach((product, index) => {
    const clone = template.content.cloneNode(true) as DocumentFragment;
    stampIds(clone, `review-${index + 1}`);
    const name = clone.querySelector<HTMLElement>('[data-review-name]');
    if (name) name.textContent = product.name;
    const image = clone.querySelector<HTMLImageElement>('[data-review-image]');
    if (image) image.src = product.image;
    const form = clone.querySelector<HTMLFormElement>('form[data-form="review"]')!;
    form.dataset.sku = product.sku;
    bindForm(form, product, token, ctx, s, rs);
    list.append(clone);
  });
}
