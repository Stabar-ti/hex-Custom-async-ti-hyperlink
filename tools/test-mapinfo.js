/**
 * Tests how hyperlanes and wormholes cross to and from the bot — one-way ones included.
 *
 *   node tools/test-mapinfo.js      (or: npm test)
 *
 * The fixtures are the bot's own (CustomHyperlaneServiceTest, MapJsonIOServiceTest,
 * WormholeDataTest), so a pass here means the editor writes what the bot reads back as the
 * same map, and reads what the bot writes:
 *   - JSON `customHyperlaneString` is the typed form (1 two-way, 2 one-way), read with
 *     toStoredMatrix;
 *   - the packed hyperlane export is the stored matrix, 9 hex chars;
 *   - the bot reads custom lanes only on an `hl` tile;
 *   - one-way wormhole tokens are `<token>_in` / `<token>_out`, stored as
 *     `token_oneway_<token>_<dir>.png`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    customHyperlaneString, parseTypedMatrixString, storedMatrixFromCustomString,
    hyperlaneExportInfo, staticHyperlaneMatrix, upgradeLegacyLanes, formatMatrixString
} from '../src/data/hyperlaneIO.js';
import {
    buildWormholeTokenIndex, wormholeTokensForHex, wormholeKeysForToken, resolveOneWayToken, oneWayTokenId
} from '../src/data/wormholeTokens.js';
import { matrixToHex, hexToMatrix } from '../src/utils/matrix.js';
import { emptyMatrix, withLink, symmetrised, isOneWay, hasLink } from '../src/modules/Hyperlanes/hyperlaneModel.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'public', 'data');
const readJson = name => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parse = s => s.split(';').map(r => r.split(',').map(Number));
const one = (i, j) => withLink(emptyMatrix(), i, j);

// ── 1. JSON customHyperlaneString ─────────────────────────────────────────────

{
    // MapJsonIOServiceTest.oneWayHyperlaneRoundTripsThroughExportAndImport
    const typed = '0,0,0,2,0,0;0,0,0,0,1,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0';
    const stored = storedMatrixFromCustomString(typed);
    check('a typed 2 imports one-way', isOneWay(stored, 0, 3) && hasLink(stored, 0, 3));
    check('a typed 1 imports two-way', hasLink(stored, 1, 4) && hasLink(stored, 4, 1));
    // The bot's test compares the stored matrices: its export writes the two-way lane as
    // both of its 1s, which is the same lane.
    check('export → import gives the same stored matrix',
        eq(storedMatrixFromCustomString(customHyperlaneString(stored)), stored), customHyperlaneString(stored));
    check('the exported string keeps the one-way 2', customHyperlaneString(stored).startsWith('0,0,0,2,0,0;'));

    check('a one-way lane is written as a 2', customHyperlaneString(one(5, 1)).split(/[;,]/)[5 * 6 + 1] === '2');
    check('a two-way lane is written as two 1s', customHyperlaneString(symmetrised(one(5, 1))) ===
        formatMatrixString(symmetrised(one(5, 1))));
    check('no lanes is an empty string', customHyperlaneString(emptyMatrix()) === '');

    // A symmetric 0/1 string — what every export before one-way lanes wrote — still means two-way,
    // and an old one-sided 0/1 string is mirrored, as the bot mirrors every 1.
    const old = storedMatrixFromCustomString(formatMatrixString(one(2, 5)));
    check('an old 0/1 string with a lane set one way is read two-way, as the bot reads it',
        hasLink(old, 2, 5) && hasLink(old, 5, 2));

    // CustomHyperlaneServiceTest.roundaboutsConnectEveryEntryToEveryExit
    const loop = '1,0,2,0,0,0;0,0,0,0,0,0;0,0,1,0,2,0;0,0,0,0,0,0;2,0,0,0,1,0;0,0,0,0,0,0';
    const allWays = '1,0,1,0,1,0;0,0,0,0,0,0;1,0,1,0,1,0;0,0,0,0,0,0;1,0,1,0,1,0;0,0,0,0,0,0';
    check('a one-way loop round a roundabout imports two-way', eq(storedMatrixFromCustomString(loop), parse(allWays)));
    const fromNorth = '1,0,2,0,2,0;0,0,0,0,0,0;0,0,1,0,0,0;0,0,0,0,0,0;0,0,0,0,1,0;0,0,0,0,0,0';
    const rb = storedMatrixFromCustomString(fromNorth);
    check('a one-way roundabout round-trips through export', customHyperlaneString(rb) === fromNorth,
        customHyperlaneString(rb));

    // isValidConnectionMatrix
    check('validation: 0/1/2 accepted', parseTypedMatrixString(loop) !== null);
    check('validation: whitespace and newlines around cells accepted',
        parseTypedMatrixString(typed.replace(/;/g, ';\n').replace(/,/g, ', ')) !== null);
    check('validation: a trailing ; is fine (Java split drops it)', parseTypedMatrixString(typed + ';') !== null);
    check('validation: a 3 is rejected', parseTypedMatrixString(typed.replace('2', '3')) === null);
    check('validation: wrong size is rejected', parseTypedMatrixString('0,0,0;0,0,0') === null);
    check('validation: not a string is rejected', parseTypedMatrixString(null) === null);
    check('an invalid string imports as null', storedMatrixFromCustomString('1,2,3') === null);
}

// ── 2. Which tile the bot reads the lanes from ────────────────────────────────

{
    const hyperlanes = readJson('hyperlanes.json');
    const printed = hyperlanes['83a'];
    check('fixture: 83a is a static hyperlane', Array.isArray(printed));

    let info = hyperlaneExportInfo({ realId: '83A', matrix: printed.map(r => [...r]) }, hyperlanes);
    check('a static tile with its printed lanes keeps its id and writes no lanes',
        info.tileID === '83A' && info.lanes === null, JSON.stringify(info));

    const redrawn = printed.map(r => [...r]);
    const [i, j] = (() => { for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (redrawn[a][b] === 1) return [a, b]; return [0, 0]; })();
    redrawn[j][i] = 0;   // turn one lane one-way
    info = hyperlaneExportInfo({ realId: '83A', matrix: redrawn }, hyperlanes);
    check('a static tile with a one-way lane exports as hl with its lanes',
        info.tileID === 'hl' && eq(info.lanes, redrawn), JSON.stringify(info));

    info = hyperlaneExportInfo({ realId: null, matrix: one(0, 3) }, hyperlanes);
    check('lanes with no tile export as hl', info.tileID === 'hl' && !info.ignoredByBot);
    info = hyperlaneExportInfo({ realId: 'hl', matrix: one(0, 3) }, hyperlanes);
    check('an hl tile stays hl', info.tileID === 'hl' && eq(info.lanes, one(0, 3)));

    info = hyperlaneExportInfo({ realId: '19', matrix: symmetrised(one(0, 3)) }, hyperlanes);
    check('a system tile keeps its id, and its lanes are flagged as ignored by the bot',
        info.tileID === '19' && info.lanes !== null && info.ignoredByBot);

    info = hyperlaneExportInfo({ realId: '19', matrix: emptyMatrix() }, hyperlanes);
    check('no lanes changes nothing', info.tileID === '19' && info.lanes === null && !info.ignoredByBot);

    check('importing 83a with no string loads its printed lanes', eq(staticHyperlaneMatrix('83A', hyperlanes), printed));
    check('…and a system id loads none', staticHyperlaneMatrix('19', hyperlanes) === null);
    check('staticHyperlaneMatrix copies', staticHyperlaneMatrix('83a', hyperlanes) !== printed);
}

// ── 3. Packed export (the bot's hyperlane manager Export / Import) ─────────────

{
    // LoreServiceTest ONE_WAY_0_TO_3 → encodeMatrix: bit 3 of 36, MSB first, %09x.
    check('matrixToHex encodes a one-way lane like the bot', matrixToHex(one(0, 3)) === '100000000',
        matrixToHex(one(0, 3)));
    check('…and decodes it back one-way', eq(hexToMatrix('100000000'), one(0, 3)));
    check('matrixToHex never throws on a stray 2', matrixToHex(parse('2,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0')) === '000000000');
}

// ── 4. Legacy full-state saves ─────────────────────────────────────────────────

{
    const legacy = { hexes: [{ id: '101', ln: one(0, 3) }] };
    upgradeLegacyLanes(legacy, legacy.hexes);
    check('a save without hlDirected has its one-sided lanes mirrored',
        eq(legacy.hexes[0].ln, symmetrised(one(0, 3))));

    const current = { hlDirected: true, hexes: [{ id: '101', ln: one(0, 3) }] };
    upgradeLegacyLanes(current, current.hexes);
    check('a save with hlDirected keeps one-way lanes', eq(current.hexes[0].ln, one(0, 3)));
}

// ── 5. One-way wormhole tokens ────────────────────────────────────────────────

{
    const index = buildWormholeTokenIndex(readJson('tokens.json'));

    // WormholeDataTest.everyPlainWormholeTypeHasEntryAndExitOnlyTokens
    check('alpha has whalpha_in / whalpha_out',
        oneWayTokenId(index, 'alpha', 'in') === 'whalpha_in' && oneWayTokenId(index, 'alpha', 'out') === 'whalpha_out');
    check('gamma uses whgamma, not gamma', oneWayTokenId(index, 'gamma', 'in') === 'whgamma_in');
    check('omega, lambda and the rat race types have them',
        ['omega', 'lambda', 'kappa_rat'].every(t => oneWayTokenId(index, t, 'out')));
    check('rat race tokens are whrat…', oneWayTokenId(index, 'alpha_rat', 'in') === 'whratalpha_in');
    check('vortex has none (its token is not mergeable)', oneWayTokenId(index, 'vortex', 'in') === null);

    const lambda = resolveOneWayToken(index, 'whlambda_out');
    check('lambda draws with the sigma-lambda image', lambda?.baseImage === 'token_sigma_lambda.png', JSON.stringify(lambda));
    check('the stored image name resolves', resolveOneWayToken(index, 'token_oneway_whalpha_in.png')?.id === 'whalpha_in');
    check('so does a path and any case', resolveOneWayToken(index, 'tokens/TOKEN_ONEWAY_WHDELTA_OUT.PNG')?.id === 'whdelta_out');
    check('a plain token is not one-way', resolveOneWayToken(index, 'whalpha') === null);

    // MapJsonIOServiceTest.oneWayWormholeTokensRoundTripAndImportByIdWithoutErrors
    check('import: the bot export name becomes alpha:in',
        eq(wormholeKeysForToken(index, 'token_oneway_whalpha_in.png'), ['alpha:in']));
    check('import: a hand-written id becomes delta:out', eq(wormholeKeysForToken(index, 'whdelta_out'), ['delta:out']));
    check('import: a plain wormhole token is unchanged', eq(wormholeKeysForToken(index, 'token_whalpha.png'), ['alpha']));
    check('import: a non-wormhole token is not a wormhole', wormholeKeysForToken(index, 'gravityrift') === null);

    const hex = { customWormholes: new Set(['beta', 'alpha:in', 'gamma:out', 'vortex:in']) };
    const { tokens, missing } = wormholeTokensForHex(index, hex);
    check('export: two-way and one-way wormholes become their tokens',
        eq(tokens, ['whbeta', 'whalpha_in', 'whgamma_out']), JSON.stringify(tokens));
    check('export: a one-way wormhole with no bot token is reported', eq(missing, ['vortex:in']), JSON.stringify(missing));

    // Round trip: export tokens → import keys.
    const back = tokens.flatMap(t => wormholeKeysForToken(index, t) || []);
    check('export → import gives the same wormholes back', eq(back, ['beta', 'alpha:in', 'gamma:out']), JSON.stringify(back));
}

// ── 6. exportMapInfo, end to end ──────────────────────────────────────────────
//
// The real export, with tokens.json served from disk. It is the JSON the bot's
// MapJsonIOService imports.

{
    const root = join(here, '..');
    globalThis.window ??= /** @type {any} */ ({ location: { pathname: '/' } });
    globalThis.fetch = /** @type {any} */ (async url => ({
        ok: true,
        json: async () => JSON.parse(readFileSync(join(root, String(url).replace(/^\//, '')), 'utf8')),
    }));
    const { exportMapInfo } = await import('../src/data/export.js');

    const hyperlanes = readJson('hyperlanes.json');
    const lanes = one(0, 3);
    lanes[1][4] = 1; lanes[4][1] = 1;
    const blank = () => emptyMatrix();
    const editor = {
        hyperlaneMatrices: hyperlanes,
        hexes: {
            101: { center: { x: 0, y: 0 }, q: 0, r: -1, realId: null, matrix: lanes, customWormholes: new Set(), planets: [] },
            102: { center: { x: 1, y: 0 }, q: 1, r: -1, realId: '19', matrix: blank(), customWormholes: new Set(['alpha:in', 'beta']), planets: [] },
            103: { center: { x: 2, y: 0 }, q: 1, r: 0, realId: '83a', matrix: hyperlanes['83a'].map(r => [...r]), customWormholes: new Set(), planets: [] },
        },
    };
    const { mapInfo } = await exportMapInfo(editor, {});
    const at = p => mapInfo.find(e => e.position === p);

    check('e2e: drawn lanes export as an hl tile', at('101')?.tileID === 'hl');
    check('e2e: …with the one-way lane as a 2',
        at('101')?.customHyperlaneString === '0,0,0,2,0,0;0,0,0,0,1,0;0,0,0,0,0,0;0,0,0,0,0,0;0,1,0,0,0,0;0,0,0,0,0,0',
        at('101')?.customHyperlaneString);
    check('e2e: one-way and two-way wormholes export as their tokens', eq(at('102')?.tokens, ['whalpha_in', 'whbeta']),
        JSON.stringify(at('102')?.tokens));
    check('e2e: a static tile exports as itself with no string',
        at('103')?.tileID === '83a' && at('103')?.customHyperlaneString === '');
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\ntest-mapinfo: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.error('\nFailures:\n' + failures.map(f => `  ✗ ${f}`).join('\n') + '\n');
    process.exit(1);
}
