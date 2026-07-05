/**
 * Lore Module - Client-side mirror of the bot's LoreEffects.java + LoreEntry footer parsing.
 * Lets the website parse, preview, and validate "!"-prefixed effect lines in lore footer text
 * the same way the bot will when the lore actually fires.
 *
 * Footer grammar (spec §5):
 *  - a line that is exactly "!choice" gates the entry behind Accept/Reject buttons,
 *  - a line matching "!roll NdM" gates it behind a dice roll; "N:"/"N-M:" line prefixes
 *    become roll bins (ONLY while a !roll marker exists — otherwise they stay flavor text),
 *  - "accept:"/"reject:" prefixes are always recognized,
 *  - any other "!verb args" segment is a machine effect; several can share a line,
 *  - effect tokens starting with "@" redirect the target, tokens starting with "?" are
 *    per-player conditions (?red · ?!red · ?faction:winnu · ?round:3-6).
 */

const CHOICE_MARKER = '!choice';
const ROLL_MARKER_RE = /^!roll\s+(\d+)d(\d+)$/i;
const BIN_TAG_RE = /^(\d+(?:-\d+)?):\s*([\s\S]*)$/;

/** Verbs offered as buttons in the UI, grouped. fowOnly verbs no-op outside Fog of War games. */
export const EFFECT_VERBS = [
    // player-stat effects (fan out to every recipient)
    { verb: 'tg', label: 'Trade Goods', template: 'tg +2', group: 'player' },
    { verb: 'fleet', label: 'Fleet CC', template: 'fleet +1', group: 'player', aliases: ['flt'] },
    { verb: 'tactic', label: 'Tactic CC', template: 'tactic +1', group: 'player', aliases: ['tactical', 'tac'] },
    { verb: 'strategy', label: 'Strategy CC', template: 'strategy +1', group: 'player', aliases: ['strategic', 'str'] },
    { verb: 'comms', label: 'Commodities', template: 'comms +2', group: 'player', aliases: ['commodities', 'com'] },
    { verb: 'ac', label: 'Draw Action Cards', template: 'ac 2', group: 'player' },
    { verb: 'so', label: 'Draw Secret Objective', template: 'so 1', group: 'player', aliases: ['secretobjective'] },
    { verb: 'vp', label: 'Grant VP', template: 'vp 1 Ancient Relic', group: 'player' },
    { verb: 'tech', label: 'Grant Tech', template: 'tech gd', group: 'player' },
    { verb: 'removetech', label: 'Remove Tech', template: 'removetech gd', group: 'player', aliases: ['rtec'] },
    // map-change effects (fire exactly once per trigger)
    { verb: 'unit', label: 'Add Units', template: 'unit 2 infantry', group: 'map', aliases: ['plastic'] },
    { verb: 'removeunit', label: 'Remove Units', template: 'removeunit 2 infantry', group: 'map', aliases: ['runi'] },
    { verb: 'token', label: 'Add Token', template: 'token gravityrift', group: 'map', aliases: ['tkn'] },
    { verb: 'removetoken', label: 'Remove Token', template: 'removetoken gravityrift', group: 'map', aliases: ['rtkn'] },
    { verb: 'cc', label: 'Place Command Token', template: 'cc', group: 'map' },
    { verb: 'removecc', label: 'Remove Command Token', template: 'removecc', group: 'map', aliases: ['rcc'] },
    { verb: 'clearunits', label: 'Clear Units', template: 'clearunits neutral', group: 'map', aliases: ['clru'] },
    { verb: 'swap', label: 'Swap Systems', template: 'swap 203 401', group: 'map' },
    { verb: 'settile', label: 'Set Tile', template: 'settile 305 41', group: 'map', aliases: ['stl'] },
    { verb: 'rotatehyperlane', label: 'Rotate Hyperlane', template: 'rotatehyperlane 305 1', group: 'map', aliases: ['rhl'] },
    { verb: 'sethyperlane', label: 'Set Hyperlane', template: 'sethyperlane 305 000201000', group: 'map', aliases: ['shl'] },
    // FoW-only effects — these never touch the real board. They only override what ONE
    // receiving player's client shows for a position that's currently fogged/unknown to
    // them (their personal "last seen" sighting), e.g. to plant a false decoy or reveal a hint.
    {
        verb: 'addfogtile', label: 'Set Fog Sighting', template: 'addfogtile 41 Decoy', group: 'fow', aliases: ['afog'], fowOnly: true,
        hint: "Per-player only: plants what the RECEIVING player believes sits at this fogged position — doesn't change the real board or any other player's view."
    },
    {
        verb: 'removefogtile', label: 'Clear Fog Sighting', template: 'removefogtile', group: 'fow', aliases: ['rfog'], fowOnly: true,
        hint: "Per-player only: wipes the receiving player's remembered sighting of this position back to blank/unknown fog."
    }
];

/** Short aliases resolved to the canonical verb before anything else (mirror of VERB_ALIASES). */
export const VERB_ALIASES = {
    flt: 'fleet', tac: 'tactic', str: 'strategy', com: 'comms',
    tkn: 'token', runi: 'removeunit', rtkn: 'removetoken',
    rcc: 'removecc', clru: 'clearunits', rtec: 'removetech',
    afog: 'addfogtile', rfog: 'removefogtile',
    stl: 'settile', rhl: 'rotatehyperlane', shl: 'sethyperlane'
};

/** Verbs that mutate shared board state — fire once per trigger, never per recipient. */
export const MAP_CHANGE_VERBS = new Set([
    'unit', 'plastic', 'token', 'removeunit', 'removetoken', 'swap',
    'cc', 'removecc', 'clearunits', 'settile', 'rotatehyperlane', 'sethyperlane'
]);

/** Verbs that act on the entry's own tile unless an @target redirects them — phase lore
 *  has no tile of its own, so these silently no-op there without an explicit target. */
export const TILE_DEFAULT_VERBS = new Set([
    'unit', 'plastic', 'token', 'removeunit', 'removetoken',
    'cc', 'removecc', 'clearunits', 'addfogtile', 'removefogtile'
]);

const FOW_ONLY_VERBS = new Set(['addfogtile', 'removefogtile']);

const KNOWN_VERBS = new Set(Object.keys(VERB_ALIASES));
EFFECT_VERBS.forEach(e => {
    KNOWN_VERBS.add(e.verb);
    (e.aliases || []).forEach(a => KNOWN_VERBS.add(a));
});

const SETTILE_FILTERS = new Set(['blue', 'red', 'wormhole', 'anomaly', 'empty']);
const TECH_TYPE_WORDS = new Set(['blue', 'green', 'yellow', 'red', 'unit',
    'propulsion', 'biotic', 'cybernetic', 'warfare', 'unitupgrade']);

/** Fallback unit aliases (mirror of Units.findUnitType + common full names) used when
 *  the synced data bundle isn't loaded. */
const UNIT_ALIAS_FALLBACK = new Set([
    'gf', 'infantry', 'inf', 'mf', 'mech', 'pd', 'pds', 'sd', 'csd', 'spacedock', 'space_dock',
    'ff', 'fighter', 'ft', 'dd', 'destroyer', 'ca', 'cruiser', 'cv', 'carrier',
    'dn', 'dreadnought', 'fs', 'flagship', 'ws', 'warsun', 'war_sun',
    'monument', 'plenaryorbital', 'tyrantslament', 'lady', 'celagrom', 'cavalry',
    'starfallpds', 'metaliafb', 'projectionafb', 'zelianplanet'
]);

const COLOR_FALLBACK = new Set([
    'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white',
    'gray', 'grey', 'brown', 'tan', 'teal', 'turquoise', 'gold', 'lime', 'lavender',
    'rose', 'navy', 'petrol', 'bloodred', 'chocolate', 'chrome', 'emerald', 'ethereal',
    'forest', 'lightgray', 'orca', 'rainbow', 'riftset', 'splitred', 'splitblue',
    'splitgreen', 'splityellow', 'splitpurple', 'splitorange', 'splitpink', 'sunset', 'neutral'
]);

// ---------- gates ----------

/** A footer line that is just "!choice" gates the whole entry behind Accept/Reject. */
export function isChoiceGated(footerText) {
    return (footerText || '').split('\n').some(line => line.trim().toLowerCase() === CHOICE_MARKER);
}

/** {count, sides} of the entry's "!roll NdM" marker, or null. */
export function getRollSpec(footerText) {
    for (const line of (footerText || '').split('\n')) {
        const m = line.trim().match(ROLL_MARKER_RE);
        if (m) return { count: parseInt(m[1], 10), sides: parseInt(m[2], 10) };
    }
    return null;
}

export function isRollGated(footerText) {
    return getRollSpec(footerText) !== null;
}

/** {type:'none'|'choice'|'roll', count?, sides?} — for the UI's gate radio row. */
export function getGate(footerText) {
    const roll = getRollSpec(footerText);
    if (roll) return { type: 'roll', ...roll };
    if (isChoiceGated(footerText)) return { type: 'choice' };
    return { type: 'none' };
}

/** Rewrites the footer so it carries exactly the requested gate marker (or none). */
export function withGateMarker(footerText, gate) {
    const kept = (footerText || '').split('\n').filter(line => {
        const stripped = line.trim();
        return stripped.toLowerCase() !== CHOICE_MARKER && !ROLL_MARKER_RE.test(stripped);
    });
    if (gate && gate.type === 'choice') kept.unshift(CHOICE_MARKER);
    if (gate && gate.type === 'roll') kept.unshift(`!roll ${gate.count || 2}d${gate.sides || 10}`);
    return kept.join('\n').replace(/^\n+|\n+$/g, '');
}

function isGateMarkerLine(stripped) {
    return stripped.toLowerCase() === CHOICE_MARKER || ROLL_MARKER_RE.test(stripped);
}

// ---------- line tag / parsing ----------

/**
 * Splits a footer line into [tag|null, rest]. accept:/reject: are always recognized;
 * numeric "N:"/"N-M:" bins only while the entry is roll-gated (otherwise a flavor line
 * starting with "3:" or a "12:00" time would be mangled — mirror of LoreEntry.splitTag).
 */
function splitTag(line, rollGated) {
    const lower = line.toLowerCase();
    if (lower.startsWith('accept:')) return ['accept', line.substring(7).trim()];
    if (lower.startsWith('reject:')) return ['reject', line.substring(7).trim()];
    if (rollGated) {
        const m = line.trim().match(BIN_TAG_RE);
        if (m) return [m[1], m[2]];
    }
    return [null, line];
}

/**
 * Returns each effect line, leading "!" stripped, branch tag preserved as a
 * "accept:"/"reject:"/"2-10:" prefix. Mirrors LoreEntry.getEffectLines().
 */
export function getEffectLines(footerText) {
    const out = [];
    const rollGated = isRollGated(footerText);
    for (const rawLine of (footerText || '').split('\n')) {
        const stripped = rawLine.trim();
        if (isGateMarkerLine(stripped)) continue;

        const [tag, rest] = splitTag(stripped, rollGated);
        const tagPrefix = tag === null ? '' : tag + ':';

        for (const segment of rest.split(/(?<=\s)(?=!)/)) {
            const trimmed = segment.trim();
            if (trimmed.startsWith('!')) {
                out.push(tagPrefix + trimmed.substring(1).trim());
            }
        }
    }
    return out;
}

/** Footer text with gate markers, branch tags, and effect segments removed — the player view. */
export function getDisplayFooter(footerText) {
    const outLines = [];
    const rollGated = isRollGated(footerText);
    for (const rawLine of (footerText || '').split('\n')) {
        let stripped = rawLine.trim();
        if (isGateMarkerLine(stripped)) continue;
        stripped = splitTag(stripped, rollGated)[1];

        let lineOut = '';
        for (const segment of stripped.split(/(?<=\s)(?=!)/)) {
            const trimmed = segment.trim();
            if (!trimmed.startsWith('!')) {
                lineOut += (lineOut ? ' ' : '') + trimmed;
            }
        }
        const displayLine = lineOut.trim();
        if (displayLine) outLines.push(displayLine);
    }
    return outLines.join('\n').trim();
}

/**
 * Parses one entry from getEffectLines() into
 * { verb, args, targetRef, branch, conditions } — verb canonicalized through VERB_ALIASES,
 * branch is "accept"/"reject"/a bin range like "2-10"/null, conditions have their "?" stripped.
 */
export function parseEffectLine(entry) {
    let branch = null;
    let body = entry;
    const lower = entry.toLowerCase();
    if (lower.startsWith('accept:')) {
        branch = 'accept';
        body = entry.substring(7);
    } else if (lower.startsWith('reject:')) {
        branch = 'reject';
        body = entry.substring(7);
    } else {
        const m = entry.match(/^(\d+(?:-\d+)?):([\s\S]*)$/);
        if (m) {
            branch = m[1];
            body = m[2];
        }
    }

    const tokens = body.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    let verb = tokens.shift().toLowerCase();
    verb = VERB_ALIASES[verb] || verb;
    let targetRef = null;
    const args = [];
    const conditions = [];
    for (const token of tokens) {
        if (token.startsWith('@')) targetRef = token.substring(1);
        else if (token.startsWith('?') && token.length > 1) conditions.push(token.substring(1));
        else args.push(token);
    }
    return { verb, args, targetRef, branch, conditions };
}

/** Parses "N", "N-M", "N-", "-M" into [from, till] (0 = unbounded); null if malformed/backwards. */
export function parseRoundBounds(range) {
    const str = (range || '').trim();
    if (str.includes('-')) {
        const dash = str.indexOf('-');
        const fromStr = str.substring(0, dash).trim();
        const tillStr = str.substring(dash + 1).trim();
        if ((fromStr && !/^\d+$/.test(fromStr)) || (tillStr && !/^\d+$/.test(tillStr))) return null;
        const from = fromStr ? parseInt(fromStr, 10) : 0;
        const till = tillStr ? parseInt(tillStr, 10) : 0;
        if (from > 0 && till > 0 && from > till) return null;
        return [from, till];
    }
    if (!/^\d+$/.test(str)) return null;
    const round = parseInt(str, 10);
    return [round, round];
}

// ---------- validation ----------

function isSignedInt(args, i) {
    if (!args || args.length <= i) return false;
    return /^[+-]?\d+$/.test(args[i]);
}

function toInt(s) {
    return parseInt(String(s).replace('+', ''), 10);
}

/**
 * Lookup context for validation. All fields optional — a missing lookup simply skips
 * that check (data files may not be loaded yet):
 *   targetKind: 'system' | 'planet' | 'phase'   (default 'system')
 *   gameType:   'fow' | 'normal' | 'unknown'    (default 'unknown')
 *   editor:     hex editor (for @target / position / tile-id resolution)
 *   data:       { techIndex: Map<lowercased id/alias, tech>,
 *                 colorNames: Set<lowercase>, factionIds: Set<lowercase>,
 *                 unitAliases: Set<lowercase>, tokenIds: Set<lowercase> }
 */
function normalizeCtx(ctx) {
    return {
        targetKind: ctx?.targetKind || 'system',
        gameType: ctx?.gameType || 'unknown',
        editor: ctx?.editor || null,
        data: ctx?.data || null
    };
}

function isValidPosition(ctx, pos) {
    if (!ctx.editor?.hexes) return true; // can't check
    return !!ctx.editor.hexes[pos];
}

function isValidTileId(ctx, tileId) {
    const lookup = ctx.editor?.sectorIDLookup;
    if (!lookup) return true;
    return !!lookup[String(tileId).toUpperCase()];
}

function isKnownUnit(ctx, unit) {
    const aliases = ctx.data?.unitAliases || UNIT_ALIAS_FALLBACK;
    return aliases.has(String(unit).toLowerCase());
}

function isKnownColorWord(ctx, word) {
    const colors = ctx.data?.colorNames || COLOR_FALLBACK;
    const lower = String(word).toLowerCase();
    return lower === 'neutral' || colors.has(lower);
}

function isKnownTech(ctx, techId) {
    if (!ctx.data?.techIndex) return true;
    return ctx.data.techIndex.has(String(techId).toLowerCase());
}

function isKnownToken(ctx, tokenId) {
    if (!ctx.data?.tokenIds) return true;
    return ctx.data.tokenIds.has(String(tokenId).toLowerCase());
}

/** @target must resolve to a planet name or a board position (mirror of resolveTarget). */
function targetResolves(ctx, ref) {
    if (!ctx.editor?.hexes) return true;
    if (ctx.editor.hexes[ref]) return true;
    const lower = String(ref).toLowerCase();
    for (const hex of Object.values(ctx.editor.hexes)) {
        for (const planet of hex.planets || []) {
            const id = planet && (planet.planetID || planet.id || planet.name);
            if (id && String(id).toLowerCase() === lower) return true;
        }
    }
    return false;
}

/** 9-hex-char encoded hyperlane matrix (or the legacy 36-char binary form). */
function isValidEncodedMatrix(arg) {
    const s = String(arg).trim();
    return /^[0-9a-fA-F]{9}$/.test(s) || /^[01]{36}$/.test(s);
}

/** Save-time syntax check for one "?condition" token (mirror of validateCondition). */
function validateConditionToken(ctx, condition) {
    const body = condition.startsWith('!') ? condition.substring(1) : condition;
    const lower = body.toLowerCase();
    if (lower.startsWith('faction:')) {
        const faction = lower.substring('faction:'.length);
        if (ctx.data?.factionIds && !ctx.data.factionIds.has(faction)) {
            return `unknown faction "${faction}" in condition "?${condition}"`;
        }
    } else if (lower.startsWith('round:')) {
        if (parseRoundBounds(body.substring('round:'.length)) === null) {
            return `invalid round range in condition "?${condition}" (e.g. "?round:3-6", "?round:4")`;
        }
    } else if (!isKnownColorWord(ctx, lower)) {
        return `unknown color "${body}" in condition "?${condition}"`;
    }
    return null;
}

function validateOperands(ctx, p, where) {
    const problems = [];
    const a = p.args;
    switch (p.verb) {
        case 'tg': case 'fleet': case 'tactic': case 'tactical':
        case 'strategy': case 'strategic': case 'comms': case 'commodities':
            if (!isSignedInt(a, 0)) problems.push(`"${p.verb}" needs a number, e.g. "!${p.verb} +2"${where}`);
            break;
        case 'ac':
            if (!isSignedInt(a, 0) || toInt(a[0]) <= 0) {
                problems.push(`"ac" needs a positive number, e.g. "!ac 2"${where}`);
            }
            break;
        case 'unit': case 'plastic': case 'removeunit': {
            const idx = (a.length > 0 && !isSignedInt(a, 0)) ? 1 : 0;
            if (a.length < idx + 2) {
                problems.push(`"${p.verb}" needs "[neutral|<color>] <count> <unit> [planet]", e.g. "!${p.verb} 2 infantry"${where}`);
            } else {
                if (!isSignedInt(a, idx)) {
                    problems.push(`"${p.verb}" count "${a[idx]}" isn't a number${where}`);
                }
                if (!isKnownUnit(ctx, a[idx + 1])) {
                    problems.push(`unknown unit "${a[idx + 1]}"${where}`);
                }
                if (idx === 1 && !isKnownColorWord(ctx, a[0])) {
                    problems.push(`unknown color "${a[0]}"${where}`);
                }
            }
            break;
        }
        case 'token':
            if (a.length === 0) problems.push(`"token" needs a token id, e.g. "!token gravityrift"${where}`);
            else if (!isKnownToken(ctx, a[0])) problems.push(`unknown token "${a[0]}"${where}`);
            break;
        case 'removetoken':
            if (a.length === 0) problems.push(`"removetoken" needs a token id, e.g. "!removetoken gravityrift"${where}`);
            else if (!isKnownToken(ctx, a[0])) problems.push(`unknown token "${a[0]}"${where}`);
            break;
        case 'cc': case 'removecc':
            if (a.length > 0 && !isKnownColorWord(ctx, a[0])) {
                problems.push(`unknown color "${a[0]}"${where}`);
            }
            break;
        case 'clearunits':
            if (a.length === 0) {
                problems.push(`"clearunits" needs "<neutral|color> [planet]", e.g. "!clearunits neutral" or "!clearunits red mr"${where}`);
            } else if (!isKnownColorWord(ctx, a[0])) {
                problems.push(`unknown color "${a[0]}"${where}`);
            }
            break;
        case 'swap':
            if (a.length < 2) problems.push(`"swap" needs two positions, e.g. "!swap 203 401"${where}`);
            else {
                if (a[0] === a[1]) problems.push(`"swap" positions must be different${where}`);
                if (!isValidPosition(ctx, a[0])) problems.push(`invalid position "${a[0]}"${where}`);
                if (a.length > 1 && !isValidPosition(ctx, a[1])) problems.push(`invalid position "${a[1]}"${where}`);
            }
            break;
        case 'tech':
            if (a.length === 0) {
                problems.push(`"tech" needs a tech id, "random", or "choose", e.g. "!tech gd", "!tech random blue", or "!tech choose blue"${where}`);
            } else if (['random', 'choose', 'pick'].includes(a[0].toLowerCase())) {
                if (a.length > 1 && !TECH_TYPE_WORDS.has(a[1].toLowerCase())) {
                    problems.push(`unknown tech type "${a[1]}" — use blue/green/yellow/red/unit${where}`);
                }
            } else if (!isKnownTech(ctx, a[0])) {
                problems.push(`unknown tech "${a[0]}"${where}`);
            }
            break;
        case 'removetech':
            if (a.length === 0) {
                problems.push(`"removetech" needs a tech id, e.g. "!removetech gd"${where}`);
            } else if (!isKnownTech(ctx, a[0])) {
                problems.push(`unknown tech "${a[0]}"${where}`);
            }
            break;
        case 'addfogtile':
            if (a.length === 0) {
                problems.push(`"addfogtile" needs a tile id, e.g. "!addfogtile 41 Decoy @305"${where}`);
            } else if (!isValidTileId(ctx, a[0])) {
                problems.push(`unknown tile "${a[0]}"${where}`);
            }
            break;
        case 'removefogtile':
            break; // no operands: acts on the lore's own tile or the @target override
        case 'settile':
            if (a.length < 2) {
                problems.push(`"settile" needs "<position> <tileId|random> [filters]", e.g. "!settile 305 41" or "!settile 305 random red wormhole"${where}`);
            } else {
                if (!isValidPosition(ctx, a[0])) problems.push(`invalid position "${a[0]}"${where}`);
                if (a[1].toLowerCase() === 'random') {
                    for (const filter of a.slice(2)) {
                        if (!SETTILE_FILTERS.has(filter.toLowerCase())) {
                            problems.push(`unknown "settile" filter "${filter}" — use blue/red/wormhole/anomaly/empty${where}`);
                        }
                    }
                } else if (!isValidTileId(ctx, a[1])) {
                    problems.push(`unknown tile "${a[1]}"${where}`);
                }
            }
            break;
        case 'rotatehyperlane':
            if (a.length === 0) {
                problems.push(`"rotatehyperlane" needs a position, e.g. "!rotatehyperlane 305 2"${where}`);
            } else {
                if (!isValidPosition(ctx, a[0])) problems.push(`invalid position "${a[0]}"${where}`);
                if (a.length > 1 && !isSignedInt(a, 1)) {
                    problems.push(`"rotatehyperlane" steps "${a[1]}" isn't a number${where}`);
                }
            }
            break;
        case 'sethyperlane':
            if (a.length < 2) {
                problems.push(`"sethyperlane" needs "<position> <encodedMatrix>" — use the 9-hex-char form from the hyperlane manager's Export button${where}`);
            } else {
                if (!isValidPosition(ctx, a[0])) problems.push(`invalid position "${a[0]}"${where}`);
                if (!isValidEncodedMatrix(a[1])) {
                    problems.push(`invalid encoded matrix "${a[1]}" — use the 9-hex-char form from the hyperlane manager's Export button${where}`);
                }
            }
            break;
        case 'vp':
            if (!isSignedInt(a, 0) || toInt(a[0]) === 0) {
                problems.push(`"vp" needs a non-zero number, e.g. "!vp 1 Ancient Relic"${where}`);
            }
            break;
        case 'so': case 'secretobjective':
            if (a.length > 0 && (!isSignedInt(a, 0) || toInt(a[0]) <= 0)) {
                problems.push(`"${p.verb}" needs a positive number, e.g. "!${p.verb} 2", or no args for 1${where}`);
            }
            break;
        default:
            break;
    }
    return problems;
}

/** Phase entries have no triggering player and no target tile (mirror of validatePhaseEntry). */
function validatePhaseEntry(ctx, loreData, effectLines) {
    const problems = [];
    const choiceGated = isChoiceGated(loreData.footerText);
    const rollGated = isRollGated(loreData.footerText);
    if (loreData.receiver !== 'ALL' && loreData.receiver !== 'GM') {
        problems.push(`phase lore has no single receiving player — receiver "${loreData.receiver}" is treated as All Players`);
    }
    if (loreData.persistance === 'ONCE_PER_PLAYER' && !choiceGated && !rollGated) {
        problems.push('"Once per player" behaves like "Once" for phase lore — there is no per-player delivery');
    }
    for (const line of effectLines) {
        const p = parseEffectLine(line);
        if (!p) continue;
        const where = ` (in "!${line}")`;
        const a = p.args;
        let colorImplicit = false;
        if (['unit', 'plastic', 'removeunit'].includes(p.verb)) colorImplicit = a.length > 0 && isSignedInt(a, 0);
        else if (['cc', 'removecc'].includes(p.verb)) colorImplicit = a.length === 0;
        if (colorImplicit) {
            problems.push(`"${p.verb}" needs an explicit color in phase lore — there is no triggering player${where}`);
        }
        if (TILE_DEFAULT_VERBS.has(p.verb) && !p.targetRef) {
            problems.push(`"${p.verb}" needs an "@target" in phase lore — there is no target system${where}`);
        }
        if (loreData.receiver === 'GM' && !MAP_CHANGE_VERBS.has(p.verb)) {
            problems.push(`player rewards are skipped for GM-receiver phase lore${where}`);
        }
    }
    return problems;
}

/**
 * Best-effort mirror of LoreEffects.validateEffects(): the same warnings the bot would emit
 * when this entry is saved, so the GM sees them here instead of after importing into a live
 * game. Checks against loaded data files / the current board where possible; a missing
 * lookup skips that check. `ctx` is optional — see normalizeCtx for the fields.
 */
export function validateLoreEffects(loreData, ctx = {}) {
    ctx = normalizeCtx(ctx);
    const problems = [];
    const footerText = loreData.footerText || '';
    const lines = getEffectLines(footerText);
    const choiceGated = isChoiceGated(footerText);
    const rollGated = isRollGated(footerText);

    for (const line of lines) {
        const p = parseEffectLine(line);
        if (!p) continue;
        const where = ` (in "!${line}")`;

        if (!KNOWN_VERBS.has(p.verb)) {
            problems.push(`unknown effect "${p.verb}"${where}`);
            continue;
        }
        if (p.targetRef && !targetResolves(ctx, p.targetRef)) {
            problems.push(`couldn't find target "@${p.targetRef}"${where}`);
        }
        if (p.branch) {
            const isAcceptReject = p.branch === 'accept' || p.branch === 'reject';
            if (isAcceptReject) {
                if (!choiceGated) {
                    problems.push(`"${p.branch}:" tag has no effect without a "!choice" marker in the footer${where}`);
                }
            } else if (!rollGated) {
                problems.push(`"${p.branch}:" tag has no effect without a "!roll NdM" marker in the footer${where}`);
            } else if (parseRoundBounds(p.branch) === null) {
                problems.push(`invalid roll bin range "${p.branch}:"${where}`);
            }
        }
        for (const condition of p.conditions) {
            const problem = validateConditionToken(ctx, condition);
            if (problem) problems.push(problem + where);
        }
        if (FOW_ONLY_VERBS.has(p.verb) && ctx.gameType === 'normal') {
            problems.push(`"${p.verb}" only has an effect in Fog of War games${where}`);
        }
        problems.push(...validateOperands(ctx, p, where));
    }

    if (choiceGated && rollGated) {
        problems.push('An entry can\'t use both "!choice" and "!roll" markers — pick one');
    }
    if (choiceGated || rollGated) {
        const marker = choiceGated ? '!choice' : '!roll';
        if (loreData.receiver === 'WINNER' || loreData.receiver === 'LOSER') {
            problems.push(`"${marker}" has no effect when the receiver is Battle winner/loser — that receiver already gates on the player's win/loss self-report`);
        } else if (loreData.receiver === 'GM') {
            problems.push(`"${marker}" has no effect when the receiver is GM — GMs are never offered the choice or its reward`);
        }
    }
    if (rollGated) {
        const spec = getRollSpec(footerText);
        if (spec.count <= 0 || spec.sides <= 1) {
            problems.push('"!roll" needs a positive dice count and at least 2 sides, e.g. "!roll 2d10"');
        }
    } else {
        // "2-10: !tg +2" with no !roll marker looks like a forgotten roll bin: the prefix stays
        // flavor and the effect fires every time. Pure flavor ("3: the gate opens") is left alone.
        for (const line of footerText.split('\n')) {
            const stripped = line.trim();
            const m = stripped.match(BIN_TAG_RE);
            if (m && m[2].includes('!')) {
                problems.push(`"${stripped}" looks like a roll bin but the footer has no "!roll NdM" marker — its effect will fire every time`);
            }
        }
    }

    if (ctx.targetKind === 'phase') {
        problems.push(...validatePhaseEntry(ctx, loreData, lines));
    }
    return problems;
}
