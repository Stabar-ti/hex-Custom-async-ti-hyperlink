/**
 * Round-trip tests for the lore footer model, run against the real modules.
 *
 * These matter because footerText is the only thing the AsyncTI4 bot ever reads. The
 * structured editor parses it into objects and writes it back, so a defect here silently
 * corrupts a GM's lore. The contract is SEMANTIC, not byte-for-byte: several effects sharing
 * one line become one line each, "@"/"?" tokens move to the end, and verb aliases
 * canonicalize — none of which changes what the bot does.
 *
 *   node tools/test-lore-footer.js      (or: npm test)
 *
 * The lore modules used here are pure — no DOM — so they import straight into node.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    getEffectLines, getDisplayFooter, getGate, parseEffectLine,
    serializeEffectBody, canSerializeEffect
} from '../src/modules/Lore/loreEffects.js';
import {
    parseFooterDoc, serializeFooterDoc, checkFooterRoundTrip, flavourProblem
} from '../src/modules/Lore/loreFooterModel.js';

const here = dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// ── corpus ────────────────────────────────────────────────────────────────────

const SYNTHETIC = [
    '', 'Just flavour.', 'a\n\nb',
    '!tg +2',
    'Flavour first\n!tg +2\n!fleet +1',
    '!tg +2\nflavour after the effect',
    '!choice\naccept:!tg +2\nreject:!tg -1',
    '!roll 2d10\n1-3: The vault stays shut.\n4-10:!tg +2',
    '!roll 2d10\n15:!vp 1',
    '!tg +2 !fleet +1',
    'prose !tg +2 more prose',
    'ACCEPT:!TG +2',
    '!flt +1',
    '!unit red 2 infantry @305 ?red ?round:3-6',
    '!tg +2 ?!faction:winnu',
    'line one\n!tg +2\nline two\n!ac 1',
    '   ragged   \n   !tg   +2   ',
    '!choice',
    '!roll 2d10',
    '3: not a bin without a roll marker',
    '!roll 1d6\n12:00 looks like a bin now',
    'flavour\n!swap 203 401\ntail prose',
    '!token gravityrift @mecatolrex',
    '!removeunit neutral 3 infantry mr'
];

/** Footers from the lore export shipped in the repo — real GM-authored text. */
function realFooters() {
    try {
        const blob = readFileSync(
            join(here, '..', 'public', 'data', 'tempo', 'fow474_lore_export.txt'), 'utf8');
        return blob.split('|')
            .map(entry => entry.split(';'))
            .filter(fields => fields.length >= 3)
            .map(fields => fields[2]);
    } catch {
        console.warn('  (real export not readable — synthetic cases only)');
        return [];
    }
}

// ── 1. the round-trip contract ────────────────────────────────────────────────

const real = realFooters();
const corpus = [...real, ...SYNTHETIC];
let skipped = 0;

for (const footer of corpus) {
    const result = checkFooterRoundTrip(footer);
    if (result.skipped) { skipped++; continue; }
    check('round-trip', result.ok,
        `footer: ${JSON.stringify(footer)}\n    problems: ${result.problems.join('; ')}`);
}

// ── 2. effect parse <-> serialize ─────────────────────────────────────────────

const EFFECT_LINES = [
    'tg +2', 'flt +1', 'unit red 2 infantry', 'token gravityrift',
    'removeunit neutral 3 infantry mr', 'swap 203 401', 'cc red',
    'unit red 2 infantry @305', 'tg +2 ?red', 'tg +2 ?!faction:winnu',
    'unit red 2 infantry @305 ?red ?round:3-6',
    'accept:tg +2', 'reject:tg -1', '2-10:ac 1', '15:vp 1', 'ACCEPT:TG +2'
];

for (const line of EFFECT_LINES) {
    const parsed = parseEffectLine(line);
    check('parses', parsed !== null, line);
    if (!parsed) continue;
    check('guard accepts', canSerializeEffect(parsed), line);
    const once = serializeEffectBody(parsed);
    const twice = serializeEffectBody(parseEffectLine(once));
    check('serialize is idempotent', once === twice, `${line}\n    ${once} !== ${twice}`);
    check('reparse is stable',
        JSON.stringify(parseEffectLine(once)) === JSON.stringify(parsed), line);
}

// A negated condition is valid and must NOT be refused — the '!' sits behind a '?', so it
// can never be re-split into an effect segment.
check('negated condition is serializable',
    canSerializeEffect(parseEffectLine('tg +2 ?!faction:winnu')));

// An arg starting with '!' WOULD be re-split, so it must be refused.
check('bare "!" arg is refused',
    !canSerializeEffect({ verb: 'tg', args: ['!oops'], conditions: [], targetRef: null, branch: null }));

// Wire-format separators must be refused wherever they appear.
check('";" in an arg is refused',
    !canSerializeEffect({ verb: 'tg', args: ['a;b'], conditions: [], targetRef: null, branch: null }));
check('"|" in a condition is refused',
    !canSerializeEffect({ verb: 'tg', args: [], conditions: ['a|b'], targetRef: null, branch: null }));

// ── 3. structural guarantees ──────────────────────────────────────────────────

// Prose is never reordered: only the LEADING run of untagged prose becomes flavour.
{
    const doc = parseFooterDoc('lead one\nlead two\n!tg +2\ntrailing prose');
    check('leading prose becomes flavour', doc.flavour === 'lead one\nlead two',
        JSON.stringify(doc.flavour));
    check('trailing prose stays a positioned block',
        doc.blocks.length === 2 && doc.blocks[1].kind === 'prose'
        && doc.blocks[1].text === 'trailing prose');
}

// Roll bins survive as branch tags on their blocks.
{
    const doc = parseFooterDoc('!roll 2d10\n1-3: shut\n4-10:!tg +2');
    check('roll gate parsed with its dice',
        doc.gate.type === 'roll' && doc.gate.count === 2 && doc.gate.sides === 10,
        JSON.stringify(doc.gate));
    check('bin-tagged prose keeps its branch',
        doc.blocks.some(b => b.kind === 'prose' && b.branch === '1-3'));
    check('bin-tagged effect keeps its branch',
        doc.blocks.some(b => b.kind === 'effect' && b.branch === '4-10'));
}

// The gate marker is always emitted first and exactly once.
{
    const doc = parseFooterDoc('flavour\n!choice\naccept:!tg +2');
    const out = serializeFooterDoc(doc);
    const lines = out.split('\n');
    check('gate marker is first', lines[0] === '!choice', JSON.stringify(out));
    check('gate marker appears once',
        lines.filter(l => l.trim() === '!choice').length === 1, JSON.stringify(out));
}

// flavourProblem catches text that would be re-read as an effect.
check('flavour with " !" is rejected', flavourProblem('hello !tg +2') !== '');
check('flavour starting with "!" is rejected', flavourProblem('!tg +2') !== '');
check('flavour with ";" is rejected', flavourProblem('a;b') !== '');
check('ordinary flavour is accepted', flavourProblem('The vault door groans open.') === '');

// A footer the model can't rebuild safely must be flagged unsafe, so the UI falls back to
// raw text instead of rewriting it. An arg containing whitespace is the clearest case:
// re-parsing would split it into two separate args.
{
    const clean = parseFooterDoc('!tg +2');
    check('an ordinary footer is not flagged unsafe', clean.unsafe === false);

    const smuggled = parseFooterDoc('!vp 1 Ancient Relic');
    check('multi-word operands stay safe (they are separate args)', smuggled.unsafe === false);

    // Reach past the parser to build the shape a hand-edited footer could produce.
    const doc = parseFooterDoc('!tg +2');
    doc.blocks[0].args = ['has space'];
    check('an arg containing whitespace is refused',
        canSerializeEffect(doc.blocks[0]) === false);

    const withSep = parseFooterDoc('!tg +2');
    withSep.blocks[0].args = ['a;b'];
    check('an arg containing ";" is refused',
        canSerializeEffect(withSep.blocks[0]) === false);
}

// getDisplayFooter must never leak an effect into what players read.
for (const footer of corpus) {
    const shown = getDisplayFooter(footer);
    check('no effect leaks into the player view', !/(^|\s)!/.test(shown),
        `${JSON.stringify(footer)} -> ${JSON.stringify(shown)}`);
}

// getEffectLines and the doc model must agree on how many effects exist.
for (const footer of corpus) {
    const doc = parseFooterDoc(footer);
    if (doc.unsafe) continue;
    const fromLines = getEffectLines(footer).length;
    const fromDoc = doc.blocks.filter(b => b.kind === 'effect').length;
    check('effect count agrees', fromLines === fromDoc,
        `${JSON.stringify(footer)}: getEffectLines=${fromLines} doc=${fromDoc}`);
}

// Gate detection agrees before and after a rewrite.
for (const footer of corpus) {
    const doc = parseFooterDoc(footer);
    if (doc.unsafe) continue;
    check('gate survives', JSON.stringify(getGate(serializeFooterDoc(doc)))
        === JSON.stringify(getGate(footer)), JSON.stringify(footer));
}

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nlore footer model: ${passed} checks passed` +
    `, ${failures.length} failed` +
    ` (${real.length} real footers, ${SYNTHETIC.length} synthetic, ${skipped} unsafe/skipped)`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
