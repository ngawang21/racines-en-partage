// The 404 page in one language: English when the missing path or the
// referring page of this site is under /en/, French otherwise. The switch
// link swaps the two blocks in place and moves focus to the new heading.

type Lang = 'fr' | 'en';

const blocks = new Map(
  [...document.querySelectorAll<HTMLElement>('[data-nf]')].map((el) => [el.dataset.nf, el]),
);

const isEnglishPath = (path: string) => path === '/en' || path.startsWith('/en/');

function fromReferrer(): string {
  try {
    const ref = new URL(document.referrer);
    return ref.origin === location.origin ? ref.pathname : '';
  } catch {
    return '';
  }
}

function show(lang: Lang, focus = false): void {
  for (const [key, el] of blocks) el.hidden = key !== lang;
  document.documentElement.lang = lang;
  if (focus) {
    const heading = blocks.get(lang)?.querySelector<HTMLElement>('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }
}

if (blocks.size === 2) {
  if (isEnglishPath(location.pathname) || isEnglishPath(fromReferrer())) show('en');
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-nf-switch]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      show(link.dataset.nfSwitch === 'en' ? 'en' : 'fr', true);
    });
  }
}
