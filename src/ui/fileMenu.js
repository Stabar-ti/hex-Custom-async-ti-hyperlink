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
 *
 * Opening, closing and dismissing it are the shared dropdown's, so it behaves like every
 * other menu in the bar. It had its own copy of all that, and with it its own idea of
 * when another menu should close.
 */

import { makeDropdown } from './dropdownMenu.js';

const OPEN_CLASS = 'file-menu-open';

/** Show or hide the New map drop-out. @param {boolean} open */
function setNewMapOpen(open) {
    const flyout = document.getElementById('newMapFlyout');
    const btn = document.getElementById('newMapToggle');
    if (flyout) flyout.classList.toggle('is-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * Add the File button to the top bar and wire the panel to it.
 *
 * @param {any} editor
 */
export function installFileMenu(editor) {
    const el = document.getElementById('controlsPanel');
    const host = document.getElementById('leftControls');
    if (!el || !host || document.getElementById('fileMenuBtn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fileMenuBtn';
    btn.className = 'mode-button ui-btn';
    btn.textContent = 'File ▾';
    btn.title = 'Generate, import, save and upload maps';
    host.insertBefore(btn, host.firstChild);

    // Pressing an item does not close it, unlike the other menus: the panel holds inputs
    // and a drop-out of its own. A drop-out left open would be the first thing you saw
    // next time the menu opened, so closing the menu closes that too.
    const menu = makeDropdown({
        panel: el,
        trigger: btn,
        openClass: OPEN_CLASS,
        onClose: () => setNewMapOpen(false),
    });

    // Generating a map is destructive, so it sits behind its own drop-out rather than in
    // the list beside Save and Load. Its size comes from the Map size menu: the ring and
    // bounds controls lived in this drop-out, though they resize the current map.
    const newMapBtn = document.getElementById('newMapToggle');
    newMapBtn?.addEventListener('click', () => {
        const flyout = document.getElementById('newMapFlyout');
        setNewMapOpen(!flyout?.classList.contains('is-open'));
    });

    // Starting a Milty draft used to mean opening the slice designer and pressing Load
    // Map inside it, so the one thing you need before the tool is useful was only reachable
    // from inside the tool. It is a map you can start, so it sits with the other one.
    document.getElementById('genMiltyMapBtn')?.addEventListener('click', async () => {
        menu.close();
        try {
            const [{ loadMiltyMap }, { openMiltySliceDesigner }] = await Promise.all([
                import('../modules/Milty/miltyBuilderUI.js'),
                import('./specialModePopup.js'),
            ]);
            if (await loadMiltyMap(editor)) openMiltySliceDesigner(editor);
        } catch (err) {
            console.error('Failed to start a Milty map:', err);
            alert('Could not load the Milty layout: ' + err);
        }
    });
}
