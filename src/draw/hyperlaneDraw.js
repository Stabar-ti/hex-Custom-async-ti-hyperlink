/**
 * SVG construction for hyperlane links — pure drawing, no state and no event wiring.
 *
 * Replaces the drawing half of draw/links.js, which had three problems this file fixes by
 * construction:
 *
 *   - It appended every node straight to the SVG root (links.js:85, 123, 148) rather than
 *     into a layer, so links were not in SVG_LAYER_ORDER and enforceSvgLayerOrder pushed
 *     every named layer on top of them. Drawn links sat underneath tile images, which are
 *     opaque, so on an imaged map they were invisible. These functions take an explicit
 *     `parent` instead, like loreDraw.js does.
 *   - drawLoopCircle set `stroke: 'blue'` inline (links.js:142), overriding the
 *     `.link-line` rule in styles.css:226 that every other link honours. The attribute is
 *     simply gone here; the stylesheet is the one place link colour is decided.
 *   - The self-loop circle carried only `data-via`, while the curve carried via/entry/exit
 *     — so the old _unlink, which matched on all three, could never find a circle to
 *     remove and left it orphaned on the map (hyperlanes.js:134). Every node this module
 *     makes carries the full identity triple.
 *
 * Geometry lives in hyperlaneGeometry.js; this file only turns numbers into elements.
 */

import {
    curvePath, oneWayArrowPoint, sideArrowPoint, arrowPoints, edgeMid, loopArm, loopCircleRadius
} from '../modules/Hyperlanes/hyperlaneGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
}

/**
 * Tags a node with the hex and edges it belongs to.
 *
 * `data-via` is what identifies every node owned by one hex, and is how the render layer
 * finds a hex's SVG without keeping a parallel array of node references.
 */
function tag(node, viaLabel, entry, exit) {
    node.classList.add('link-line');
    node.dataset.via = viaLabel;
    node.dataset.entry = entry;
    node.dataset.exit = exit;
    return node;
}

/**
 * The arrowhead on a one-way lane. It is tagged like the lane — so clearing the hex takes
 * it too — but carries `link-arrow` instead of `link-line`, which would stroke it as a lane.
 */
function arrow(viaLabel, entry, exit, points) {
    const node = el('polygon', { points });
    node.classList.add('link-arrow');
    node.dataset.via = viaLabel;
    node.dataset.entry = entry;
    node.dataset.exit = exit;
    return node;
}

/**
 * A link curving between two edges of one hex. A one-way link is drawn amber with an
 * arrowhead near its exit, as the bot draws it; `entry` → `exit` is then the direction
 * it may be travelled.
 *
 * `withArrow: false` leaves the arrowhead to drawSideArrow, for a side several one-way
 * lanes share as their exit.
 *
 * @param {SVGElement} parent
 * @param {{center: {x: number, y: number}, entry: number, exit: number,
 *          radius: number, viaLabel: string, oneWay?: boolean, withArrow?: boolean}} opts
 * @returns {SVGPathElement}
 */
export function drawSegment(parent, { center, entry, exit, radius, viaLabel, oneWay = false, withArrow = true }) {
    const path = el('path', { d: curvePath(center, entry, exit, radius) });
    tag(path, viaLabel, entry, exit);
    parent.appendChild(path);
    if (oneWay) {
        path.classList.add('link-oneway');
        if (withArrow) {
            const at = oneWayArrowPoint(center, entry, exit, radius);
            parent.appendChild(arrow(viaLabel, entry, exit, arrowPoints(at, at.angle, radius)));
        }
    }
    return path;
}

/**
 * One arrowhead for a side that every lane touching it leaves by.
 *
 * @param {SVGElement} parent
 * @param {{center: {x: number, y: number}, side: number, radius: number, viaLabel: string}} opts
 */
export function drawSideArrow(parent, { center, side, radius, viaLabel }) {
    const at = sideArrowPoint(center, side, radius);
    const node = arrow(viaLabel, side, side, arrowPoints(at, at.angle, radius));
    parent.appendChild(node);
    return node;
}

/**
 * A roundabout: one circle at the hex centre, and a stub in to it from each of its sides.
 *
 * The circle used to be drawn once per side, all of them stacked on the same spot; it is
 * drawn once now. Every node carries the tile's label, so clearing the tile takes all of
 * them and none can be left behind when the others go.
 *
 * A side that can only be entered or only be left is drawn one-way: amber, with an
 * arrowhead pointing in to the circle or out of it.
 *
 * @param {SVGElement} parent
 * @param {{center: {x: number, y: number}, sides: number[],
 *          radius: number, viaLabel: string,
 *          roles?: Record<number, 'entry'|'exit'|'both'>}} opts
 * @returns {SVGElement[]}
 */
export function drawRoundabout(parent, { center, sides, radius, viaLabel, roles = {} }) {
    const nodes = [];
    for (const side of sides) {
        const { x1, y1, x2, y2 } = loopArm(center, side, radius);
        const line = tag(el('line', { x1, y1, x2, y2 }), viaLabel, side, side);
        nodes.push(line);
        const role = roles[side];
        if (role !== 'entry' && role !== 'exit') continue;
        line.classList.add('link-oneway');
        const inward = role === 'entry';
        const tip = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        const angle = inward ? Math.atan2(y2 - y1, x2 - x1) : Math.atan2(y1 - y2, x1 - x2);
        nodes.push(arrow(viaLabel, side, side, arrowPoints(tip, angle, radius)));
    }
    const circle = el('circle', { cx: center.x, cy: center.y, r: loopCircleRadius(radius) });
    tag(circle, viaLabel, sides[0], sides[0]);
    circle.classList.add('link-roundabout');
    nodes.push(circle);
    for (const node of nodes) parent.appendChild(node);
    return nodes;
}

// Re-exported so callers that only need a point on the hex edge (hover targets, future
// overlays) do not have to reach into the geometry module directly.
export { edgeMid };
