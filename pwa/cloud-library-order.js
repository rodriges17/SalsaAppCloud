// The draft owns only IDs; moving cards never reloads previews or downloads media.
export function createLibraryOrder(entries) {
  const original = entries.map(entry => entry.figure_id), ids = [...original];
  return {
    get ids() { return [...ids]; },
    get dirty() { return ids.some((id, index) => id !== original[index]); },
    move(id, index) {
      const from = ids.indexOf(id);
      if (from < 0 || !Number.isInteger(index) || index < 0 || index >= ids.length || from === index) return false;
      ids.splice(from, 1); ids.splice(index, 0, id); return true;
    }
  };
}

export function mountLibraryOrder(container, entries, { manage, node, action, changed }) {
  const order = createLibraryOrder(entries), cards = new Map(), controls = new Map();
  const announce = node('p', '', 'cloud-order-status'); announce.setAttribute('role', 'status');
  function update() {
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    order.ids.forEach((id, index) => {
      const card = cards.get(id), control = controls.get(id);
      if (!card) return;
      control.number.textContent = String(index + 1);
      card.setAttribute('aria-label', `Position ${index + 1}: ${control.title}`);
      if (manage) { control.up.disabled = index === 0; control.down.disabled = index === entries.length - 1; }
      container.append(card);
    });
    focused?.focus({ preventScroll: true });
    changed?.(order);
  }
  function move(id, to) {
    if (!order.move(id, to)) return;
    update(); announce.textContent = `Position ${to + 1} von ${entries.length}. Noch nicht gespeichert.`;
  }
  function add(entry, card) {
    const id = entry.figure_id, title = entry.published?.title ?? entry.pending?.title ?? 'Figur';
    card.dataset.libraryFigure = id; cards.set(id, card);
    const bar = node('div', undefined, 'cloud-order-controls'), number = node('span', '', 'cloud-order-number');
    bar.append(number); const control = { number, title };
    if (manage) {
      const handle = action('⠿', () => {}); handle.className = 'cloud-order-handle'; handle.setAttribute('aria-label', `${title} verschieben`);
      handle.onkeydown = event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); move(id, order.ids.indexOf(id) + (event.key === 'ArrowUp' ? -1 : 1));
      };
      let dragging = false;
      const finish = () => { dragging = false; card.classList.remove('cloud-order-dragging'); document.removeEventListener('pointermove', pointerMove); document.removeEventListener('pointerup', finish); document.removeEventListener('pointercancel', finish); };
      handle.onpointerdown = event => { if (event.button !== 0) return; dragging = true; card.classList.add('cloud-order-dragging'); document.addEventListener('pointermove', pointerMove); document.addEventListener('pointerup', finish); document.addEventListener('pointercancel', finish); };
      const pointerMove = event => {
        if (!dragging) return;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-library-figure]');
        if (target && container.contains(target)) move(id, order.ids.indexOf(target.dataset.libraryFigure));
        const scroll = container.closest('#cloudBody');
        if (scroll) { const rect = scroll.getBoundingClientRect(); if (event.clientY < rect.top + 65) scroll.scrollTop -= 18; if (event.clientY > rect.bottom - 65) scroll.scrollTop += 18; }
      };

      control.up = action('Nach oben', () => move(id, order.ids.indexOf(id) - 1));
      control.down = action('Nach unten', () => move(id, order.ids.indexOf(id) + 1));
      bar.append(handle, control.up, control.down);
    }
    controls.set(id, control); card.prepend(bar); update();
  }
  return { order, add, announce };
}
