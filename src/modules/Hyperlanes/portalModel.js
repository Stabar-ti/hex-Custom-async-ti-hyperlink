// @ts-check
/**
 * Hyperlane portals ("wormhole gates"): lettered portals on a roundabout custom hyperlane's
 * ring, or on an empty `hl` tile (an interchange). Port of the bot's `HyperlanePortals` /
 * `PortalSlot` (ti4.service.map, branch hyperlane-portals). Pure, no DOM — tested by
 * tools/test-bridges-portals.js.
 *
 * Kept as `hex.portals`: `[{slot, letter, flow}]` sorted by slot, where
 *   - slot 0 is the centre of the ring, slot k (1-6) sits between two spokes at
 *     (k − 1)·60° + 30° clockwise from north (slot 1 between N and NE);
 *   - letter is 'A'-'Z';
 *   - flow is 'both', 'entry' (ships jump in here, never arrive — written `>`) or
 *     'exit' (ships arrive here, never jump in — written `<`).
 *
 * Three text forms:
 *   - typed (JSON `portals`, the bot's modal): `0=A, 1=C<, 3=B>` — slots optional on input;
 *   - compact (text Export `portal:` rows, lore `!setportals`): `0A1C<3B>`;
 *   - stored is the array above.
 */

export const PORTAL_SLOTS = 7;
export const CENTRE_SLOT = 0;
export const FLOWS = Object.freeze(['both', 'entry', 'exit']);

const MARKER = Object.freeze({ both: '', entry: '>', exit: '<' });
const TYPED_SLOT = /^(?:([0-6])=)?([A-Za-z])([<>]?)$/;
const COMPACT = /^(?:[0-6][A-Za-z][<>]?)+$/;

/** @typedef {{slot: number, letter: string, flow: 'both'|'entry'|'exit'}} PortalSlot */

/** The marker a flow is written with: '', '>' or '<'. */
export function flowMarker(flow) {
    return MARKER[flow] ?? '';
}

/**
 * The flow a marker stands for.
 * @returns {'both'|'entry'|'exit'}
 */
export function flowOf(marker) {
    if (marker === '>') return 'entry';
    if (marker === '<') return 'exit';
    return 'both';
}

/** Whether ships can jump in through this portal (it is not exit-only). */
export function letsShipsLeave(p) {
    return p.flow !== 'exit';
}

/** Whether ships can arrive through this portal (it is not entry-only). */
export function letsShipsArrive(p) {
    return p.flow !== 'entry';
}

/**
 * Parses the typed form as the bot's HyperlanePortals.parseTyped: parts split on commas,
 * semicolons or spaces; letters without a slot fill the free slots in order; if no portal
 * ends up in the centre, the first listed one moves there.
 *
 * @param {unknown} text
 * @returns {{slots: PortalSlot[], problem: string|null, movedToCentre: string|null}}
 */
export function parseTypedPortals(text) {
    const fail = (problem) => ({ slots: [], problem, movedToCentre: null });
    const entries = [];
    const fixed = new Set();
    const letters = new Set();
    for (const raw of String(text ?? '').split(/[,;\s]+/)) {
        const part = raw.trim();
        if (!part) continue;
        const m = TYPED_SLOT.exec(part);
        if (!m) {
            return fail(`\`${part}\` isn't a portal. Write letters, optionally with a slot, for example \`A, 3=B>, C<\` (\`>\` entry-only, \`<\` exit-only).`);
        }
        const slot = m[1] === undefined ? null : Number(m[1]);
        const letter = m[2].toUpperCase();
        if (slot !== null) {
            if (fixed.has(slot)) return fail(`Slot ${slot} is listed twice.`);
            fixed.add(slot);
        }
        if (letters.has(letter)) return fail(`Letter ${letter} is used twice on this hyperlane.`);
        letters.add(letter);
        entries.push({ slot, letter, flow: flowOf(m[3]) });
    }
    const slots = [];
    const taken = new Set(fixed);
    for (const e of entries) {
        let slot = e.slot;
        if (slot === null) {
            slot = null;
            for (let s = 0; s < PORTAL_SLOTS; s++) if (!taken.has(s)) { slot = s; break; }
            if (slot === null) return fail(`A hyperlane holds at most ${PORTAL_SLOTS} portals.`);
        }
        taken.add(slot);
        slots.push({ slot, letter: e.letter, flow: e.flow });
    }
    let movedToCentre = null;
    if (slots.length && !slots.some(s => s.slot === CENTRE_SLOT)) {
        slots[0] = { ...slots[0], slot: CENTRE_SLOT };
        movedToCentre = slots[0].letter;
    }
    slots.sort((a, b) => a.slot - b.slot);
    return { slots, problem: null, movedToCentre };
}

/** Whether a string is the compact form (`0A3B>`). */
export function isCompactPortals(text) {
    return COMPACT.test(String(text ?? ''));
}

/** The compact form as typed text: `0A3B>` → `0=A,3=B>` (HyperlanePortals.typedFromCompact). */
export function typedFromCompact(compact) {
    return String(compact ?? '').replace(/([0-6])([A-Za-z])([<>]?)/g, '$1=$2$3,').replace(/,$/, '');
}

/**
 * Parses whatever a user, a JSON file or a lore footer hands over: the compact form or the
 * typed form (with or without slots).
 */
export function parseAnyPortals(text) {
    const t = String(text ?? '').trim();
    return parseTypedPortals(isCompactPortals(t) ? typedFromCompact(t) : t);
}

/** `0A1C<3B>` */
export function encodeCompact(slots) {
    return (slots || []).map(s => `${s.slot}${s.letter}${flowMarker(s.flow)}`).join('');
}

/** `0=A, 1=C<, 3=B>` — what the bot writes into the JSON `portals` field. */
export function describePortals(slots) {
    return (slots || []).map(s => `${s.slot}=${s.letter}${flowMarker(s.flow)}`).join(', ');
}

/** A portal turned with its hyperlane: the centre stays, ring slots move `steps` clockwise. */
export function rotatedSlot(p, steps) {
    if (p.slot === CENTRE_SLOT) return { ...p };
    const turned = (((p.slot - 1 + Math.trunc(steps)) % 6) + 6) % 6 + 1;
    return { ...p, slot: turned };
}

/** Every portal turned `steps` sixths clockwise, sorted by slot. */
export function rotatedPortals(slots, steps) {
    return (slots || []).map(p => rotatedSlot(p, steps)).sort((a, b) => a.slot - b.slot);
}

/**
 * Whether a hyperlane matrix can carry portals: no lanes at all (an interchange), or a
 * roundabout (any diagonal cell set) — HyperlanePortals.canHoldPortals. Whether the tile is a
 * custom `hl` is the caller's question.
 * @param {number[][]|null|undefined} matrix
 */
export function canHoldPortals(matrix) {
    if (!Array.isArray(matrix)) return true;
    const anyLane = matrix.some(row => Array.isArray(row) && row.some(c => Number(c) === 1));
    if (!anyLane) return true;
    for (let i = 0; i < 6; i++) if (Number(matrix[i]?.[i]) === 1) return true;
    return false;
}

/** Whether a hex carries portals. */
export function hasPortals(hex) {
    return Array.isArray(hex?.portals) && hex.portals.length > 0;
}

/** A deep copy of a portal list, or null. */
export function clonePortals(slots) {
    return Array.isArray(slots) ? slots.map(s => ({ slot: s.slot, letter: s.letter, flow: s.flow })) : null;
}

/**
 * A clean portal list from any saved value (full-state save, clipboard), or null if empty or
 * unreadable. Accepts the array form or any text form.
 */
export function normalizedPortals(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
        const { slots, problem } = parseAnyPortals(value);
        return problem || !slots.length ? null : slots;
    }
    if (!Array.isArray(value)) return null;
    const text = value
        .filter(s => s && Number.isInteger(s.slot) && /^[A-Za-z]$/.test(String(s.letter)))
        .map(s => `${s.slot}=${String(s.letter).toUpperCase()}${flowMarker(s.flow)}`)
        .join(',');
    return normalizedPortals(text);
}

/** Angle of a ring slot, degrees clockwise from north (slot 0 has none). */
export function slotAngle(slot) {
    return (slot - 1) * 60 + 30;
}

// ── Colour (PortalTokens.colourOf) ─────────────────────────────────────────────

/** java.awt.Color.HSBtoRGB, as [r, g, b] 0-255. */
export function hsbToRgb(hue, saturation, brightness) {
    if (saturation === 0) {
        const v = Math.trunc(brightness * 255 + 0.5);
        return [v, v, v];
    }
    const h = (hue - Math.floor(hue)) * 6;
    const f = h - Math.floor(h);
    const p = brightness * (1 - saturation);
    const q = brightness * (1 - saturation * f);
    const t = brightness * (1 - saturation * (1 - f));
    let r, g, b;
    switch (Math.trunc(h)) {
        case 0: [r, g, b] = [brightness, t, p]; break;
        case 1: [r, g, b] = [q, brightness, p]; break;
        case 2: [r, g, b] = [p, brightness, t]; break;
        case 3: [r, g, b] = [p, q, brightness]; break;
        case 4: [r, g, b] = [t, p, brightness]; break;
        default: [r, g, b] = [brightness, p, q]; break;
    }
    return [r, g, b].map(x => Math.trunc(x * 255 + 0.5));
}

/**
 * java.awt.Color.brighter().
 * @param {number[]} rgb
 */
export function brighterRgb(rgb) {
    const [r, g, b] = rgb;
    const i = 3; // (int)(1.0 / (1.0 - 0.7))
    if (r === 0 && g === 0 && b === 0) return [i, i, i];
    return [r, g, b].map(c => Math.min(Math.trunc((c > 0 && c < i ? i : c) / 0.7), 255));
}

/** The letter's colour as [r, g, b]: hue ((n·5) mod 13)/13; A–M vivid, N–Z pastel. */
export function portalRgb(letter) {
    const n = ((String(letter).toUpperCase().charCodeAt(0) - 65) % 26 + 26) % 26;
    const hue = ((n * 5) % 13) / 13;
    const pastel = n >= 13;
    return hsbToRgb(hue, pastel ? 0.45 : 0.85, pastel ? 1.0 : 0.95);
}

/**
 * '#rrggbb'
 * @param {number[]} rgb
 */
export function rgbHex(rgb) {
    return '#' + rgb.slice(0, 3).map(c => c.toString(16).padStart(2, '0')).join('');
}

/** The letter's colour as '#rrggbb'. */
export function portalColour(letter) {
    return rgbHex(portalRgb(letter));
}

/** The brighter colour the letter itself is written in. */
export function portalLetterColour(letter) {
    return rgbHex(brighterRgb(portalRgb(letter)));
}
