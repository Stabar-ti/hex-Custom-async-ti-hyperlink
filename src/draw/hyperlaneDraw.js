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
    curvePath, edgeMid, loopArm, loopCircleRadius
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
 * A link curving between two edges of one hex.
 *
 * @param {SVGElement} parent
 * @param {{center: {x: number, y: number}, entry: number, exit: number,
 *          radius: number, viaLabel: string}} opts
 * @returns {SVGPathElement}
 */
export function drawSegment(parent, { center, entry, exit, radius, viaLabel }) {
    const path = el('path', { d: curvePath(center, entry, exit, radius) });
    tag(path, viaLabel, entry, exit);
    parent.appendChild(path);
    return path;
}

/**
 * A self-loop: a stub in from the edge, meeting a circle at the hex centre.
 *
 * Returns both nodes. They are drawn and removed together, and both carry the same
 * identity, so neither can be left behind when the other goes.
 *
 * @param {SVGElement} parent
 * @param {{center: {x: number, y: number}, entry: number,
 *          radius: number, viaLabel: string}} opts
 * @returns {[SVGLineElement, SVGCircleElement]}
 */
export function drawLoop(parent, { center, entry, radius, viaLabel }) {
    const { x1, y1, x2, y2 } = loopArm(center, entry, radius);
    const arm = el('line', { x1, y1, x2, y2 });
    tag(arm, viaLabel, entry, entry);

    const circle = el('circle', {
        cx: center.x,
        cy: center.y,
        r: loopCircleRadius(radius)
    });
    tag(circle, viaLabel, entry, entry);

    parent.appendChild(arm);
    parent.appendChild(circle);
    return [arm, circle];
}

// Re-exported so callers that only need a point on the hex edge (hover targets, future
// overlays) do not have to reach into the geometry module directly.
export { edgeMid };
