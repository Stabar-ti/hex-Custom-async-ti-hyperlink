/**
 * Lore Module - Client-side mirror of the bot's LoreEffects.java engine.
 * Lets the website parse, preview, and validate "!"-prefixed effect lines in lore footer text
 * the same way the bot will when the lore actually fires.
 */

const CHOICE_MARKER = '!choice';

export const EFFECT_VERBS = [
    { verb: 'tg', label: 'Trade Goods', template: 'tg +2' },
    { verb: 'fleet', label: 'Fleet CC', template: 'fleet +1' },
    { verb: 'tactic', label: 'Tactic CC', template: 'tactic +1', aliases: ['tactical'] },
    { verb: 'strategy', label: 'Strategy CC', template: 'strategy +1', aliases: ['strategic'] },
    { verb: 'comms', label: 'Commodities', template: 'comms +2', aliases: ['commodities'] },
    { verb: 'ac', label: 'Draw Action Cards', template: 'ac 2' },
    { verb: 'unit', label: 'Add Units', template: 'unit 2 infantry', aliases: ['plastic'] },
    { verb: 'token', label: 'Add Token', template: 'token gravityrift' },
    { verb: 'removeunit', label: 'Remove Units', template: 'removeunit 2 infantry' },
    { verb: 'removetoken', label: 'Remove Token', template: 'removetoken gravityrift' },
    { verb: 'swap', label: 'Swap Systems', template: 'swap 203 401' },
    { verb: 'vp', label: 'Grant VP', template: 'vp 1 Ancient Relic' },
    { verb: 'so', label: 'Draw Secret Objective', template: 'so 1', aliases: ['secretobjective'] }
];

const KNOWN_VERBS = new Set();
EFFECT_VERBS.forEach(e => {
    KNOWN_VERBS.add(e.verb);
    (e.aliases || []).forEach(a => KNOWN_VERBS.add(a));
});

function stripBranchTag(line) {
    const lower = line.toLowerCase();
    if (lower.startsWith('accept:') || lower.startsWith('reject:')) {
        return line.substring(7).trim();
    }
    return line;
}

/** A footer line that is just "!choice" gates the whole entry behind Accept/Reject. */
export function isChoiceGated(footerText) {
    return (footerText || '').split('\n').some(line => line.trim().toLowerCase() === CHOICE_MARKER);
}

/**
 * Returns each effect line (leading "!" stripped, "accept:"/"reject:" tag preserved if present).
 * Mirrors LoreEntry.getEffectLines() in LoreService.java.
 */
export function getEffectLines(footerText) {
    const out = [];
    for (const rawLine of (footerText || '').split('\n')) {
        const stripped = rawLine.trim();
        if (stripped.toLowerCase() === CHOICE_MARKER) continue;

        const lower = stripped.toLowerCase();
        const tag = lower.startsWith('accept:') ? 'accept:' : lower.startsWith('reject:') ? 'reject:' : '';
        const rest = tag ? stripBranchTag(stripped) : stripped;

        for (const segment of rest.split(/(?<=\s)(?=!)/)) {
            const trimmed = segment.trim();
            if (trimmed.startsWith('!')) {
                out.push(tag + trimmed.substring(1).trim());
            }
        }
    }
    return out;
}

/** Footer text with the !choice marker and effect segments removed — what players actually see. */
export function getDisplayFooter(footerText) {
    const outLines = [];
    for (const rawLine of (footerText || '').split('\n')) {
        let stripped = rawLine.trim();
        if (stripped.toLowerCase() === CHOICE_MARKER) continue;
        stripped = stripBranchTag(stripped);

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

/** Parses one entry returned by getEffectLines() into verb/args/@target/branch. */
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
    }

    const tokens = body.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    const verb = tokens.shift().toLowerCase();
    let targetRef = null;
    const args = [];
    for (const token of tokens) {
        if (token.startsWith('@')) targetRef = token.substring(1);
        else args.push(token);
    }
    return { verb, args, targetRef, branch };
}

function isSignedInt(args, i) {
    if (!args || args.length <= i) return false;
    return /^[+-]?\d+$/.test(args[i]);
}

function validateOperands(p, where) {
    const problems = [];
    const a = p.args;
    switch (p.verb) {
        case 'tg': case 'fleet': case 'tactic': case 'tactical':
        case 'strategy': case 'strategic': case 'comms': case 'commodities':
            if (!isSignedInt(a, 0)) problems.push(`"${p.verb}" needs a number, e.g. "!${p.verb} +2"${where}`);
            break;
        case 'ac':
            if (!isSignedInt(a, 0) || parseInt(a[0].replace('+', ''), 10) <= 0) {
                problems.push(`"ac" needs a positive number, e.g. "!ac 2"${where}`);
            }
            break;
        case 'unit': case 'plastic': {
            const idx = (a.length > 0 && !isSignedInt(a, 0)) ? 1 : 0;
            if (a.length < idx + 2) {
                problems.push(`"${p.verb}" needs "[neutral|<color>] <count> <unit> [planet]", e.g. "!${p.verb} 2 infantry"${where}`);
            } else if (!isSignedInt(a, idx)) {
                problems.push(`"${p.verb}" count "${a[idx]}" isn't a number${where}`);
            }
            break;
        }
        case 'token':
            if (a.length === 0) problems.push(`"token" needs a token id, e.g. "!token gravityrift"${where}`);
            break;
        case 'removetoken':
            if (a.length === 0) problems.push(`"removetoken" needs a token id, e.g. "!removetoken gravityrift"${where}`);
            break;
        case 'removeunit': {
            const idx = (a.length > 0 && !isSignedInt(a, 0)) ? 1 : 0;
            if (a.length < idx + 2) {
                problems.push(`"removeunit" needs "[neutral|<color>] <count> <unit> [planet]", e.g. "!removeunit 2 infantry"${where}`);
            } else if (!isSignedInt(a, idx)) {
                problems.push(`"removeunit" count "${a[idx]}" isn't a number${where}`);
            }
            break;
        }
        case 'swap':
            if (a.length < 2) problems.push(`"swap" needs two positions, e.g. "!swap 203 401"${where}`);
            else if (a[0] === a[1]) problems.push(`"swap" positions must be different${where}`);
            break;
        case 'vp':
            if (!isSignedInt(a, 0) || parseInt(a[0].replace('+', ''), 10) === 0) {
                problems.push(`"vp" needs a non-zero number, e.g. "!vp 1 Ancient Relic"${where}`);
            }
            break;
        case 'so': case 'secretobjective':
            if (a.length > 0 && (!isSignedInt(a, 0) || parseInt(a[0].replace('+', ''), 10) <= 0)) {
                problems.push(`"${p.verb}" needs a positive number, e.g. "!${p.verb} 2", or no args for 1${where}`);
            }
            break;
        default:
            break;
    }
    return problems;
}

/**
 * Best-effort mirror of LoreEffects.validateEffects(): catches the same problems the bot
 * would warn about when this lore entry is saved, so the GM sees them here instead of
 * after importing into a live game. Does not validate unit-type names or @target
 * resolvability against a live board, since this editor has no game state to check against.
 */
export function validateLoreEffects(loreData) {
    const problems = [];
    const footerText = loreData.footerText || '';
    const lines = getEffectLines(footerText);
    const gated = isChoiceGated(footerText);

    for (const line of lines) {
        const p = parseEffectLine(line);
        if (!p) continue;
        const displayLine = (p.branch ? p.branch + ':' : '') + line.replace(/^(accept:|reject:)/i, '');
        const where = ` (in "!${displayLine}")`;

        if (!KNOWN_VERBS.has(p.verb)) {
            problems.push(`unknown effect "${p.verb}"${where}`);
            continue;
        }
        if (p.branch && !gated) {
            problems.push(`"${p.branch}:" tag has no effect without a "!choice" marker in the footer${where}`);
        }
        problems.push(...validateOperands(p, where));
    }

    if (gated) {
        if (loreData.receiver === 'WINNER' || loreData.receiver === 'LOSER') {
            problems.push('"!choice" has no effect when the receiver is Battle winner/loser — that receiver already gates on the player\'s win/loss self-report.');
        } else if (loreData.receiver === 'GM') {
            problems.push('"!choice" has no effect when the receiver is GM — GMs are never offered the choice or its reward.');
        }
    }

    return problems;
}
