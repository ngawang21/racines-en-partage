// Product gallery: a thumbnail button shows its photo; Left, Right, Home and
// End move between thumbnails (and show the photo). No library.

for (const gallery of document.querySelectorAll<HTMLElement>('[data-gallery]')) {
  const slides = [...gallery.querySelectorAll<HTMLElement>('[data-gallery-slide]')];
  const thumbs = [...gallery.querySelectorAll<HTMLButtonElement>('[data-gallery-thumb]')];
  if (thumbs.length < 2) continue;

  const show = (index: number, focus = false) => {
    const i = (index + thumbs.length) % thumbs.length;
    slides.forEach((slide, n) => {
      slide.hidden = n !== i;
    });
    thumbs.forEach((thumb, n) => {
      thumb.setAttribute('aria-pressed', String(n === i));
    });
    if (focus) thumbs[i]?.focus();
  };

  thumbs.forEach((thumb, n) => {
    thumb.addEventListener('click', () => show(n));
    thumb.addEventListener('keydown', (event) => {
      const moves: Record<string, number> = {
        ArrowRight: n + 1,
        ArrowDown: n + 1,
        ArrowLeft: n - 1,
        ArrowUp: n - 1,
        Home: 0,
        End: thumbs.length - 1,
      };
      const target = moves[event.key];
      if (target === undefined) return;
      event.preventDefault();
      show(target, true);
    });
  });
}
