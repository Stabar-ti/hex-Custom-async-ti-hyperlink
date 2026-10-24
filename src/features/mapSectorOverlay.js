// @ts-check
/**
 * The map sector layer: each sector as a translucent fill in its colour, an outline round
 * the whole region, and its name.
 *
 * The outline is traced edge by edge the way hexSelection traces a selection: a side is
 * drawn exactly when the hex across it is not in the same sector. So a sector reads as one
 * shape, and two sectors that touch get a border between them in both their colours.
 *
 * The layer is rebuilt from scratch on every call, from the hexes alone; there is no state
 * here to fall out of step with the map.
 */

import { EDGE_DIRECTIONS, buildCoordIndex, coordKey } from '../utils/hexGrid.js';
import { hexPoints, sideCorners } from '../utils/hexGeometry.js';
import { listSectors } from './mapSectors.js';
import { mapSectorColours } from './mapSectorEditing.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAP_SECTOR_LAYER_ID = 'mapSectorLayer';
const VISIBLE_KEY = 'ti4-map-sectors-visible';

/** Fired on `document` when the layer is shown or hidden. */
export const MAP_SECTORS_VISIBILITY_CHANGED = 'ti4:map-sectors-visibility';

/** @returns {boolean} */
export function mapSectorsVisible() {
    try {
        return localStorage.getItem(VISIBLE_KEY) !== '0';
    } catch {
        return true;
    }
}

/** @param {any} editor @param {boolean} visible */
export function setMapSectorsVisible(editor, visible) {
    try {
        localStorage.setItem(VISIBLE_KEY, visible ? '1' : '0');
    } catch { /* the layer just forgets between sessions */ }
    drawMapSectorLayer(editor);
    document.dispatchEvent(new CustomEvent(MAP_SECTORS_VISIBILITY_CHANGED, { detail: { visible } }));
}

/**
 * Redraw the layer. Safe to call at any time; with nothing painted, or the layer switched
 * off, it only removes the old one.
 *
 * The sector the panel is painting with (editor._activeMapSector) is drawn a little bolder.
 *
 * @param {any} editor
 */
export function drawMapSectorLayer(editor) {
    if (!editor?.svg) return;
    editor.svg.querySelector('#' + MAP_SECTOR_LAYER_ID)?.remove();
    if (!mapSectorsVisible()) return;

    const sectors = listSectors(editor.hexes);
    if (!sectors.size) return;

    const active = editor._activeMapSector || null;
    const colours = mapSectorColours(editor);
    const R = editor.hexRadius || 40;
    const coordIndex = buildCoordIndex(editor.hexes);

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = MAP_SECTOR_LAYER_ID;
    // Painting a region must never stop you clicking the hex underneath.
    layer.style.pointerEvents = 'none';

    const fills = document.createElementNS(SVG_NS, 'g');
    const under = document.createElementNS(SVG_NS, 'g');
    const over = document.createElementNS(SVG_NS, 'g');
    const names = document.createElementNS(SVG_NS, 'g');
    under.setAttribute('stroke', '#000');
    under.setAttribute('stroke-opacity', '0.55');
    under.setAttribute('stroke-width', '5');
    under.setAttribute('stroke-linecap', 'round');
    over.setAttribute('stroke-linecap', 'round');

    for (const [name, members] of sectors) {
        const color = colours.get(name) || '#ffffff';
        const bold = name === active;
        const inSector = new Set(members);

        let sx = 0, sy = 0, n = 0;
        for (const label of members) {
            const hex = editor.hexes[label];
            if (!hex?.center) continue;
            sx += hex.center.x; sy += hex.center.y; n++;

            const poly = document.createElementNS(SVG_NS, 'polygon');
            poly.setAttribute('points', hexPoints(hex.center, R * 0.98));
            poly.setAttribute('fill', color);
            poly.setAttribute('fill-opacity', bold ? '0.42' : '0.32');
            fills.appendChild(poly);

            for (let s = 0; s < 6; s++) {
                const dir = EDGE_DIRECTIONS[s];
                const across = coordIndex.get(coordKey(hex.q + dir.q, hex.r + dir.r));
                if (across && inSector.has(across)) continue;
                // Inset a little, so where two sectors meet both their colours show.
                const [a, b] = sideCorners(hex.center, R * 0.9, s);
                for (const host of [under, over]) {
                    const line = document.createElementNS(SVG_NS, 'line');
                    line.setAttribute('x1', String(a.x));
                    line.setAttribute('y1', String(a.y));
                    line.setAttribute('x2', String(b.x));
                    line.setAttribute('y2', String(b.y));
                    if (host === over) {
                        line.setAttribute('stroke', color);
                        line.setAttribute('stroke-width', bold ? '3.5' : '2.5');
                    }
                    host.appendChild(line);
                }
            }
        }
        if (!n) continue;

        // The name goes on the member nearest the middle of the region, so it sits inside
        // the sector even when the sector is a ring or a crescent.
        const cx = sx / n, cy = sy / n;
        let best = null, bestD = Infinity;
        for (const label of members) {
            const c = editor.hexes[label]?.center;
            if (!c) continue;
            const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
            if (d < bestD) { bestD = d; best = c; }
        }
        if (!best) continue;
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(best.x));
        text.setAttribute('y', String(best.y + R * 0.62));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', String(Math.round(R * 0.32)));
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', color);
        text.setAttribute('stroke', '#000');
        text.setAttribute('stroke-width', '3');
        text.setAttribute('paint-order', 'stroke');
        text.textContent = name;
        names.appendChild(text);
    }

    layer.append(fills, under, over, names);
    editor.svg.appendChild(layer);
    enforceSvgLayerOrder(editor.svg);
}
