// @ts-check
/**
 * The one place that knows how to show and hide the Im/Export &amp; map-generation panel.
 *
 * Why this exists
 * ───────────────
 * Collapsing that panel used to be implemented three times:
 *
 *   1. main.js, on the panel's own `»` button — collapsed it AND revealed the floating `«`
 *      restore button.
 *   2. main.js, on `#toggleControlsBtn` in Layout Options — the fullest version, relabelling
 *      the button too. Bound to the *static* markup in index.html, which showPopup deletes
 *      and re-emits, so this one never ran at all.
 *   3. simplepPopup.js, on the rebuilt `#toggleControlsBtn` — the one that actually ran,
 *      and the only one that did not touch the restore button.
 *
 * Because (3) left `#controlsPanelOpenBtn` carrying the inline `display:none` it gets at
 * load, collapsing the panel from Layout Options hid it with nothing on screen to bring it
 * back. The panel was still there — `translateX(-110%)`, opacity 0 — but the only way to
 * restore it was to know to reopen Layout Options and press the same entry again.
 *
 * One function now owns the whole transition: the class, the restore button's visibility,
 * its accessibility state, and the Layout Options label. Every caller goes through it.
 */

/** @returns {HTMLElement|null} */
function panel() {
    return document.getElementById('controlsPanel');
}

/** @returns {HTMLElement|null} */
function restoreBtn() {
    return document.getElementById('controlsPanelOpenBtn');
}

/**
 * Show or hide the panel, and keep everything that reflects that state in step.
 *
 * @param {boolean} collapsed
 */
export function setControlsPanelCollapsed(collapsed) {
    const el = panel();
    if (!el) return;

    el.classList.toggle('collapsed', collapsed);

    // The restore button is the panel's only way back, so it is not optional.
    const restore = restoreBtn();
    if (restore) {
        restore.style.display = collapsed ? 'block' : 'none';
        restore.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
        restore.tabIndex = collapsed ? 0 : -1;
    }

    // Layout Options' entry is a toggle, so it has to say which way it goes next. It only
    // exists while that popup is open; absent is normal, not an error.
    const toggle = document.getElementById('toggleControlsBtn');
    if (toggle) {
        toggle.textContent = collapsed
            ? 'Show Im/Export & map generation'
            : 'Hide Im/Export & map generation';
    }

    const closeBtn = document.getElementById('controlsPanelCloseBtn');
    if (closeBtn) closeBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

/** Flip the panel's current state. */
export function toggleControlsPanel() {
    const el = panel();
    if (!el) return;
    setControlsPanelCollapsed(!el.classList.contains('collapsed'));
}

/** True when the panel is currently hidden. */
export function isControlsPanelCollapsed() {
    return !!panel()?.classList.contains('collapsed');
}

/**
 * Put the panel and its restore button into a consistent state at startup. Called once from
 * main.js; the markup ships expanded, but this does not assume that.
 */
export function initControlsPanel() {
    setControlsPanelCollapsed(isControlsPanelCollapsed());
}
