/**
 * SVG construction for the lore map layer — pure drawing, no state and no event wiring.
 *
 * The old markers were 24x18 opaque rectangles sitting over the middle of the tile: they hid
 * the artwork, the "book" and "scroll" variants differed only by one line versus three, and
 * the glyph carried a single bit of information (system / planet / both). Planet lore was
 * drawn at the hex centre no matter which planet it belonged to.
 *
 * These markers are small, sit on the thing they describe, and encode three things at once:
 *   position  — the system slot, or the planet the lore is attached to
 *   glyph     — the trigger (what makes it fire)
 *   rim       — the gate (plain / Accept-Reject / dice roll)
 * Everything else stays in the hover tooltip; the board has to stay readable.
 */

import { COLORS, FONTS } from '../constants/designTokens.js';
import { planetAnchor } from './hexAnchors.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MARKER_RADIUS = 8;

/** One glyph per trigger. Chosen from the symbol range the project's icon font covers. */
const TRIGGER_GLYPHS = {
    CONTROLLED:    '⚑',
    ACTIVATED:     '◎',
    MOVED:         '➜',
    SPACE_BATTLE:  '✦',
    GROUND_BATTLE: '▲',
    PHASE_START:   '⏱',
    PHASE_END:     '⏱'
};

export const TRIGGER_LEGEND = [
    ['CONTROLLED', '⚑', 'Target is in control'],
    ['ACTIVATED', '◎', 'Target is activated'],
    ['MOVED', '➜', 'Units are moved in'],
    ['SPACE_BATTLE', '✦', 'Space battle fought here'],
    ['GROUND_BATTLE', '▲', 'Ground battle fought here']
];

/** System lore and planet lore get different fills so the two read apart at a glance. */
const SYSTEM_FILL = COLORS.popupLore;   // purple
const PLANET_FILL = COLORS.info;        // blue

function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
}

/**
 * Where a marker sits. System lore goes above-left of centre, clear of the top planet
 * (which sits at angle -90). Planet lore sits just above its own planet circle (r=10).
 */
export function markerPosition(hex, hexRadius, kind, planetIndex) {
    if (kind === 'planet') {
        const anchor = planetAnchor(hex, planetIndex, hexRadius);
        if (!anchor) return null;
        return { x: anchor.x + 11, y: anchor.y - 11 };
    }
    return { x: hex.center.x - hexRadius * 0.42, y: hex.center.y + hexRadius * 0.34 };
}

/**
 * A marker: filled disc, trigger glyph, rim encoding the gate, optional count badge.
 * `summary` describes what's behind it — see LoreOverlay.summarizeTarget.
 */
export function drawMarker(parent, { x, y, kind, summary, focused }) {
    const group = el('g', {
        class: `lore-marker lore-marker--${kind}${focused ? ' is-focused' : ''}`,
        transform: `translate(${x}, ${y})`
    });

    const fill = kind === 'planet' ? PLANET_FILL : SYSTEM_FILL;

    // Focus halo, drawn first so it sits behind the disc.
    if (focused) {
        group.appendChild(el('circle', {
            r: MARKER_RADIUS + 4, fill: 'none',
            stroke: COLORS.accent, 'stroke-width': 2, opacity: 0.9
        }));
    }

    const disc = el('circle', {
        r: MARKER_RADIUS,
        fill,
        'fill-opacity': 0.92,
        stroke: '#ffffff',
        'stroke-width': 1.5
    });

    // The rim says how the entry is gated, without spending another glyph slot on it.
    if (summary.gate === 'roll') {
        disc.setAttribute('stroke-dasharray', '2.5,2');
    } else if (summary.gate === 'choice') {
        disc.setAttribute('stroke-dasharray', '7,3');
    }
    group.appendChild(disc);

    const glyph = el('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '9',
        'font-family': FONTS.icon,
        fill: '#ffffff',
        y: '0.5'
    });
    glyph.textContent = TRIGGER_GLYPHS[summary.trigger] || '•';
    glyph.style.pointerEvents = 'none';
    group.appendChild(glyph);

    if (summary.count > 1) {
        const badge = el('g', { transform: `translate(${MARKER_RADIUS + 1}, ${-MARKER_RADIUS - 1})` });
        badge.appendChild(el('circle', {
            r: 6, fill: COLORS.surface1, stroke: '#ffffff', 'stroke-width': 1
        }));
        const count = el('text', {
            'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-size': '8', 'font-weight': 'bold', fill: '#ffffff'
        });
        count.textContent = summary.count > 9 ? '9+' : String(summary.count);
        badge.appendChild(count);
        group.appendChild(badge);
    }

    // A round-restricted entry gets a small clock below the disc.
    if (summary.hasRounds) {
        const clock = el('text', {
            'text-anchor': 'middle', 'font-size': '8',
            'font-family': FONTS.icon, y: MARKER_RADIUS + 8, fill: COLORS.accent
        });
        clock.textContent = '⏱';
        clock.style.pointerEvents = 'none';
        group.appendChild(clock);
    }

    parent.appendChild(group);
    return group;
}

const ARC_WIDTH = 3;
const ARC_CASING_WIDTH = ARC_WIDTH + 3.5;
const ARROW_SIZE = 10;

const ARC_COLOURS = {
    swap: COLORS.loreArcSwap,
    removes: COLORS.loreArcRemoves,
    affects: COLORS.loreArcAffects
};

/**
 * An arc from a lore marker to a tile the entry acts on — swaps, @target redirects and
 * token/unit placements all point at other tiles and previously drew nothing at all.
 *
 * Each arc is drawn twice: a dark casing stroke, then the colour on top. The map underneath
 * is tile artwork in every colour, so a single stroke disappears against roughly half of it
 * no matter which hue you pick. The casing is what makes these readable; it's the same
 * technique road maps use for routes over terrain.
 */
export function drawEffectArc(parent, from, to, { kind = 'affects' } = {}) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    // Bow the arc perpendicular to the line so two-way relationships stay distinguishable.
    const bow = Math.min(60, distance * 0.25);
    const mx = (from.x + to.x) / 2 - (dy / distance) * bow;
    const my = (from.y + to.y) / 2 + (dx / distance) * bow;

    const colour = ARC_COLOURS[kind] || ARC_COLOURS.affects;
    const d = `M ${from.x},${from.y} Q ${mx},${my} ${to.x},${to.y}`;

    // Casing first, underneath.
    parent.appendChild(el('path', {
        d,
        fill: 'none',
        stroke: COLORS.loreArcCasing,
        'stroke-width': ARC_CASING_WIDTH,
        'stroke-linecap': 'round',
        opacity: 0.75,
        class: 'lore-arc-casing'
    }));

    const path = el('path', {
        d,
        fill: 'none',
        stroke: colour,
        'stroke-width': ARC_WIDTH,
        'stroke-linecap': 'round',
        class: `lore-arc lore-arc--${kind}`
    });
    // Removals read as "taken away" rather than relying on colour alone.
    if (kind === 'removes') path.setAttribute('stroke-dasharray', '6,4');
    parent.appendChild(path);

    // Arrowhead at the destination, oriented along the curve's final tangent, outlined in
    // the same casing colour so it stays a distinct shape over bright tiles.
    const angle = Math.atan2(to.y - my, to.x - mx);
    const points = [
        `${to.x},${to.y}`,
        `${to.x - ARROW_SIZE * Math.cos(angle - 0.4)},${to.y - ARROW_SIZE * Math.sin(angle - 0.4)}`,
        `${to.x - ARROW_SIZE * Math.cos(angle + 0.4)},${to.y - ARROW_SIZE * Math.sin(angle + 0.4)}`
    ].join(' ');

    parent.appendChild(el('polygon', {
        points,
        fill: colour,
        stroke: COLORS.loreArcCasing,
        'stroke-width': 1.75,
        'stroke-linejoin': 'round',
        class: `lore-arrowhead lore-arrowhead--${kind}`
    }));
}
