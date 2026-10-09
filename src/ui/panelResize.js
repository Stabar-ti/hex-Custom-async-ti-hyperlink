// @ts-check
/**
 * Dragging the edge of the rail and the inspector to resize them.
 *
 * Both are grid tracks in the app shell with a width fixed in CSS. That is fine until the
 * content disagrees: the inspector holds tile art, a planet list, an armed tool's controls
 * and the clipboard history, and the border-anomaly tool in particular wants more than
 * 230px. The rail has the same problem in the other direction — once you know the icons,
 * its labels are just width the map is not using.
 *
 * So the width is a CSS custom property on the shell, and the handle writes to it. It is
 * remembered per panel, because a width is a decision about your screen, not about one
 * session.
 *
 * The handle is a sibling of the panel rather than a pseudo-element on it: it has to take
 * pointer events, sit above both the panel and the map, and stay clickable when the panel
 * itself scrolls.
 */

const STORE_PREFIX = 'ti4-panel-width-';

/**
 * @typedef {{
 *   id: string, varName: string, edge: 'left'|'right',
 *   min: number, max: number, fallback: number,
 * }} PanelSpec
 */

/** @type {PanelSpec[]} */
const PANELS = [
    {
        id: 'toolRail',
        varName: '--shell-rail-w',
        edge: 'right',
        // Below about 150 the labels truncate to nothing useful; past 320 it is taking
        // map without giving anything back.
        min: 150, max: 320, fallback: 178,
    },
    {
        id: 'inspector',
        varName: '--shell-inspector-w',
        edge: 'left',
        min: 200, max: 520, fallback: 250,
    },
];

/** @param {string} id @returns {number|null} */
function storedWidth(id) {
    try {
        const raw = localStorage.getItem(STORE_PREFIX + id);
        const n = raw == null ? NaN : Number(raw);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;   // private mode; the panel just starts at its default
    }
}

/** @param {string} id @param {number} w */
function storeWidth(id, w) {
    try {
        localStorage.setItem(STORE_PREFIX + id, String(Math.round(w)));
    } catch { /* the width just does not survive the session */ }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * @param {PanelSpec} spec
 * @param {number} w
 */
function applyWidth(spec, w) {
    document.documentElement.style.setProperty(spec.varName, `${Math.round(w)}px`);
}

/**
 * Put a drag handle on one panel.
 * @param {PanelSpec} spec
 */
function install(spec) {
    const panel = document.getElementById(spec.id);
    if (!panel || panel.parentElement?.querySelector(`[data-resizes="${spec.id}"]`)) return;

    const saved = storedWidth(spec.id);
    if (saved != null) applyWidth(spec, clamp(saved, spec.min, spec.max));

    const handle = document.createElement('div');
    handle.className = `panel-resizer panel-resizer--${spec.edge}`;
    handle.dataset.resizes = spec.id;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.title = 'Drag to resize · double-click to reset';

    // Into the shell, not the panel: a child of a scrolling column scrolls with it, and
    // this has to stay on the edge.
    (panel.parentElement || document.body).appendChild(handle);

    /** Keep the handle on the panel's edge, whatever the grid has done with it. */
    const place = () => {
        const r = panel.getBoundingClientRect();
        handle.style.top = `${r.top}px`;
        handle.style.height = `${r.height}px`;
        handle.style.left = `${spec.edge === 'right' ? r.right - 3 : r.left - 3}px`;
        handle.hidden = r.width === 0;
    };
    place();

    let dragging = false;

    handle.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dragging = true;
        handle.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        // The map binds its own drag handling; without this a resize also pans.
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (ev) => {
        if (!dragging) return;
        const r = panel.getBoundingClientRect();
        const raw = spec.edge === 'right' ? ev.clientX - r.left : r.right - ev.clientX;
        applyWidth(spec, clamp(raw, spec.min, spec.max));
        place();
    });

    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('is-dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        storeWidth(spec.id, panel.getBoundingClientRect().width);
    });

    handle.addEventListener('dblclick', () => {
        applyWidth(spec, spec.fallback);
        storeWidth(spec.id, spec.fallback);
        place();
    });

    // The rail collapses to an icon strip and the inspector can be hidden, so the handle
    // follows the panel rather than assuming it stays put.
    new ResizeObserver(place).observe(panel);
    window.addEventListener('resize', place);
}

/** Wire both panels. Safe to call when either is missing. */
export function installPanelResizers() {
    for (const spec of PANELS) install(spec);
}
