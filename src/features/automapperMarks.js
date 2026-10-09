// @ts-check
/**
 * What the AutoMapper could not give you, drawn on the map.
 *
 * The result of a fill was reported as prose in the panel — a comma-joined list of hex
 * labels and a paragraph of reasons. To act on it you had to read a label, find that hex on
 * the map, and hold the reason in your head while you looked. For a handful that is
 * tedious; for twenty it does not work at all.
 *
 * The map already knows where every hex is, so the marks go there: an outline and a corner
 * badge per hex, with the reason on hover. The panel's list stays as the detail view.
 *
 * Three states, in the order they matter:
 *
 *   unfilled    nothing was placed, and nothing will be
 *   substituted a different tile type than the one painted
 *   tier        the right kind of tile, but not the value tier that was asked for
 *
 * Tokens are deliberately not marked. An anomaly drawn as a token is a normal outcome of a
 * map with more anomaly hexes than anomaly tiles, and marking it would put a badge on half
 * the board on an ordinary fill.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYER_ID = 'automapperMarkLayer';

/** Outline colour, badge glyph and wording per state. */
const MARK_STYLE = {
    unfilled:    { color: '#e35d4f', glyph: '!', label: 'left unfilled' },
    substituted: { color: '#e0a23e', glyph: '~', label: 'different tile type' },
    tier:        { color: '#7ecfff', glyph: 'V', label: 'not the value tier asked for' },
};

/** @param {any} editor */
export function clearAutoMapperMarks(editor) {
    editor?.svg?.querySelector('#' + LAYER_ID)?.remove();
}

/**
 * Draw one mark per hex that did not get what it asked for.
 *
 * @param {any} editor
 * @param {{label: string, kind: 'unfilled'|'substituted'|'tier', reason?: string}[]} marks
 */
export function drawAutoMapperMarks(editor, marks) {
    clearAutoMapperMarks(editor);
    if (!editor?.svg || !marks?.length) return;

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = LAYER_ID;
    // The marks describe the map; they must not intercept clicks meant for the hexes under
    // them, or the preview would make the board unusable while it is up.
    layer.style.pointerEvents = 'none';
    editor.svg.appendChild(layer);

    const r = editor.hexRadius || 40;

    for (const { label, kind, reason } of marks) {
        const hex = editor.hexes?.[label];
        if (!hex?.center) continue;
        const style = MARK_STYLE[kind];
        if (!style) continue;

        const { x, y } = hex.center;

        // A ring just inside the hex edge, dashed so it reads as provisional rather than as
        // part of the tile art.
        const ring = document.createElementNS(SVG_NS, 'circle');
        ring.setAttribute('cx', String(x));
        ring.setAttribute('cy', String(y));
        ring.setAttribute('r', String(r * 0.78));
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', style.color);
        ring.setAttribute('stroke-width', '2.5');
        ring.setAttribute('stroke-dasharray', '5 4');
        ring.setAttribute('opacity', '0.9');
        layer.appendChild(ring);

        // Badge in the top-left, clear of the value-target badge in the bottom-right.
        const bx = x - r * 0.42;
        const by = y - r * 0.52;

        const badge = document.createElementNS(SVG_NS, 'circle');
        badge.setAttribute('cx', String(bx));
        badge.setAttribute('cy', String(by));
        badge.setAttribute('r', '8');
        badge.setAttribute('fill', style.color);
        badge.setAttribute('stroke', '#111');
        badge.setAttribute('stroke-width', '1');
        layer.appendChild(badge);

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(bx));
        text.setAttribute('y', String(by + 3.5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#111');
        text.textContent = style.glyph;
        layer.appendChild(text);

        // SVG <title> is the only tooltip that works on a layer with pointer-events off in
        // every browser the editor runs in, and it needs no extra wiring.
        const tip = document.createElementNS(SVG_NS, 'title');
        tip.textContent = `${label} — ${style.label}${reason ? `\n${reason}` : ''}`;
        ring.appendChild(tip);

        const badgeTip = document.createElementNS(SVG_NS, 'title');
        badgeTip.textContent = tip.textContent;
        badge.appendChild(badgeTip);
    }
}

/**
 * Turn a fill result into the marks for it.
 *
 * Kept here rather than in the panel so the map and the panel cannot disagree about what
 * counts as a miss — the panel's own counts are read off the same result.
 *
 * @param {{unmatched?: {label: string, reason?: string}[],
 *          downgrades?: {label: string, from: string, to: string, reason?: string}[],
 *          resolutions?: {label: string, wantTier: number|null, gotTier: number|null, outcome: string}[]}} result
 * @returns {{label: string, kind: 'unfilled'|'substituted'|'tier', reason?: string}[]}
 */
export function marksFromResult(result) {
    /** @type {Map<string, {label: string, kind: any, reason?: string}>} */
    const byLabel = new Map();

    // Weakest claim first; the stronger ones below overwrite it, so a hex that both missed
    // its tier and got the wrong type is reported as the wrong type.
    for (const r of result?.resolutions || []) {
        if (!r.wantTier || r.outcome === 'unfilled') continue;
        if (r.gotTier === r.wantTier) continue;
        byLabel.set(r.label, {
            label: r.label,
            kind: 'tier',
            reason: r.gotTier
                ? `Asked for tier ${r.wantTier}, got tier ${r.gotTier}.`
                : `Asked for tier ${r.wantTier}; this tile has no value tier.`,
        });
    }

    for (const d of result?.downgrades || []) {
        // A token placement is recorded as a downgrade to the same type. It is an ordinary
        // outcome, not a miss, so it does not earn a mark.
        if (d.to === d.from) continue;
        byLabel.set(d.label, { label: d.label, kind: 'substituted', reason: d.reason });
    }

    for (const u of result?.unmatched || []) {
        byLabel.set(u.label, { label: u.label, kind: 'unfilled', reason: u.reason });
    }

    return [...byLabel.values()];
}
