// Product gallery: a thumbnail button shows its photo; Left, Right, Home and
// End move between thumbnails (and show the photo). The button over the main
// photo opens the larger view, a modal <dialog>: its pictures are cloned from
// <template>s on first display (nothing loads before), Left and Right or the
// arrow buttons switch photos, Escape, the close button or a click outside
// the photo and the buttons close it, and focus returns to the opening
// button. Closing leaves the gallery on the photo last seen. No library.
//
// Zoom (review 17): a click on the photo, Enter or Space on it, "+" or "-",
// the "+" and "−" buttons, or a double tap on touch toggle between the fitted
// photo and a 2x view. The 2x view pans with a drag, the wheel and the arrow
// keys, never beyond the photo's edges, and goes back to the whole photo when
// another photo is shown or the dialog closes. It is a CSS transform (no
// layout change around it), set through the CSSOM; on zooming, the picture's
// `sizes` doubles so the browser fetches the largest file (1200 px) instead
// of scaling up the one fitted to the screen.

/** The 2x view: never more, the files are capped at 1200 px on purpose. */
const SCALE = 2;
/** One arrow key press pans this far (CSS px). */
const PAN_STEP = 80;
/** Two taps closer than this are a double tap. */
const DOUBLE_TAP_MS = 320;
/** A press that moves further than this is a drag, not a click. */
const DRAG_SLOP = 4;

const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

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
  const zoomInButton = dialog.querySelector<HTMLButtonElement>('[data-gallery-zoom="in"]');
  const zoomOutButton = dialog.querySelector<HTMLButtonElement>('[data-gallery-zoom="out"]');
  const large: Array<HTMLElement | undefined> = [];
  const total = templates.length;

  // ------------------------------------------------------------------ zoom

  let zoomed = false;
  let tx = 0;
  let ty = 0;

  const currentImage = () => large[current]?.querySelector<HTMLImageElement>('img') ?? null;

  /** Applies the pan, kept so the scaled photo always covers the stage it overflows. */
  const applyTransform = () => {
    const img = currentImage();
    if (!img) return;
    if (!zoomed) {
      img.style.transform = '';
      return;
    }
    // offsetWidth ignores the transform: the fitted size.
    const limitX = Math.max(0, (img.offsetWidth * SCALE - stage.clientWidth) / 2);
    const limitY = Math.max(0, (img.offsetHeight * SCALE - stage.clientHeight) / 2);
    tx = clamp(tx, limitX);
    ty = clamp(ty, limitY);
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${SCALE})`;
  };

  /** Zooms in on `at` (a point on the screen, kept under the pointer) or the centre. */
  const setZoom = (on: boolean, at?: { x: number; y: number }) => {
    const img = currentImage();
    if (!img || on === zoomed) return;
    zoomed = on;
    tx = 0;
    ty = 0;
    if (on) {
      // The fitted file is chosen for the fitted size: ask for twice that.
      const wanted = `${Math.ceil(img.offsetWidth * SCALE)}px`;
      for (const el of img.parentElement?.querySelectorAll<HTMLImageElement | HTMLSourceElement>(
        'source, img',
      ) ?? [])
        if (el.sizes !== wanted) el.sizes = wanted;
      if (at) {
        const box = img.getBoundingClientRect();
        tx = -(SCALE - 1) * (at.x - (box.left + box.width / 2));
        ty = -(SCALE - 1) * (at.y - (box.top + box.height / 2));
      }
    }
    dialog.classList.toggle('is-zoomed', on);
    zoomInButton?.setAttribute('aria-disabled', String(on));
    zoomOutButton?.setAttribute('aria-disabled', String(!on));
    applyTransform();
  };

  const pan = (dx: number, dy: number) => {
    tx += dx;
    ty += dy;
    applyTransform();
  };

  // ---------------------------------------------------------------- photos

  const showLarge = (index: number) => {
    setZoom(false);
    const i = (index + total) % total;
    if (!large[i]) {
      const frame = document.createElement('div');
      frame.className = 'lightbox-frame';
      frame.dataset.galleryFrame = String(i);
      frame.append(templates[i]!.content.cloneNode(true));
      // The photo takes the keyboard too: Enter or Space zooms.
      const img = frame.querySelector('img');
      img?.setAttribute('tabindex', '0');
      // A drag pans; the browser's own image drag would take the pointer.
      if (img) img.draggable = false;
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
    setZoom(false);
    opener.focus();
  });

  // ------------------------------------------------------- pointer and taps

  let drag: { id: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null =
    null;
  const pointers = new Set<number>();
  let pointerType = 'mouse';
  let suppressClick = false;
  let lastTap = 0;
  let wheelTimer: number | undefined;

  stage.addEventListener('pointerdown', (event) => {
    pointers.add(event.pointerId);
    pointerType = event.pointerType;
    suppressClick = false;
    // A second finger: the browser's pinch takes over.
    if (pointers.size > 1) {
      drag = null;
      dialog.classList.remove('is-dragging');
      return;
    }
    const img = (event.target as Element).closest('img');
    if (!zoomed || !img || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, tx, ty, moved: false };
    img.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!drag.moved) {
      drag.moved = true;
      dialog.classList.add('is-dragging');
    }
    tx = drag.tx + dx;
    ty = drag.ty + dy;
    applyTransform();
  });
  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (!drag || drag.id !== event.pointerId) return;
    // The click that ends a drag does not toggle the zoom.
    if (drag.moved) suppressClick = true;
    drag = null;
    dialog.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  stage.addEventListener(
    'wheel',
    (event) => {
      if (!zoomed || event.ctrlKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      // Shift and a vertical wheel scroll sideways, as on a page.
      const [dx, dy] =
        event.shiftKey && event.deltaX === 0 ? [event.deltaY, 0] : [event.deltaX, event.deltaY];
      dialog.classList.add('is-dragging');
      pan(-dx * unit, -dy * unit);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => dialog.classList.remove('is-dragging'), 120);
    },
    { passive: false },
  );

  window.addEventListener('resize', () => {
    if (zoomed) applyTransform();
  });

  dialog.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const photo = target.closest('.lightbox-frame img');
    if (photo) {
      const at = { x: event.clientX, y: event.clientY };
      if (pointerType === 'touch') {
        // One tap does nothing (it would fight the pinch); two toggle.
        if (event.timeStamp - lastTap < DOUBLE_TAP_MS) {
          lastTap = 0;
          setZoom(!zoomed, at);
        } else {
          lastTap = event.timeStamp;
        }
        return;
      }
      setZoom(!zoomed, at);
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button) {
      dialog.close();
      return;
    }
    if (button.matches('[data-gallery-close]')) dialog.close();
    const zoom = button.dataset.galleryZoom;
    if (zoom && button.getAttribute('aria-disabled') !== 'true') setZoom(zoom === 'in');
    const step = Number(button.dataset.galleryStep);
    if (step) showLarge(current + step);
  });

  // -------------------------------------------------------------- keyboard

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [PAN_STEP, 0],
    ArrowRight: [-PAN_STEP, 0],
    ArrowUp: [0, PAN_STEP],
    ArrowDown: [0, -PAN_STEP],
  };

  /** What Tab cycles through: the photo shown, then the buttons. */
  const focusables = () =>
    [...dialog.querySelectorAll<HTMLElement>('button, img[tabindex="0"]')].filter(
      (el) => !el.closest('[hidden]'),
    );

  dialog.addEventListener('keydown', (event) => {
    const target = event.target as Element;
    const arrow = ARROWS[event.key];
    if (zoomed && arrow) {
      // Zoomed, the arrows move over the photo instead of switching photos.
      event.preventDefault();
      pan(...arrow);
    } else if (event.key === 'ArrowRight' && total > 1) {
      event.preventDefault();
      showLarge(current + 1);
    } else if (event.key === 'ArrowLeft' && total > 1) {
      event.preventDefault();
      showLarge(current - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && target.matches('img')) {
      event.preventDefault();
      setZoom(!zoomed);
    } else if ((event.key === '+' || event.key === '=') && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      setZoom(true);
    } else if (event.key === '-' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      setZoom(false);
    } else if (event.key === 'Tab') {
      // Keep Tab inside the dialog (the browser would otherwise leave the
      // page for its own interface after the last button).
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
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
