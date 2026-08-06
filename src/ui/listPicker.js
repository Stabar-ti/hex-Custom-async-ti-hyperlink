/**
 * A small floating list, anchored to the thing you clicked, that resolves a Promise.
 *
 *   const key = await openListPicker(button, items, { title: 'Add filter' });
 *
 * This started life inside the lore module (loreEffectPickers.js) and is already used
 * from outside it — loreOverlay and loreMapPick both import it — so it lives here now,
 * where the system picker's "+ Add filter" menu can share it instead of growing a fourth
 * near-identical dropdown.
 *
 * Dismisses on outside click, on Escape, and when another picker opens. Resolves null on
 * dismissal so `await` never hangs.
 *
 * Only one picker is open at a time. The lore module still owns its own panel machinery
 * for its composite pickers (unit, tech, condition), so it registers its closer here via
 * `registerForeignCloser` — that keeps "opening one closes the other" true in both
 * directions without either module having to know the other's internals.
 */

let activePanel = null;
let activeResolve = null;
const foreignClosers = new Set();

/**
 * Lets another module with its own picker singleton participate in mutual dismissal.
 * @param {() => void} fn closes that module's picker
 * @returns {() => void} unregister
 */
export function registerForeignCloser(fn) {
    foreignClosers.add(fn);
    return () => foreignClosers.delete(fn);
}

/** Closes this module's picker, resolving a pending Promise with null. */
export function closeListPicker() {
    if (activePanel) {
        activePanel.remove();
        activePanel = null;
    }
    document.removeEventListener('mousedown', onOutsideClick, true);
    document.removeEventListener('keydown', onEscape, true);
    if (activeResolve) {
        const fn = activeResolve;
        activeResolve = null;
        fn(null);
    }
}

function onOutsideClick(e) {
    if (activePanel && !activePanel.contains(e.target)) closeListPicker();
}

function onEscape(e) {
    // Capture phase and stopPropagation: Escape inside a picker means "close the picker",
    // never "close the popup underneath it".
    if (e.key === 'Escape' && activePanel) {
        e.stopPropagation();
        closeListPicker();
    }
}

/**
 * Creates an empty panel positioned near `anchorEl`, replacing anything already open.
 * Exported so a caller can build a bespoke panel with the same dismissal behaviour.
 */
export function createPanel(anchorEl, { width = 240 } = {}) {
    closeListPicker();
    for (const fn of foreignClosers) fn();

    const panel = document.createElement('div');
    panel.className = 'sp-picker-panel';
    panel.style.width = `${width}px`;

    const rect = anchorEl.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${rect.left}px`;
    document.body.appendChild(panel);
    activePanel = panel;

    // Clamp after the caller has filled the panel, so the measurement uses its real
    // height rather than an empty box.
    setTimeout(() => {
        if (activePanel !== panel) return;
        const a = anchorEl.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        let left = a.left;
        let top = a.bottom + 4;
        if (left + p.width > window.innerWidth - 8) left = window.innerWidth - p.width - 8;
        if (top + p.height > window.innerHeight - 8) top = a.top - p.height - 4;
        panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - p.width - 8))}px`;
        panel.style.top = `${Math.max(8, Math.min(top, window.innerHeight - p.height - 8))}px`;

        document.addEventListener('mousedown', onOutsideClick, true);
        document.addEventListener('keydown', onEscape, true);
    }, 0);

    return panel;
}

/**
 * An anchor for a picker that should appear at a point rather than under an element —
 * e.g. at the mouse. Returns a zero-size fixed element; remove it when done.
 */
export function anchorAt(x, y) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0`;
    document.body.appendChild(el);
    return el;
}

/**
 * A searchable list of `{ value, label, icon?, hint?, group? }`. Clicking resolves with
 * the item's value; dismissing resolves null.
 *
 * Rendering is capped at 200 rows — this is a menu, not a browser. Anything needing more
 * than that wants the picker's own grid.
 */
export function openListPicker(anchorEl, items, {
    title = null, searchable = true, width = 240, emptyText = 'No matches'
} = {}) {
    return new Promise(resolve => {
        const panel = createPanel(anchorEl, { width });
        activeResolve = resolve;

        const settle = value => {
            activeResolve = null;
            closeListPicker();
            resolve(value);
        };

        if (title) {
            const t = document.createElement('div');
            t.className = 'sp-picker-title';
            t.textContent = title;
            panel.appendChild(t);
        }

        const list = document.createElement('div');
        list.className = 'sp-picker-list';

        const render = (filter = '') => {
            list.innerHTML = '';
            const q = filter.trim().toLowerCase();
            const matches = q
                ? items.filter(it =>
                    String(it.label || '').toLowerCase().includes(q) ||
                    String(it.value || '').toLowerCase().includes(q) ||
                    String(it.group || '').toLowerCase().includes(q))
                : items;

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'sp-picker-empty';
                empty.textContent = emptyText;
                list.appendChild(empty);
                return;
            }

            let lastGroup = null;
            for (const it of matches.slice(0, 200)) {
                if (it.group && it.group !== lastGroup) {
                    const g = document.createElement('div');
                    g.className = 'sp-picker-group';
                    g.textContent = it.group;
                    list.appendChild(g);
                    lastGroup = it.group;
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'sp-picker-item';
                if (it.selected) btn.classList.add('is-on');

                if (it.icon) {
                    const img = document.createElement('img');
                    img.src = it.icon;
                    img.alt = '';
                    img.loading = 'lazy';
                    img.onerror = () => { img.style.display = 'none'; };
                    btn.appendChild(img);
                }

                const label = document.createElement('span');
                label.className = 'sp-picker-item-label';
                label.textContent = it.label;
                btn.appendChild(label);

                if (it.hint) {
                    const hint = document.createElement('span');
                    hint.className = 'sp-picker-item-hint';
                    hint.textContent = it.hint;
                    btn.appendChild(hint);
                }

                btn.onclick = () => settle(it.value);
                list.appendChild(btn);
            }
        };

        if (searchable) {
            const search = document.createElement('input');
            search.type = 'text';
            search.className = 'sp-picker-search';
            search.placeholder = 'Filter…';
            search.oninput = () => render(search.value);
            // Enter picks the only remaining match — the fast path when you know the name.
            search.onkeydown = e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const first = list.querySelector('.sp-picker-item');
                if (first) first.click();
            };
            panel.appendChild(search);
            setTimeout(() => search.focus(), 0);
        }

        panel.appendChild(list);
        render('');
    });
}
