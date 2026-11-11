// @ts-check
/**
 * Pixel math for bridges and portals, scaled from the bot's drawing (BridgeTrail,
 * HyperlaneBridgeOverlay, PortalTokens), whose tiles are 345 × 300 px: circumradius 172.5,
 * apothem 150. Everything here is a fraction of the editor's hex radius, so it scales with
 * the map. Pure — returns numbers and `d` strings, loads under node.
 *
 * Sides are hexGrid's (0 = N … 5 = NW); hexVertices orders corners so side s runs from
 * v[s] to v[s+1], so the rim stretch ("gap") g from side g to side g+1 turns at corner g+1.
 */

import { edgeMidpoint, hexVertices } from '../../utils/hexGeometry.js';

/** Bot pixels per editor radius unit. */
const BOT_RADIUS = 172.5;
/** The rim trail runs this far inside the edge (BridgeTrail INSET 8 of apothem 150). */
export const RIM_SCALE = (150 - 8) / 150;
/** How far each rim corner is rounded, from the corner (26 bot px). */
const CORNER_ROUND = 26 / BOT_RADIUS;
/** Ring slots sit this far out (SLOT_DISTANCE 104), centre token radius 26, ring ones 21. */
const SLOT_DISTANCE = 104 / BOT_RADIUS;
const CENTRE_TOKEN = 26 / BOT_RADIUS;
const RING_TOKEN = 21 / BOT_RADIUS;
/** The ring a portal hangs off (PortalTokens RING_RADIUS 60 ≈ the editor's loop circle). */
const RING_RADIUS = 60 / BOT_RADIUS;

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const fmt = (p) => `${round(p.x)},${round(p.y)}`;
const round = (n) => Math.round(n * 100) / 100;

/** The inset rim's corners. */
function rimCorners(center, radius) {
    return hexVertices(center, radius * RIM_SCALE);
}

/** Midpoint of side `side` on the inset rim. */
export function rimMid(center, side, radius) {
    return edgeMidpoint(center, radius * RIM_SCALE, side);
}

/**
 * The rounded turn at rim corner `corner`: where the trail leaves the straight edge, the
 * corner itself (the quadratic's control point), and where it rejoins.
 */
function cornerTurn(center, radius, corner) {
    const v = rimCorners(center, radius);
    const c = v[((corner % 6) + 6) % 6];
    const prev = v[((corner - 1) % 6 + 6) % 6];
    const next = v[(corner + 1) % 6];
    const side = Math.hypot(c.x - prev.x, c.y - prev.y) || 1;
    const t = Math.min(0.45, (CORNER_ROUND * radius) / side);
    return { from: lerp(c, prev, t), corner: c, to: lerp(c, next, t) };
}

/**
 * A bridge lane's trail: in from the tile edge at `from`, clockwise along the rim through
 * `gaps`, and out at `to`. Also returns each corner's apex and the clockwise direction of
 * travel there, for one-way arrows.
 *
 * @param {{x: number, y: number}} center
 * @param {number} radius
 * @param {number} from   the side the clockwise walk starts at
 * @param {number} to     the side it ends at
 * @param {number[]} gaps the rim gaps covered, in walking order (rimGaps)
 * @returns {{d: string, corners: Array<{x: number, y: number, angle: number}>,
 *            ends: Array<{side: number, x: number, y: number, angle: number}>}}
 */
export function bridgeTrail(center, radius, from, to, gaps) {
    const start = edgeMidpoint(center, radius, from);
    const end = edgeMidpoint(center, radius, to);
    const parts = [`M${fmt(start)}`, `L${fmt(rimMid(center, from, radius))}`];
    const corners = [];
    for (const gap of gaps) {
        const turn = cornerTurn(center, radius, gap + 1);
        parts.push(`L${fmt(turn.from)}`, `Q${fmt(turn.corner)} ${fmt(turn.to)}`);
        // The quadratic's point at t = 0.5, heading from its start to its end.
        const apex = lerp(lerp(turn.from, turn.corner, 0.5), lerp(turn.corner, turn.to, 0.5), 0.5);
        corners.push({ ...apex, angle: Math.atan2(turn.to.y - turn.from.y, turn.to.x - turn.from.x) });
    }
    parts.push(`L${fmt(rimMid(center, to, radius))}`, `L${fmt(end)}`);
    return { d: parts.join(' '), corners, ends: [gateBar(center, radius, from), gateBar(center, radius, to)] };
}

/**
 * Where a gate bar sits at side `side`: 9 bot px in from the edge midpoint, parallel to
 * the edge (`angle` is the edge's direction).
 */
export function gateBar(center, radius, side) {
    const mid = edgeMidpoint(center, radius, side);
    const v = hexVertices(center, radius);
    const a = v[side], b = v[(side + 1) % 6];
    const inward = lerp(mid, center, 9 / 150); // 9 px of the bot's 150 px apothem
    return { side, x: inward.x, y: inward.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Gate bar size, as [length, thickness] (the bot's 26 × 6, made a touch bolder). */
export function gateBarSize(radius) {
    return [radius * 0.2, radius * 0.06];
}

/** Stroke widths for a bridge lane: [glow, core]. */
export function bridgeStrokes(radius) {
    return [radius * 0.14, radius * 0.05];
}

/**
 * Where portal slot `slot` sits and how big its token is. Slot k (1-6) is at
 * (k − 1)·60° + 30° clockwise from north, between two spokes; slot 0 is the centre.
 * @returns {{x: number, y: number, r: number, angle: number|null}}
 */
export function portalSlotPoint(center, radius, slot) {
    if (slot === 0) return { x: center.x, y: center.y, r: radius * CENTRE_TOKEN, angle: null };
    const angle = ((slot - 1) * 60 + 30) * Math.PI / 180;
    const d = radius * SLOT_DISTANCE;
    return { x: center.x + d * Math.sin(angle), y: center.y - d * Math.cos(angle), r: radius * RING_TOKEN, angle };
}

/**
 * The connector from the ring out to a ring slot's token, and where its one-way arrow sits.
 * `inward` arrows (exit-only: ships arrive onto the ring) point at the centre.
 */
export function portalConnector(center, radius, slot) {
    const p = portalSlotPoint(center, radius, slot);
    const a = /** @type {number} */ (p.angle);
    const at = (d) => ({ x: center.x + d * Math.sin(a), y: center.y - d * Math.cos(a) });
    const r0 = radius * RING_RADIUS;
    const r1 = radius * SLOT_DISTANCE - p.r;
    const outward = Math.atan2(-Math.cos(a), Math.sin(a));
    return { from: at(r0), to: at(r1), mid: at((r0 + r1) / 2), outward, inward: outward + Math.PI };
}

/** The one-way arrow of the centre portal: above the token, pointing down for entry-only. */
export function centrePortalArrow(center, radius, entryOnly) {
    return { x: center.x, y: center.y - radius * (43 / BOT_RADIUS), angle: entryOnly ? Math.PI / 2 : -Math.PI / 2 };
}

/** Radius of the bare ring drawn on an interchange (an `hl` with portals and no lanes). */
export function portalRingRadius(radius) {
    return radius * RING_RADIUS;
}
