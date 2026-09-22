// @ts-check
/**
 * Selecting a hex to read it, which is what clicking the map should do when no tool is armed.
 *
 * The editor booted in 'hyperlane' mode and had no idle state at all. Disarming a tool
 * called setMode('none'), and 'none' fell through to the paint branch in uiEvents: it
 * snapshotted the hex for undo, cleared it, and called setSectorType(label, 'none'), which
 * has no entry in sectorColors and so painted the blank default. Clicking the map with
 * nothing armed wiped tiles and filled the undo stack — while looking like no tool was
 * selected at all.
 *
 * 'select' is that missing idle state. It changes nothing on the map: it marks a hex and
 * tells the inspector to show it.
 *
 * The ring is its own layer rather than the `.selected` class already in the stylesheet.
 * That class belongs to the hyperlane and border-anomaly tools, which use it for the
 * half-finished links they are building, and setMode clears it from every hex on any mode
 * change. Sharing it would make two different meanings erase each other.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYER_ID = 'hexSelectionLayer';

/** Fired on `document` whenever the selected hex changes. detail: {label: string|null} */
export const HEX_SELECTED = 'ti4:hex-selected';

/** @param {any} editor @returns {string|null} */
export function selectedHex(editor) {
    return editor?.selectedHexLabel || null;
}

/** @param {any} editor */
function drawRing(editor) {
    editor?.svg?.querySelector('#' + LAYER_ID)?.remove();

    const label = selectedHex(editor);
    if (!label) return;
    const hex = editor.hexes?.[label];
    if (!hex?.center || !editor.svg) return;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = LAYER_ID;
    // Reading a hex must not stop you clicking the one underneath.
    layer.style.pointerEvents = 'none';

    const r = (editor.hexRadius || 40) * 0.92;

    // Two rings: a dark one under a bright one, so the mark reads on both the pale tile
    // fills and the dark ones without picking a colour that fights either.
    for (const [stroke, width] of [['#000', 5], ['#4fc3f7', 2.5]]) {
        const ring = document.createElementNS(SVG_NS, 'circle');
        ring.setAttribute('cx', String(hex.center.x));
        ring.setAttribute('cy', String(hex.center.y));
        ring.setAttribute('r', String(r));
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', String(stroke));
        ring.setAttribute('stroke-width', String(width));
        ring.setAttribute('opacity', stroke === '#000' ? '0.45' : '1');
        layer.appendChild(ring);
    }

    editor.svg.appendChild(layer);
}

/**
 * Select a hex, or re-select the current one to clear it.
 *
 * Clicking the selected hex again deselects, so the ring can be dismissed with the same
 * gesture that raised it and without hunting for a button.
 *
 * @param {any} editor
 * @param {string} label
 */
export function selectHex(editor, label) {
    if (!editor) return;
    editor.selectedHexLabel = editor.selectedHexLabel === label ? null : label;
    drawRing(editor);
    document.dispatchEvent(new CustomEvent(HEX_SELECTED, {
        detail: { label: editor.selectedHexLabel },
    }));
}

/** @param {any} editor */
export function clearHexSelection(editor) {
    if (!editor?.selectedHexLabel) return;
    editor.selectedHexLabel = null;
    drawRing(editor);
    document.dispatchEvent(new CustomEvent(HEX_SELECTED, { detail: { label: null } }));
}

/**
 * Redraw the ring where it is. The map is rebuilt wholesale by generate, import and undo,
 * which throws the layer away along with everything else.
 *
 * @param {any} editor
 */
export function refreshHexSelection(editor) {
    if (!editor) return;
    // A hex that no longer exists cannot stay selected — a smaller map after Remove Ring,
    // or a fresh one after Generate.
    if (editor.selectedHexLabel && !editor.hexes?.[editor.selectedHexLabel]) {
        clearHexSelection(editor);
        return;
    }
    drawRing(editor);
}
