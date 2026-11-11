/**
 * Tests hyperlane bridges and portals: the pure models (ports of the bot's BridgeMatrix and
 * HyperlanePortals), their bot-boundary IO, and the drawing geometry.
 *
 *   node tools/test-bridges-portals.js      (or: npm test)
 *
 * Fixtures are the bot's own (HyperlanePortalsTest, the map-tool note's sample export in
 * .notes/map-tool-bridges-portals.md), so a pass means the editor reads and writes what
 * the bot does.
 */

import {
    bridgePairs, bridgeProblem, bridgeSides, bridgeExitsFrom, bridgeEntriesLeadingTo, chosenLayout,
    describeBridge, layoutProblem, rimGaps, rimLayoutsWithoutSharing, rotatedBridge, bridgeFromLanes,
    lanesOfBridge, normalizedBridge, entersAt, exitsAt
} from '../src/modules/Hyperlanes/bridgeModel.js';
import {
    canHoldPortals, describePortals, encodeCompact, parseAnyPortals, parseTypedPortals, portalColour,
    rotatedPortals, typedFromCompact, isCompactPortals, normalizedPortals, hsbToRgb, brighterRgb
} from '../src/modules/Hyperlanes/portalModel.js';
import {
    bridgeExportInfo, bridgeFromLanesString, bridgeLanesString, hyperlaneExportInfo, portalsExportInfo,
    portalsFromString, parseTypedMatrixString, storedMatrixFromCustomString, bridgeHostProblem, portalHostProblem
} from '../src/data/hyperlaneIO.js';
import { bridgeTrail, portalSlotPoint, rimMid } from '../src/modules/Hyperlanes/bridgePortalGeometry.js';
import { emptyMatrix, toStoredMatrix } from '../src/modules/Hyperlanes/hyperlaneModel.js';
import { hexToMatrix, matrixToHex } from '../src/utils/matrix.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typed = (text) => toStoredMatrix(parseTypedMatrixString(text));

/** A stored bridge from lane rows `[a, b, dir]`. */
function bridge(...lanes) {
    return bridgeFromLanes(lanes.map(([a, b, dir = 'both']) => ({ a, b, dir })));
}

// The note's sample: 000 bridged N → S one-way and NE ↔ SE two-way.
const SAMPLE_BRIDGE = '0,0,0,2,0,0;0,0,1,0,0,0;0,1,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0';
const ROUNDABOUT = '1,0,1,0,1,0;0,0,0,0,0,0;1,0,1,0,1,0;0,0,0,0,0,0;1,0,1,0,1,0;0,0,0,0,0,0';
const STRAIGHT = '0,0,0,1,0,0;0,0,0,0,0,0;0,0,0,0,0,0;1,0,0,0,0,0;0,0,0,0,0,0;0,0,0,0,0,0';

// ── 1. Bridge layout rules (BridgeMatrix.layoutProblem) ──────────────────────

{
    const sample = typed(SAMPLE_BRIDGE);
    check('sample bridge is valid', bridgeProblem(sample) === null, bridgeProblem(sample));
    check('sample bridge encodes as the note says', matrixToHex(sample) === '108400000', matrixToHex(sample));
    check('sample bridge pairs', eq(bridgePairs(sample), [{ low: 0, high: 3 }, { low: 1, high: 2 }]));
    check('sample bridge described', eq(describeBridge(sample), ['N → S', 'NE ↔ SE']), describeBridge(sample).join());
    check('sample bridge sides', eq(bridgeSides(sample), [0, 1, 2, 3]));
    check('N enters, S only exits', entersAt(sample, 0) && !exitsAt(sample, 0) && exitsAt(sample, 3) && !entersAt(sample, 3));
    check('exits from N', eq(bridgeExitsFrom(sample, 0), [3]));
    check('no exit from S when moving', eq(bridgeExitsFrom(sample, 3), []));
    check('S reaches N both ways (adjacency)', eq(bridgeExitsFrom(sample, 3, true), [0]));
    check('entries leading to S', eq(bridgeEntriesLeadingTo(sample, 3), [0]));

    const split = bridge([0, 2], [0, 4]);
    check('a split is refused', /N is used by/.test(layoutProblem(split) || ''), layoutProblem(split));
    const crossing = bridge([0, 3], [1, 4]);
    check('crossing lanes are refused', /would cross on the rim/.test(layoutProblem(crossing) || ''), layoutProblem(crossing));
    const crowded = bridge([0, 3], [1, 2], [4, 5]);
    check('N–S, NE–SE and SW–NW have no rim room',
        /can't each get their own stretch/.test(layoutProblem(crowded) || ''), layoutProblem(crowded));
    const nested = bridge([0, 3], [1, 2]);
    check('a lane nested inside another fits', layoutProblem(nested) === null, layoutProblem(nested));
    const roundabout = emptyMatrix(); roundabout[0][0] = 1; roundabout[0][3] = 1;
    check('a roundabout is refused', /diagonal/.test(bridgeProblem(roundabout) || ''), bridgeProblem(roundabout));
    check('an empty bridge has no problem', bridgeProblem(emptyMatrix()) === null);

    check('rim gaps clockwise from low', eq(rimGaps({ low: 1, high: 4 }, true), [1, 2, 3]));
    check('rim gaps clockwise from high', eq(rimGaps({ low: 1, high: 4 }, false), [4, 5, 0]));
    check('nested layout count', rimLayoutsWithoutSharing(nested).length > 0);

    // N–S has two arcs of 3; NE–SE lies on the N–S east arc, so N–S goes west (from S).
    const layout = chosenLayout(sample);
    const ns = layout.find(l => l.low === 0 && l.high === 3);
    const ne = layout.find(l => l.low === 1 && l.high === 2);
    check('NE–SE takes its short arc', ne?.clockwiseFromLow === true && eq(ne.gaps, [1]), JSON.stringify(ne));
    check('N–S goes round the west side', ns?.clockwiseFromLow === false && eq(ns.gaps, [3, 4, 5]), JSON.stringify(ns));

    const turned = rotatedBridge(sample, 1);
    check('rotation moves the lanes', eq(describeBridge(turned), ['NE → SW', 'SE ↔ S']), describeBridge(turned).join());
    check('rotation keeps it valid', bridgeProblem(turned) === null);
    check('lane rows round-trip', eq(bridgeFromLanes(lanesOfBridge(sample)), sample));
    check('normalizedBridge drops the diagonal and empties', normalizedBridge(emptyMatrix()) === null
        && normalizedBridge(roundabout)?.[0][0] === 0);
}

// ── 2. Portals (HyperlanePortalsTest) ─────────────────────────────────────────

{
    const desc = (t) => describePortals(parseTypedPortals(t).slots);
    check('parses the modal format', desc('5=c<, 0=A ; 3=B>') === '0=A, 3=B>, 5=C<', desc('5=c<, 0=A ; 3=B>'));
    check('slotless fill in order', desc('B, C>, D<') === '0=B, 1=C>, 2=D<', desc('B, C>, D<'));
    check('first portal moves to the centre', desc('3=B, 5=C') === '0=B, 5=C', desc('3=B, 5=C'));
    check('…and says so', parseTypedPortals('3=A, 5=B').movedToCentre === 'A');
    check('an unslotted letter takes the centre first', desc('1=A, B') === '0=B, 1=A', desc('1=A, B'));
    check('more than 7 is refused', !!parseTypedPortals('A, B, C, D, E, F, G, H').problem);
    check('slot 7 is refused', !!parseTypedPortals('7=A').problem);
    check('a slot twice is refused', !!parseTypedPortals('1=A, 1=B').problem);
    check('a letter twice (any case) is refused', !!parseTypedPortals('1=A, 2=a').problem);
    check('junk is refused', !!parseTypedPortals('AB').problem);
    check('empty is no portals', eq(parseTypedPortals('').slots, []) && !parseTypedPortals('').problem);

    const sample = parseTypedPortals('0=A, 1=C<, 3=B>').slots;
    check('compact form', encodeCompact(sample) === '0A1C<3B>', encodeCompact(sample));
    check('compact detected', isCompactPortals('0A1C<3B>') && !isCompactPortals('A,3=B>'));
    check('typed from compact', typedFromCompact('0A3B>') === '0=A,3=B>', typedFromCompact('0A3B>'));
    check('parseAny reads compact', describePortals(parseAnyPortals('0A1C<3B>').slots) === '0=A, 1=C<, 3=B>');
    check('parseAny reads lore typed form', describePortals(parseAnyPortals('A,3=B>,C<').slots) === '0=A, 1=C<, 3=B>',
        describePortals(parseAnyPortals('A,3=B>,C<').slots));

    const rot = rotatedPortals(parseTypedPortals('0=A, 1=B, 6=C').slots, 1);
    check('rotation turns the ring slots, not the centre', describePortals(rot) === '0=A, 1=C, 2=B', describePortals(rot));
    check('rotation back', describePortals(rotatedPortals(rot, -1)) === '0=A, 1=B, 6=C');

    check('a roundabout holds portals', canHoldPortals(typed(ROUNDABOUT)));
    check('an empty hl holds portals', canHoldPortals(emptyMatrix()) && canHoldPortals(null));
    check('a straight lane does not', !canHoldPortals(typed(STRAIGHT)));

    check('normalized from saved array', describePortals(normalizedPortals([{ slot: 3, letter: 'b', flow: 'entry' }, { slot: 0, letter: 'A', flow: 'both' }])) === '0=A, 3=B>');
    check('normalized from junk is null', normalizedPortals('??') === null && normalizedPortals([]) === null);

    const colours = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(portalColour));
    check('every letter has its own colour', colours.size === 26, String(colours.size));
    check('A is the vivid red of hue 0', portalColour('A') === '#f22424', portalColour('A'));
    check('HSBtoRGB grey', eq(hsbToRgb(0.5, 0, 0.5), [128, 128, 128]));
    check('brighter like java.awt.Color', eq(brighterRgb([100, 0, 2]), [142, 0, 4]) && eq(brighterRgb([0, 0, 0]), [3, 3, 3]));
}

// ── 3. Bot boundary IO ────────────────────────────────────────────────────────

{
    const sample = typed(SAMPLE_BRIDGE);
    check('bridgeLanes round-trips the note sample', bridgeLanesString(sample) === SAMPLE_BRIDGE, bridgeLanesString(sample));
    const read = bridgeFromLanesString(SAMPLE_BRIDGE);
    check('bridgeLanes reads back', !read.problem && eq(read.bridge, sample));
    check('bad bridgeLanes refused', !!bridgeFromLanesString('1,0').problem);
    check('a bridge roundabout refused on import', !!bridgeFromLanesString(ROUNDABOUT).problem);
    check('a crossing bridge refused on import',
        /cross/.test(bridgeFromLanesString(bridgeLanesString(bridge([0, 3], [1, 4]))).problem || ''));
    check('empty bridge writes nothing', bridgeLanesString(emptyMatrix()) === '');

    const sys = { realId: '19', bridge: sample, matrix: emptyMatrix() };
    check('a bridge on a system exports', bridgeExportInfo(sys, '19').text === SAMPLE_BRIDGE);
    check('a bridge on hl is refused', !!bridgeExportInfo(sys, 'hl').problem);
    check('a bridge on a static hyperlane is refused', !!bridgeExportInfo(sys, '83a', { '83a': emptyMatrix() }).problem);
    check('an invalid bridge is refused', !!bridgeExportInfo({ bridge: bridge([0, 3], [1, 4]) }, '19').problem);

    const portals = parseTypedPortals('0=A, 1=C<, 3=B>').slots;
    const rb = { realId: 'hl', matrix: typed(ROUNDABOUT), portals };
    const rbInfo = hyperlaneExportInfo(rb);
    check('a roundabout with portals exports as hl', rbInfo.tileID === 'hl' && !!rbInfo.lanes);
    check('…with its portals', portalsExportInfo(rb, rbInfo).text === '0=A, 1=C<, 3=B>' && portalsExportInfo(rb, rbInfo).compact === '0A1C<3B>');
    check('…and lanes a80a80a80', matrixToHex(rbInfo.lanes) === 'a80a80a80', matrixToHex(rbInfo.lanes));

    const inter = { realId: null, matrix: emptyMatrix(), portals: parseTypedPortals('0=A, 5=D').slots };
    const interInfo = hyperlaneExportInfo(inter);
    check('an interchange exports as an empty hl', interInfo.tileID === 'hl' && interInfo.lanes === null, JSON.stringify(interInfo));
    check('…with its portals', portalsExportInfo(inter, interInfo).compact === '0A5D');

    const straight = { realId: 'hl', matrix: typed(STRAIGHT), portals };
    check('portals on a straight lane are refused', !!portalsExportInfo(straight, hyperlaneExportInfo(straight)).problem);
    const onSystem = { realId: '19', matrix: emptyMatrix(), portals };
    check('portals on a system are refused', !!portalsExportInfo(onSystem, hyperlaneExportInfo(onSystem)).problem);

    const statics = { '83a': typed(ROUNDABOUT) };
    const stat = { realId: '83a', matrix: typed(ROUNDABOUT), portals };
    const statInfo = hyperlaneExportInfo(stat, statics);
    check('a static roundabout with portals goes out as hl', statInfo.tileID === 'hl' && !!statInfo.lanes);
    check('a static tile without portals stays itself', hyperlaneExportInfo({ realId: '83a', matrix: typed(ROUNDABOUT) }, statics).tileID === '83a');

    check('portals string read', describePortals(portalsFromString('0=A, 1=C<, 3=B>').portals) === '0=A, 1=C<, 3=B>');
    check('slotless portals string read', describePortals(portalsFromString('A, B>, C<').portals) === '0=A, 1=B>, 2=C<');
    check('bad portals string refused', !!portalsFromString('1=A,1=B').problem);

    // One host check for the map, the dialogs and the export (review fix: the map drew a
    // bridge on an empty hex as valid while the export dropped it).
    const statics2 = { '83a': emptyMatrix() };
    check('a bridge needs a system', !!bridgeHostProblem({ realId: null }) && !bridgeHostProblem({ realId: '19' })
        && !!bridgeHostProblem({ realId: 'hl' }) && !!bridgeHostProblem({ realId: '83a' }, statics2));
    check('portals need a hyperlane or empty tile', !portalHostProblem({ realId: null }) && !portalHostProblem({ realId: 'hl' })
        && !portalHostProblem({ realId: '83a' }, statics2) && !!portalHostProblem({ realId: '19' }));
    check('the export agrees with the host check on an empty hex',
        !!bridgeExportInfo({ realId: null, bridge: sample }, '').problem && !!bridgeHostProblem({ realId: null }));

    // The note's text export line decodes to the same data.
    check('text: bridge row decodes', eq(hexToMatrix('108400000'), sample));
    check('text: hyperlane row decodes', eq(hexToMatrix('a80a80a80'), storedMatrixFromCustomString(ROUNDABOUT)));
}

// ── 4. Geometry ───────────────────────────────────────────────────────────────

{
    const c = { x: 0, y: 0 }, R = 172.5;
    const north = portalSlotPoint(c, R, 1);
    check('slot 1 sits between N and NE (30° clockwise of north)',
        Math.abs(north.x - 104 * Math.sin(Math.PI / 6)) < 1e-6 && Math.abs(north.y + 104 * Math.cos(Math.PI / 6)) < 1e-6,
        JSON.stringify(north));
    check('slot 0 is the centre', portalSlotPoint(c, R, 0).x === 0 && portalSlotPoint(c, R, 0).y === 0);
    check('ring token radius 21 bot px', Math.abs(portalSlotPoint(c, R, 3).r - 21) < 1e-9);
    const mid = rimMid(c, 0, R);
    // The bot's 300 px tile height rounds the apothem (R·√3/2 = 149.4) up to 150.
    const apothem = R * Math.sqrt(3) / 2;
    check('rim midpoint N is 8/150 of the apothem inside the edge',
        Math.abs(mid.y + apothem * 142 / 150) < 1e-6 && Math.abs(mid.x) < 1e-6, JSON.stringify(mid));
    const trail = bridgeTrail(c, R, 1, 2, [1]);
    check('a one-gap trail turns one corner', trail.corners.length === 1 && trail.ends.length === 2);
    check('trail path starts on the edge', trail.d.startsWith('M'));
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\ntest-bridges-portals: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.error('\nFailures:\n' + failures.map(f => `  ✗ ${f}`).join('\n') + '\n');
    process.exit(1);
}
