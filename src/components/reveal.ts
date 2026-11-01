// Scroll reveal for the home sections: elements marked [data-reveal] that
// start below the fold fade up once when they enter the viewport. Siblings
// under the same parent are staggered by 70 ms (at most five steps). Nothing
// is hidden without this script or under reduced motion (styles in
// global.css), and an element already on screen at load is never touched.

const STEP_MS = 70;
const MAX_STEPS = 5;

function initReveal(): void {
  const all = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
  if (all.length === 0) return;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const fold = window.innerHeight;
  const pending = all.filter((el) => el.getBoundingClientRect().top > fold);
  if (pending.length === 0) return;

  const reveal = (el: HTMLElement) => {
    el.classList.remove('is-pending');
    // Drop the delay once played so later hovers or reflows are not delayed.
    el.addEventListener('transitionend', () => el.style.removeProperty('--reveal-delay'), {
      once: true,
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        reveal(entry.target as HTMLElement);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );

  const steps = new Map<Element | null, number>();
  for (const el of pending) {
    const step = steps.get(el.parentElement) ?? 0;
    steps.set(el.parentElement, step + 1);
    if (step > 0)
      el.style.setProperty('--reveal-delay', `${Math.min(step, MAX_STEPS) * STEP_MS}ms`);
    el.classList.add('is-pending');
    observer.observe(el);
  }

  // Keyboard users and in-page search reach hidden content first: show it.
  document.addEventListener('focusin', (event) => {
    const host = (event.target as Element | null)?.closest<HTMLElement>('[data-reveal].is-pending');
    if (host) {
      observer.unobserve(host);
      reveal(host);
    }
  });
  // Printing from the middle of the page prints everything.
  window.addEventListener('beforeprint', () => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-reveal].is-pending')) reveal(el);
  });
}

initReveal();
