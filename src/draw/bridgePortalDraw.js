/**
 * SVG for hyperlane bridges and portals — pure drawing into an explicit parent, like
 * hyperlaneDraw.js. Every node carries `data-via` (the hex label), so renderHex /
 * clearHexSegments take them away with the hex's lanes.
 *
 * Drawn to read like the bot's map (HyperlaneBridgeOverlay, PortalTokens), simplified:
 *   - bridge: a lane trailing just inside the rim between its sides; blue two-way, amber
 *     one-way; a red bar where ships enter a one-way lane, a green one where they leave;
 *     green arrows in the corners along the way.
 *   - portal: a dark disc with a ring and the letter in the letter's colour, joined to the
 *     roundabout ring by a connector of the same colour; one-way portals carry a green
 *     arrowhead on it (into the portal for entry-only, onto the ring for exit-only).
 */

import { arrowPoints } from '../modules/Hyperlanes/hyperlaneGeometry.js';
import {
    bridgeStrokes, bridgeTrail, centrePortalArrow, gateBarSize, portalConnector,
    portalRingRadius, portalSlotPoint
} from '../modules/Hyperlanes/bridgePortalGeometry.js';
import { chosenLayout, entersAt, exitsAt } from '../modules/Hyperlanes/bridgeModel.js';
import { portalColour, portalLetterColour } from '../modules/Hyperlanes/portalModel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs, viaLabel, cls) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
    if (cls) node.setAttribute('class', cls);
    node.dataset.via = viaLabel;
    return node;
}

/**
 * A hex's bridge.
 *
 * @param {SVGElement} parent
 * @param {{center: {x: number, y: number}, radius: number, viaLabel: string,
 *          bridge: number[][], invalid?: boolean}} opts
 */
export function drawBridge(parent, { center, radius, viaLabel, bridge, invalid = false }) {
    const [glow, core] = bridgeStrokes(radius);
    const group = el('g', {}, viaLabel, `bridge${invalid ? ' bridge-invalid' : ''}`);
    const [barLen, barThick] = gateBarSize(radius);
    for (const lane of chosenLayout(bridge)) {
        const lowToHigh = bridge[lane.low][lane.high] === 1;
        const highToLow = bridge[lane.high][lane.low] === 1;
        const oneWay = lowToHigh !== highToLow;
        const from = lane.clockwiseFromLow ? lane.low : lane.high;
        const to = lane.clockwiseFromLow ? lane.high : lane.low;
        const trail = bridgeTrail(center, radius, from, to, lane.gaps);
        const kind = oneWay ? 'bridge-oneway' : 'bridge-twoway';
        group.appendChild(el('path', { d: trail.d, 'stroke-width': glow }, viaLabel, `bridge-glow ${kind}`));
        group.appendChild(el('path', { d: trail.d, 'stroke-width': core }, viaLabel, `bridge-core ${kind}`));
        if (!oneWay) continue;
        // Does travel run the way the trail was walked (clockwise from `from`)?
        const forward = (from === lane.low) === lowToHigh;
        for (const c of trail.corners) {
            const angle = forward ? c.angle : c.angle + Math.PI;
            group.appendChild(el('polygon', { points: arrowPoints(c, angle, radius * 0.75) }, viaLabel, 'link-arrow bridge-arrow'));
        }
        for (const end of trail.ends) {
            const entry = entersAt(bridge, end.side) && !exitsAt(bridge, end.side);
            const deg = end.angle * 180 / Math.PI;
            group.appendChild(el('rect', {
                x: end.x - barLen / 2, y: end.y - barThick / 2, width: barLen, height: barThick,
                rx: barThick / 2, transform: `rotate(${deg} ${end.x} ${end.y})`
            }, viaLabel, entry ? 'bridge-gate bridge-gate-entry' : 'bridge-gate bridge-gate-exit'));
        }
    }
    parent.appendChild(group);
    return group;
}

/**
 * A hex's portals.
 *
 * @param {SVGElement} parent
 * @param {{center: {x: number, y: number}, radius: number, viaLabel: string,
 *          portals: Array<{slot: number, letter: string, flow: string}>,
 *          withRing?: boolean, invalid?: boolean}} opts
 *   withRing: draw the bare ring too (an interchange has no roundabout to hang off).
 */
export function drawPortals(parent, { center, radius, viaLabel, portals, withRing = false, invalid = false }) {
    const group = el('g', {}, viaLabel, `portals${invalid ? ' portals-invalid' : ''}`);
    if (withRing) {
        group.appendChild(el('circle', { cx: center.x, cy: center.y, r: portalRingRadius(radius) }, viaLabel, 'link-line link-roundabout portal-ring'));
    }
    for (const p of portals) {
        const colour = portalColour(p.letter);
        const tok = portalSlotPoint(center, radius, p.slot);
        if (p.slot !== 0) {
            const c = portalConnector(center, radius, p.slot);
            const line = { x1: c.from.x, y1: c.from.y, x2: c.to.x, y2: c.to.y };
            group.appendChild(el('line', { ...line, stroke: colour, 'stroke-width': radius * 0.07 }, viaLabel, 'portal-connector-glow'));
            group.appendChild(el('line', { ...line, stroke: colour, 'stroke-width': radius * 0.025 }, viaLabel, 'portal-connector'));
            if (p.flow !== 'both') {
                const angle = p.flow === 'entry' ? c.outward : c.inward;
                group.appendChild(el('polygon', { points: arrowPoints(c.mid, angle, radius * 0.6) }, viaLabel, 'link-arrow portal-arrow'));
            }
        } else if (p.flow !== 'both') {
            const a = centrePortalArrow(center, radius, p.flow === 'entry');
            group.appendChild(el('polygon', { points: arrowPoints(a, a.angle, radius * 0.6) }, viaLabel, 'link-arrow portal-arrow'));
        }
        group.appendChild(el('circle', { cx: tok.x, cy: tok.y, r: tok.r * 1.6, fill: colour }, viaLabel, 'portal-halo'));
        group.appendChild(el('circle', { cx: tok.x, cy: tok.y, r: tok.r, stroke: colour, 'stroke-width': Math.max(0.6, tok.r * 0.17) }, viaLabel, 'portal-disc'));
        const font = tok.r * 1.2;
        const text = (dx, cls, fill) => {
            const t = el('text', {
                x: tok.x + dx, y: tok.y + dx, 'font-size': font, fill,
                'text-anchor': 'middle', 'dominant-baseline': 'central'
            }, viaLabel, cls);
            t.textContent = p.letter;
            return t;
        };
        group.appendChild(text(font * 0.05, 'portal-letter-shadow', '#050a19'));
        group.appendChild(text(0, 'portal-letter', portalLetterColour(p.letter)));
    }
    parent.appendChild(group);
    return group;
}
