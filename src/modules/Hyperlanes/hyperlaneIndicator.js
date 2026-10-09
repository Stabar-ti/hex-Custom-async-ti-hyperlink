/**
 * Shows what the next click will do.
 *
 * Drawing a link takes three clicks, and until now the only feedback was a yellow fill on
 * the hexes you had already clicked. Two things were invisible:
 *
 *   - WHICH hex receives the link. It is the middle one of the three, not the one you
 *     click last, so on the third click the link appears on a tile you are not pointing at.
 *   - That the gesture CONTINUES. After a segment is drawn the last two hexes stay in the
 *     path so a run of links can be laid in one sweep (keepTail(2) in hyperlaneEditing),
 *     but they are un-highlighted at the same moment — so the tool looks like it reset when
 *     it did not, and the next click lands somewhere surprising.
 *
 * So this draws, from the gesture state:
 *   - a ring on the ACTIVE hex — the one whose matrix the next click writes
 *   - a tick on the edge the link will enter through, which is already decided
 *   - dashed outlines on the hexes that are legal to click next
 *   - two buttons on the rim of the active hex: ✓ finishes the lane there (so does clicking
 *     the hex itself), and ○ puts a roundabout on it. They sit in the corners of the side
 *     opposite the one the lane came in by, away from the entry tick, and inside the hex,
 *     so they never cover a neighbour you might click next. The idea is the pair of
 *     buttons a CAD tool puts on the last node of a spline.
 *
 * Colour follows intent: amber while drawing, red while Alt-erasing.
 *
 * It renders off `hyperlaneState.subscribe`, so every path that changes the gesture — a
 * click, Escape, right-click, a mode switch, an undo — updates it without having to know
 * this file exists.
 */

import * as state from './hyperlaneState.js';
import { EDGE_DIRECTIONS, dirIndexBetween } from './hyperlaneModel.js';
import { edgeMid, hexCorners } from './hyperlaneGeometry.js';
import { finishLane, headIsOnRoundabout, roundaboutAtHead } from './hyperlaneEditing.js';
import { sideCorners } from '../../utils/hexGeometry.js';
import { enforceSvgLayerOrder } from '../../draw/enforceSvgLayerOrder.js';

export const INDICATOR_LAYER_ID = 'hyperlane-indicator-layer';

const SVG_NS = 'http://www.w3.org/2000/svg';

let editorRef = null;
let unsubscribe = null;

function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
}

/** Find-or-create, tolerating generateMap having emptied the SVG. */
function ensureLayer(svg) {
    if (!svg) return null;
    let layer = svg.querySelector(`#${INDICATOR_LAYER_ID}`);
    if (layer && !layer.isConnected) layer = null;
    if (!layer) {
        layer = el('g', { id: INDICATOR_LAYER_ID });
        layer.style.pointerEvents = 'none';
        svg.appendChild(layer);
        enforceSvgLayerOrder(svg);
    }
    return layer;
}

/**
 * The hex the next click will write to, or null if the gesture is not far enough along.
 *
 * With a path of [A, B], clicking X makes [A, B, X] and resolveSegment takes the middle of
 * the last three — B. So the active hex is the last element of the current path, and only
 * once there are at least two.
 */
export function activeLabel(path = state.getPath()) {
    return path.length >= 2 ? path[path.length - 1] : null;
}

/** Labels that may legally be clicked next: the neighbours of the path's head. */
function candidateLabels(editor, path) {
    const head = path[path.length - 1];
    const hex = editor.hexes[head];
    if (!hex) return [];
    const byCoord = editor._hlCoordIndex;
    const out = [];
    for (const d of EDGE_DIRECTIONS) {
        const label = byCoord.get(`${hex.q + d.q},${hex.r + d.r}`);
        if (label) out.push(label);
    }
    return out;
}

/** How far toward a corner a rim button sits, as a fraction of the radius. */
const BUTTON_REACH = 0.7;
/** A rim button's radius, as a fraction of the hex radius. It fits inside the corner. */
const BUTTON_SIZE = 0.2;

/**
 * One rim button. The layer ignores the pointer, so the button turns it back on for
 * itself; a click on it lands on the button and never reaches the hex underneath.
 *
 * @param {{x: number, y: number}} at
 * @param {number} r
 * @param {{kind: string, title: string, icon: SVGElement, on?: boolean, onClick: () => void}} opts
 */
function rimButton(at, r, { kind, title, icon, on = false, onClick }) {
    const g = el('g', { transform: `translate(${at.x} ${at.y})`, role: 'button', 'aria-label': title });
    g.classList.add('hl-btn', `hl-btn--${kind}`);
    if (on) g.classList.add('is-on');
    g.style.pointerEvents = 'auto';

    const tip = el('title');
    tip.textContent = title;
    // A slightly larger invisible disc, so a near miss still counts as the button rather
    // than as a click on the hex — which would finish the lane.
    const hit = el('circle', { r: r * 1.3 });
    hit.classList.add('hl-btn__hit');
    const face = el('circle', { r });
    face.classList.add('hl-btn__face');
    icon.classList.add('hl-btn__icon');
    g.append(tip, hit, face, icon);

    g.addEventListener('click', event => {
        event.stopPropagation();
        onClick();
    });
    return g;
}

/**
 * The ✓ and ○ buttons for the active hex. While erasing only ✓ is drawn: an erase
 * gesture takes lanes away, and a roundabout is not something it should put down.
 */
function drawRimButtons(layer, editor, hex, entry, erasing) {
    const radius = editor.hexRadius;
    const r = radius * BUTTON_SIZE;
    const toward = p => ({
        x: hex.center.x + (p.x - hex.center.x) * BUTTON_REACH,
        y: hex.center.y + (p.y - hex.center.y) * BUTTON_REACH
    });
    // The two corners of the far side, left to right on screen, so ✓ reads first.
    const spots = sideCorners(hex.center, radius, (entry + 3) % 6).map(toward)
        .sort((a, b) => (a.x - b.x) || (a.y - b.y));

    const check = el('path', {
        d: `M${-0.42 * r},${0.02 * r} L${-0.12 * r},${0.32 * r} L${0.44 * r},${-0.3 * r}`
    });
    layer.appendChild(rimButton(spots[0], r, {
        kind: 'finish',
        title: 'Finish the lane here (or click this tile, or press Enter)',
        icon: check,
        onClick: () => finishLane(editor)
    }));

    if (erasing) return;
    const on = headIsOnRoundabout(editor);
    layer.appendChild(rimButton(spots[1], r, {
        kind: 'roundabout',
        title: on ? 'This lane is on the roundabout here' : 'Put a roundabout here',
        icon: el('circle', { r: r * 0.42 }),
        on,
        onClick: () => {
            roundaboutAtHead(editor);
            // The path did not change, so the store will not redraw this for us.
            render();
        }
    }));
}

/** Rebuilt on every gesture change; cheap enough at seven hexes to not bother diffing. */
function render() {
    const editor = editorRef;
    const layer = ensureLayer(editor?.svg);
    if (!layer) return;
    layer.replaceChildren();

    // Only meaningful while the hyperlane tool is the one receiving clicks.
    if (editor.mode !== 'hyperlane') return;

    const path = state.getPath();
    if (!path.length) return;

    // Coordinate index, rebuilt when the map size changes rather than per render.
    if (!editor._hlCoordIndex || editor._hlCoordIndexSize !== Object.keys(editor.hexes).length) {
        editor._hlCoordIndex = new Map(
            Object.entries(editor.hexes).map(([l, h]) => [`${h.q},${h.r}`, l])
        );
        editor._hlCoordIndexSize = Object.keys(editor.hexes).length;
    }

    const erasing = state.isUnlinking();
    const radius = editor.hexRadius;
    const active = activeLabel(path);

    // 1. Where you may click next.
    for (const label of candidateLabels(editor, path)) {
        const hex = editor.hexes[label];
        if (!hex?.center) continue;
        const ring = el('polygon', { points: hexCorners(hex.center, radius * 0.94) });
        ring.classList.add('hl-candidate');
        if (erasing) ring.classList.add('is-erasing');
        layer.appendChild(ring);
    }

    // 2. The hex that will actually receive the link.
    if (active) {
        const hex = editor.hexes[active];
        if (hex?.center) {
            // Two stacked rings: a dark halo under a bright one. A single amber ring
            // vanished against the `.selected` yellow fill (styles.css:221) that the same
            // hex is already wearing, and a single dark ring is invisible on the dark page
            // background outside the map. The pair reads on both.
            const points = hexCorners(hex.center, radius * 0.88);
            const halo = el('polygon', { points });
            halo.classList.add('hl-active-halo');
            layer.appendChild(halo);

            const ring = el('polygon', { points });
            ring.classList.add('hl-active');
            if (erasing) ring.classList.add('is-erasing');
            layer.appendChild(ring);

            // The entry edge is already fixed by the hex clicked before this one, so show
            // which side the link comes in through.
            const prev = editor.hexes[path[path.length - 2]];
            const entry = prev ? dirIndexBetween(hex, prev) : -1;
            if (entry >= 0) {
                const mid = edgeMid(hex.center, entry, radius);
                const tick = el('circle', { cx: mid.x, cy: mid.y, r: Math.max(3, radius * 0.1) });
                tick.classList.add('hl-entry');
                if (erasing) tick.classList.add('is-erasing');
                layer.appendChild(tick);

                drawRimButtons(layer, editor, hex, entry, erasing);
            }
        }
    }
}

/** Starts drawing the indicator and keeps it in step with the gesture. */
export function installIndicator(editor) {
    editorRef = editor;
    unsubscribe?.();
    unsubscribe = state.subscribe(render);
    render();
}

export function uninstallIndicator() {
    unsubscribe?.();
    unsubscribe = null;
    editorRef?.svg?.querySelector(`#${INDICATOR_LAYER_ID}`)?.remove();
    editorRef = null;
}

/** For callers that change something the store cannot see, such as editor.mode. */
export function refreshIndicator() {
    if (editorRef) render();
}
