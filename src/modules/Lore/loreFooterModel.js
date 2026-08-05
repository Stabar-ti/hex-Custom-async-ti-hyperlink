/**
 * Structured view of an entry's footerText, so the UI can edit effects as objects
 * instead of as raw DSL text the author has to retype.
 *
 * footerText stays the ONLY stored representation — the bot wire format demands it. A
 * FooterDoc is derived state that lives in the open draft and is serialized back on save.
 *
 *   FooterDoc = {
 *     gate:    { type:'none'|'choice'|'roll', count?, sides? },
 *     flavour: string,     // the maximal LEADING run of pure-prose, untagged lines
 *     blocks:  Block[],    // everything after that run, in source order
 *     unsafe:  boolean     // true if any part can't be re-serialized safely
 *   }
 *   Block = { kind:'effect', branch, verb, args, targetRef, conditions }
 *         | { kind:'prose',  branch, text }
 *
 * The leading-prose rule is what makes the flavour box safe: prose is never reordered,
 * so what players read cannot change behind the author's back. Prose that appears after
 * an effect, or that carries a branch tag (roll-bin flavour like "1-3: The vault holds"),
 * stays a positioned block at its exact place in the list.
 *
 * Round-trip contract is SEMANTIC, not byte-for-byte: getEffectLines, getDisplayFooter and
 * getGate must agree before and after. Byte equality is impossible by design — several
 * effects sharing one line become one line each, "@"/"?" tokens move to the end of their
 * effect, and verb aliases canonicalize. Callers avoid gratuitous rewrites by only
 * serializing a doc the author actually edited (see the touchedDoc flag in loreState).
 */

import {
    splitFooterLine, parseEffectLine, serializeEffectLine, canSerializeEffect,
    getGate, withGateMarker, isRollGated, getEffectLines, getDisplayFooter
} from './loreEffects.js';
import { LORE_FOOTER_LIMIT } from './loreCore.js';

const BRANCH_RE = /^(accept|reject|\d+(-\d+)?)$/i;

/** Prose is unsafe when re-parsing it would turn part of it into an effect or break a field. */
function canSerializeProse(block) {
    const text = block.text || '';
    if (/[;|]/.test(text)) return false;
    if (text.trimStart().startsWith('!')) return false;   // would become an effect segment
    if (/\s!/.test(text)) return false;                   // would be split into one
    if (block.branch != null && !BRANCH_RE.test(block.branch)) return false;
    return true;
}

/** True when a block survives a parse -> serialize -> parse pass unchanged. */
export function canSerializeBlock(block) {
    if (!block) return false;
    return block.kind === 'prose' ? canSerializeProse(block) : canSerializeEffect(block);
}

/** A line is flavour material only if it carries no branch tag and holds no effect. */
function isPureProseLine(parsedLine) {
    return parsedLine.branch === null && !parsedLine.segments.some(s => s.isEffect);
}

function proseTextOf(parsedLine) {
    return parsedLine.segments.filter(s => !s.isEffect).map(s => s.text).join(' ');
}

/** footerText -> FooterDoc. Never throws; anything unrecognized is preserved as prose. */
export function parseFooterDoc(footerText) {
    const text = footerText || '';
    const rollGated = isRollGated(text);

    const lines = text.split('\n')
        .map(raw => splitFooterLine(raw, rollGated))
        .filter(line => !line.isGateMarker);

    // The leading run of pure prose becomes the flavour field.
    let firstBlock = 0;
    while (firstBlock < lines.length && isPureProseLine(lines[firstBlock])) firstBlock++;

    const flavour = lines.slice(0, firstBlock).map(proseTextOf).join('\n');

    const blocks = [];
    for (const line of lines.slice(firstBlock)) {
        const branchPrefix = line.branch === null ? '' : line.branch + ':';
        for (const segment of line.segments) {
            if (segment.isEffect) {
                // Parse the getEffectLines form so this shares a code path with validation.
                const parsed = parseEffectLine(branchPrefix + segment.text);
                if (parsed) blocks.push({ kind: 'effect', ...parsed });
            } else {
                blocks.push({ kind: 'prose', branch: line.branch, text: segment.text });
            }
        }
    }

    // `unsafe` reflects the BLOCKS only. Flavour is a field the author types into, so the
    // form validates it inline (see flavourProblem) rather than locking the whole entry.
    return { gate: getGate(text), flavour, blocks, unsafe: !blocks.every(canSerializeBlock) };
}

/**
 * Inline validation for the flavour textarea: '' when fine, otherwise what's wrong.
 * A '!' after whitespace would be re-read as the start of a bot effect, and ';'/'|' are
 * the wire format's separators.
 */
export function flavourProblem(flavour) {
    const text = flavour || '';
    if (/[;|]/.test(text)) return 'Semicolons and "|" are reserved by the export format.';
    if (text.split('\n').some(line => line.trimStart().startsWith('!')) || /\s!/.test(text)) {
        return 'A "!" here would be read as a bot effect. Add effects with the buttons below instead.';
    }
    return '';
}

function serializeBlock(block) {
    if (block.kind === 'prose') {
        const prefix = block.branch ? `${block.branch}: ` : '';
        return prefix + (block.text || '');
    }
    return serializeEffectLine(block);
}

/** FooterDoc -> footerText, with the gate marker placed first by withGateMarker. */
export function serializeFooterDoc(doc) {
    if (!doc) return '';
    const lines = [];
    if (doc.flavour) lines.push(...doc.flavour.split('\n'));
    for (const block of doc.blocks || []) lines.push(serializeBlock(block));
    return withGateMarker(lines.join('\n'), doc.gate);
}

/** Character cost of the doc as it would be stored, for the editor's budget meter. */
export function footerDocLength(doc) {
    return serializeFooterDoc(doc).length;
}

/** Where the characters are going, so the meter can say what to trim. */
export function footerDocBreakdown(doc) {
    const gateOnly = withGateMarker('', doc?.gate || { type: 'none' });
    const flavour = (doc?.flavour || '').length;
    const effects = (doc?.blocks || []).map(serializeBlock).join('\n').length;
    return { gate: gateOnly.length, flavour, effects, total: footerDocLength(doc) };
}

/**
 * Effects compared by MEANING, not by text. The bot lowercases verbs and resolves aliases,
 * so "!TG +2" and "!flt +1" mean exactly what "!tg +2" and "!fleet +1" mean — comparing the
 * raw strings would report a failure where the bot sees none.
 */
function effectSemantics(footerText) {
    return JSON.stringify(getEffectLines(footerText).map(parseEffectLine));
}

/**
 * Asserts the semantic round-trip contract for one footer. Returns
 * { ok, problems: [] } — used by the dev guard below rather than at runtime.
 */
export function checkFooterRoundTrip(footerText) {
    const problems = [];
    const doc = parseFooterDoc(footerText);

    if (doc.unsafe) {
        // An unsafe doc is never serialized back, so there is nothing to verify.
        return { ok: true, problems, skipped: true };
    }

    const rewritten = serializeFooterDoc(doc);

    if (effectSemantics(footerText) !== effectSemantics(rewritten)) {
        problems.push('effect lines changed');
    }
    if (getDisplayFooter(footerText) !== getDisplayFooter(rewritten)) {
        problems.push('player-facing footer changed');
    }
    if (JSON.stringify(getGate(footerText)) !== JSON.stringify(getGate(rewritten))) {
        problems.push('gate changed');
    }
    // Stability is asserted on the TEXT, not the doc. Re-parsing the output can legitimately
    // produce a different shape — prose that led a mixed line becomes its own line and is then
    // promoted into `flavour` — but serializing again must land on the same string, or repeated
    // saves would keep rewriting the footer.
    if (serializeFooterDoc(parseFooterDoc(rewritten)) !== rewritten) {
        problems.push('re-serializing is not stable');
    }
    if (rewritten.length > LORE_FOOTER_LIMIT) {
        problems.push(`grew past the ${LORE_FOOTER_LIMIT}-character limit (${rewritten.length})`);
    }

    return { ok: problems.length === 0, problems, rewritten };
}

/**
 * Dev guard: run the round-trip check over every lore entry on the loaded map.
 * Exposed as window.__loreCheckAllFooters() by loreUI so it can be run from the console
 * against real data — the project has no test runner, so this is the regression net.
 */
export function checkAllFooters(editor) {
    const rows = [];
    const visit = (where, entries) => {
        (entries || []).forEach((entry, i) => {
            const result = checkFooterRoundTrip(entry.footerText || '');
            if (!result.ok) {
                rows.push({ where: `${where}[${i}]`, problems: result.problems.join('; '),
                    footer: entry.footerText });
            }
        });
    };

    for (const [label, hex] of Object.entries(editor?.hexes || {})) {
        visit(`${label} system`, hex.systemLore);
        for (const [idx, list] of Object.entries(hex.planetLore || {})) {
            visit(`${label} planet ${idx}`, list);
        }
    }
    for (const [phase, list] of Object.entries(editor?.phaseLore || {})) {
        visit(`phase ${phase}`, list);
    }

    if (rows.length) {
        console.warn(`${rows.length} footer(s) fail the round-trip contract:`);
        console.table(rows);
    } else {
        console.log('All footers round-trip cleanly.');
    }
    return rows;
}
