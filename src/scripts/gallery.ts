// Product gallery: a thumbnail button shows its photo; Left, Right, Home and
// End move between thumbnails (and show the photo). The button over the main
// photo opens the larger view, a modal <dialog>: its pictures are cloned from
// <template>s on first display (nothing loads before), Left and Right or the
// arrow buttons switch photos, Escape, the close button or a click outside
// the buttons close it, and focus returns to the opening button. Closing
// leaves the gallery on the photo last seen. No library; the script only
// toggles attributes (CSP: no inline style).

for (const gallery of document.querySelectorAll<HTMLElement>('[data-gallery]')) {
  const slides = [...gallery.querySelectorAll<HTMLElement>('[data-gallery-slide]')];
  const thumbs = [...gallery.querySelectorAll<HTMLButtonElement>('[data-gallery-thumb]')];
  const count = slides.length;
  let current = 0;

  const show = (index: number, focus = false) => {
    const i = (index + count) % count;
    current = i;
    slides.forEach((slide, n) => {
      slide.hidden = n !== i;
    });
    thumbs.forEach((thumb, n) => {
      thumb.setAttribute('aria-pressed', String(n === i));
    });
    if (focus) thumbs[i]?.focus();
  };

  if (thumbs.length > 1) {
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

  const opener = gallery.querySelector<HTMLButtonElement>('[data-gallery-open]');
  const dialog = gallery.querySelector<HTMLDialogElement>('[data-gallery-dialog]');
  const stage = dialog?.querySelector<HTMLElement>('[data-gallery-stage]');
  if (!opener || !dialog || !stage || typeof dialog.showModal !== 'function') continue;

  const templates = [...dialog.querySelectorAll<HTMLTemplateElement>('[data-gallery-large]')];
  const counter = dialog.querySelector<HTMLElement>('[data-gallery-count]');
  const large: Array<HTMLElement | undefined> = [];
  const total = templates.length;

  const showLarge = (index: number) => {
    const i = (index + total) % total;
    if (!large[i]) {
      const frame = document.createElement('div');
      frame.className = 'lightbox-frame';
      frame.dataset.galleryFrame = String(i);
      frame.append(templates[i]!.content.cloneNode(true));
      stage.append(frame);
      large[i] = frame;
    }
    large.forEach((frame, n) => {
      if (frame) frame.hidden = n !== i;
    });
    if (counter) counter.textContent = `${i + 1} / ${total}`;
    show(i);
  };

  opener.addEventListener('click', () => {
    showLarge(current);
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-gallery-close]')?.focus();
  });

  dialog.addEventListener('close', () => {
    opener.focus();
  });

  dialog.addEventListener('click', (event) => {
    const target = event.target as Element;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button) {
      dialog.close();
      return;
    }
    if (button.matches('[data-gallery-close]')) dialog.close();
    const step = Number(button.dataset.galleryStep);
    if (step) showLarge(current + step);
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' && total > 1) {
      event.preventDefault();
      showLarge(current + 1);
    } else if (event.key === 'ArrowLeft' && total > 1) {
      event.preventDefault();
      showLarge(current - 1);
    } else if (event.key === 'Tab') {
      // Keep Tab inside the dialog (the browser would otherwise leave the
      // page for its own interface after the last button).
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
}
