// @ts-check
/**
 * Selecting hexes — to read them, to copy them, to swap them.
 *
 * This started as the idle state the editor never had. The editor booted in 'hyperlane'
 * mode, every tool disarmed by calling setMode('none'), and uiEvents had no branch for
 * 'none' — so a click with nothing armed fell through to the paint branch, snapshotted the
 * hex for undo, cleared it, and filled it with the blank default. A map could be eaten one
 * click at a time by a tool that was not there.
 *
 * It is now also what copy, cut and swap operate on, which is why it holds a set rather
 * than one label: shift-click adds and removes, a plain click replaces.
 *
 * The outline traces the union of the selected hexes rather than ringing each one. For a
 * contiguous block that is a single closed shape, which is the shape you are about to copy
 * or move — six rings overlapping each other say much less about it. It is drawn edge by
 * edge: a side is part of the outline exactly when the hex across it is not also selected.
 *
 * The layer is its own, not the `.selected` class already in the stylesheet. That class
 * belongs to the hyperlane and border-anomaly tools, which use it for the half-finished
 * links they are building, and setMode clears it from every hex on any mode change.
 * Sharing it would make two different meanings erase each other.
 */

import { EDGE_DIRECTIONS } from '../utils/hexGrid.js';
import { sideCorners } from '../utils/hexGeometry.js';
import { sectorColors } from '../constants/constants.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYER_ID = 'hexSelectionLayer';

/**
 * Whether a click in this mode selects rather than edits.
 *
 * Asked of sectorColors rather than of a list of names: the paint modes ARE its keys, so a
 * mode that is not one of them cannot paint, whatever it is called. See uiEvents, and
 * tools/test-hex-modes.js for what it cost when this was a list.
 *
 * @param {string|undefined|null} mode
 */
export function isSelectMode(mode) {
    return !mode || mode === 'none' || mode === 'select' || !(mode in sectorColors);
}

/** Fired on `document` whenever the selection changes. detail: {labels: string[], label} */
export const HEX_SELECTED = 'ti4:hex-selected';

/** @param {any} editor @returns {string[]} */
export function selectedHexes(editor) {
    return editor?.selectedHexLabels || [];
}

/**
 * The most recently added hex — what the inspector reads.
 * @param {any} editor @returns {string|null}
 */
export function selectedHex(editor) {
    const all = selectedHexes(editor);
    return all.length ? all[all.length - 1] : null;
}

/** @param {any} editor @param {string} label */
export function isHexSelected(editor, label) {
    return selectedHexes(editor).includes(label);
}

// ── Drawing ──────────────────────────────────────────────────────────────────

/** @param {any} editor */
function draw(editor) {
    editor?.svg?.querySelector('#' + LAYER_ID)?.remove();

    const labels = selectedHexes(editor);
    if (!labels.length || !editor.svg) return;

    const radius = (editor.hexRadius || 40) * 0.94;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = LAYER_ID;
    // Reading or selecting a hex must never stop you clicking the one underneath.
    layer.style.pointerEvents = 'none';

    // An outer dark stroke under a bright one, so the outline reads on both the pale tile
    // fills and the dark ones without picking a colour that fights either.
    const under = document.createElementNS(SVG_NS, 'g');
    const over = document.createElementNS(SVG_NS, 'g');
    under.setAttribute('stroke', '#000');
    under.setAttribute('stroke-width', '5');
    under.setAttribute('stroke-opacity', '0.45');
    under.setAttribute('stroke-linecap', 'round');
    over.setAttribute('stroke', '#4fc3f7');
    over.setAttribute('stroke-width', '2.5');
    over.setAttribute('stroke-linecap', 'round');

    for (const label of labels) {
        const hex = editor.hexes?.[label];
        if (!hex?.center) continue;

        for (let s = 0; s < 6; s++) {
            const dir = EDGE_DIRECTIONS[s];
            // Inside the block, so not part of its outline.
            const neighbourSelected = labels.some(other => {
                const n = editor.hexes?.[other];
                return n && n.q === hex.q + dir.q && n.r === hex.r + dir.r;
            });
            if (neighbourSelected) continue;

            const [a, b] = sideCorners(hex.center, radius, s);
            for (const host of [under, over]) {
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', String(a.x));
                line.setAttribute('y1', String(a.y));
                line.setAttribute('x2', String(b.x));
                line.setAttribute('y2', String(b.y));
                host.appendChild(line);
            }
        }
    }

    layer.append(under, over);
    editor.svg.appendChild(layer);
}

// ── Changing the selection ───────────────────────────────────────────────────

/** @param {any} editor */
function announce(editor) {
    draw(editor);
    const labels = selectedHexes(editor);
    editor.selectedHexLabel = selectedHex(editor);
    document.dispatchEvent(new CustomEvent(HEX_SELECTED, {
        detail: { labels: [...labels], label: editor.selectedHexLabel },
    }));
}

/**
 * Select a hex.
 *
 * Plain click replaces the selection, and clicking the only selected hex clears it — so
 * the outline can be dismissed with the same gesture that raised it, without hunting for a
 * button. Shift-click adds, and shift-clicking a selected hex removes it again.
 *
 * Selected hexes need not touch each other. The wizard this feeds required every tile to
 * be connected to the last, which the offset maths never needed, and which swap — two
 * tiles anywhere on the map — cannot satisfy at all.
 *
 * @param {any} editor
 * @param {string} label
 * @param {{additive?: boolean}} [opts]
 */
export function selectHex(editor, label, { additive = false } = {}) {
    if (!editor) return;
    const current = selectedHexes(editor);

    if (additive) {
        editor.selectedHexLabels = current.includes(label)
            ? current.filter(l => l !== label)
            : [...current, label];
    } else if (current.length === 1 && current[0] === label) {
        editor.selectedHexLabels = [];
    } else {
        editor.selectedHexLabels = [label];
    }

    announce(editor);
}

/**
 * Add hexes to the selection and never take any away. This is what a shift-drag paints
 * with: sweeping back over a hex you already have must not drop it, the way a second
 * shift-click on it would.
 *
 * @param {any} editor @param {string[]} labels
 */
export function addToHexSelection(editor, labels) {
    if (!editor) return;
    const current = selectedHexes(editor);
    const fresh = labels.filter(l => editor.hexes?.[l] && !current.includes(l));
    if (!fresh.length) return;
    editor.selectedHexLabels = [...current, ...fresh];
    announce(editor);
}

/**
 * One shift-drag across the map.
 *
 * Nothing is added until the pointer reaches a second hex. Until then the press is still
 * a shift-click, and the click that follows it is what adds or removes the hex under it —
 * so a shift-click that wobbles inside its own hex stays a click. Once the stroke has
 * crossed into another hex it has painted, and the click at the end has to be swallowed,
 * or it would take the hex it ended on back out again.
 *
 * @param {any} editor
 * @param {string|null} startLabel - the hex the press began on, if it began on one
 */
export function beginSelectionStroke(editor, startLabel) {
    let last = startLabel;
    let painted = false;
    return {
        /** @param {string|null} label - the hex now under the pointer */
        enter(label) {
            if (!label || label === last) return;
            last = label;
            if (!painted) {
                painted = true;
                addToHexSelection(editor, startLabel ? [startLabel, label] : [label]);
            } else {
                addToHexSelection(editor, [label]);
            }
        },
        get painted() { return painted; },
    };
}

/**
 * Select an exact set, replacing whatever was selected.
 * @param {any} editor @param {string[]} labels
 */
export function setHexSelection(editor, labels) {
    if (!editor) return;
    editor.selectedHexLabels = [...new Set(labels)].filter(l => editor.hexes?.[l]);
    announce(editor);
}

/** @param {any} editor */
export function clearHexSelection(editor) {
    if (!editor || !selectedHexes(editor).length) return;
    editor.selectedHexLabels = [];
    announce(editor);
}

/**
 * Redraw the outline where it is. The map is rebuilt wholesale by generate and by a ring
 * resize, which throws the layer away along with everything else.
 *
 * @param {any} editor
 */
export function refreshHexSelection(editor) {
    if (!editor) return;
    const alive = selectedHexes(editor).filter(l => editor.hexes?.[l]);
    if (alive.length !== selectedHexes(editor).length) {
        // A smaller map after Remove Ring, or a fresh one after Generate.
        editor.selectedHexLabels = alive;
        announce(editor);
        return;
    }
    draw(editor);
}
