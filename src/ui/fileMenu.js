// @ts-check
/**
 * The File menu: everything to do with getting a map in or out.
 *
 * This is the same panel that used to sit permanently over the top-left of the map — the
 * single largest surface in the application, holding the jobs you do once or twice a
 * session: generate a map, import one from AsyncTI4, save it locally, upload it back.
 * Meanwhile the work you do every few seconds had no home at all. That inversion is what
 * the whole layout pass is about, and this is the last piece of it.
 *
 * Nothing inside the panel is rebuilt. Its controls are bound by id all over uiBindings.js
 * and main.js, so the markup is kept exactly as it was and simply shown as a dropdown under
 * the File button instead of floating over the map. That keeps ~20 handlers working
 * untouched, which is worth more here than tidier markup.
 */

const OPEN_CLASS = 'file-menu-open';

/** @returns {HTMLElement|null} */
function panel() {
    return document.getElementById('controlsPanel');
}

/** @returns {HTMLElement|null} */
function trigger() {
    return document.getElementById('fileMenuBtn');
}

export function isFileMenuOpen() {
    return !!panel()?.classList.contains(OPEN_CLASS);
}

/**
 * Put the panel under the File button. It is position:fixed, so this is viewport
 * coordinates, and it is clamped so a narrow window cannot push it off the right edge.
 */
function position() {
    const el = panel();
    const btn = trigger();
    if (!el || !btn) return;

    const r = btn.getBoundingClientRect();
    el.style.top = Math.round(r.bottom + 4) + 'px';

    // Measure after it is displayed, otherwise the width is zero.
    const width = el.getBoundingClientRect().width;
    const left = Math.min(Math.round(r.left), Math.max(8, window.innerWidth - width - 8));
    el.style.left = left + 'px';
}

/** @param {boolean} open */
export function setFileMenuOpen(open) {
    const el = panel();
    if (!el) return;

    el.classList.toggle(OPEN_CLASS, open);
    if (open) position();

    const btn = trigger();
    if (btn) {
        btn.classList.toggle('active', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

export function toggleFileMenu() {
    setFileMenuOpen(!isFileMenuOpen());
}

export function closeFileMenu() {
    setFileMenuOpen(false);
}

/**
 * Add the File button to the top bar and wire the panel to it.
 *
 * @param {any} _editor
 */
export function installFileMenu(_editor) {
    const el = panel();
    const host = document.getElementById('leftControls');
    if (!el || !host || document.getElementById('fileMenuBtn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fileMenuBtn';
    btn.className = 'mode-button ui-btn';
    btn.textContent = 'File ▾';
    btn.title = 'Generate, import, save and upload maps';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    host.insertBefore(btn, host.firstChild);

    btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleFileMenu();
    });

    // A menu closes when you click away from it or press Escape. Clicks inside must not
    // close it — the panel holds inputs and a nested dropdown of its own.
    el.addEventListener('click', (ev) => ev.stopPropagation());
    document.addEventListener('click', () => { if (isFileMenuOpen()) closeFileMenu(); });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && isFileMenuOpen()) closeFileMenu();
    });

    window.addEventListener('resize', () => { if (isFileMenuOpen()) position(); });

    setFileMenuOpen(false);
}
