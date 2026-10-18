export function toast(message, duration = 2200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

export function openModal(overlayEl) {
  overlayEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}

export function closeModal(overlayEl) {
  overlayEl.classList.remove('active');
  document.body.style.overflow = '';
}

export function confirmAction(message) {
  return window.confirm(message);
}

/** Pill-style single-choice control. Returns HTML; read value via data-value of .active. */
export function segmentedHtml(name, options, value) {
  return `
    <div class="segmented" data-name="${name}">
      ${options.map((o) => `<button type="button" class="seg-btn${o.id === value ? ' active' : ''}" data-value="${o.id}">${o.name}</button>`).join('')}
    </div>`;
}

export function bindSegmented(root, onChange) {
  root.querySelectorAll('.segmented').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      onChange?.(seg.dataset.name, btn.dataset.value);
    });
  });
}

export function segmentedValue(root, name) {
  return root.querySelector(`.segmented[data-name="${name}"] .seg-btn.active`)?.dataset.value;
}

const entryOverlay = () => document.getElementById('entry-modal-overlay');

/**
 * Opens the shared entry sheet. `render(body)` fills the body and wires its
 * own buttons; call the returned close() when done.
 */
export function openEntrySheet(title, render) {
  const overlay = entryOverlay();
  document.getElementById('entry-modal-title').textContent = title;
  const body = document.getElementById('entry-modal-body');
  body.innerHTML = '';
  const close = () => closeModal(overlay);
  render(body, close);
  openModal(overlay);
  return close;
}

export function bindEntrySheetChrome() {
  const overlay = entryOverlay();
  document.getElementById('entry-modal-close').addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay);
  });
}

export function emptyStateHtml(icon, text) {
  return `<div class="empty-state"><div class="icon">${icon}</div><div>${text}</div></div>`;
}

export function rangePickerHtml(value) {
  return segmentedHtml('range', [
    { id: '30', name: '1개월' },
    { id: '90', name: '3개월' },
    { id: '180', name: '6개월' },
    { id: '365', name: '1년' },
    { id: 'all', name: '전체' },
  ], value);
}

export const PAGE_SIZE = 30;

export function showMoreHtml(total, shown) {
  if (shown >= total) return '';
  return `<button class="btn btn-secondary btn-block show-more" data-show-more>더 보기 (${total - shown}건 남음)</button>`;
}
