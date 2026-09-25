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
 * The panel's controls are bound by id all over uiBindings.js and main.js, so every id and
 * element type in it is kept exactly as it was — the menu is a regrouping and a restyling,
 * not a rebuild, and all ~20 handlers keep working untouched.
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

/** Show or hide the New map drop-out. @param {boolean} open */
function setNewMapOpen(open) {
    const flyout = document.getElementById('newMapFlyout');
    const btn = document.getElementById('newMapToggle');
    if (flyout) flyout.classList.toggle('is-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** @param {boolean} open */
export function setFileMenuOpen(open) {
    const el = panel();
    if (!el) return;

    el.classList.toggle(OPEN_CLASS, open);
    // A drop-out left open would be the first thing you saw next time the menu opened.
    if (!open) setNewMapOpen(false);
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
 * @param {any} editor
 */
export function installFileMenu(editor) {
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

    // Generating a map is destructive and takes a ring count and a bounds setting with it,
    // so it sits behind its own drop-out rather than in the list beside Save and Load.
    const newMapBtn = document.getElementById('newMapToggle');
    newMapBtn?.addEventListener('click', () => {
        const flyout = document.getElementById('newMapFlyout');
        setNewMapOpen(!flyout?.classList.contains('is-open'));
    });

    // Starting a Milty draft used to mean opening the slice designer and pressing Load
    // Map inside it, so the one thing you need before the tool is useful was only reachable
    // from inside the tool. It is a map you can start, so it sits with the other one.
    document.getElementById('genMiltyMapBtn')?.addEventListener('click', async () => {
        closeFileMenu();
        try {
            const [{ loadMiltyMap }, { openMiltySliceDesigner }] = await Promise.all([
                import('../modules/Milty/miltyBuilderUI.js'),
                import('./specialModePopup.js'),
            ]);
            await loadMiltyMap(editor);
            openMiltySliceDesigner(editor);
        } catch (err) {
            console.error('Failed to start a Milty map:', err);
            alert('Could not load the Milty layout: ' + err);
        }
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
