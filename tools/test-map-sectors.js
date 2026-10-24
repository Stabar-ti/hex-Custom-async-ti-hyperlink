/**
 * Tests for map sectors: names, the bot's circle and cluster rules, the bot-native form a
 * painted sector exports as, and reading both forms back in.
 *
 *   node tools/test-map-sectors.js      (or: npm test)
 *
 * The circle and cluster rules mirror the bot's MapSegment / MapFrame. The cases here are
 * the ones its MapSegmentTest and MapSectorJsonServiceTest pin down: circles include empty
 * positions, clusters grow over placed tiles within gap + 1, a custom adjacency joins two
 * groups and a wormhole does not.
 *
 * Everything imported here is DOM-free, so it loads straight into node.
 */

import { generateRings } from '../src/draw/drawHexes.js';
import {
    normalizeSectorName, sectorNameProblem, suggestSectorName,
    sectorAdjacency, colourSectors, SECTOR_PALETTE, SECTOR_BASE_COLOURS, sectorPieces, wouldSplitSector,
    listSectors, circlePositions, clusterPositions, botEquivalent, buildSectorExport,
    applySectorImport, parseBotSectorType, maxSectorRing, sectorWarnings, sectorReports,
    isPlacedForBot, BOT_MAX_SECTORS,
} from '../src/features/mapSectors.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

/** A map of `rings` rings, every hex void, plus the four corners. */
function makeMap(rings) {
    const hexes = {};
    for (const { q, r, label } of generateRings(rings, false)) {
        hexes[label] = { label, q, r, baseType: '', matrix: Array.from({ length: 6 }, () => Array(6).fill(0)) };
    }
    for (const c of ['TL', 'TR', 'BL', 'BR']) hexes[c] = { label: c, q: null, r: null, baseType: '' };
    return hexes;
}

/** Put a real system on each label. */
function place(hexes, ...labels) {
    for (const l of labels) hexes[l].realId = '19';
    return hexes;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. Names ─────────────────────────────────────────────────────────────────

{
    check('typed names are normalised to the bot form', normalizeSectorName('  Outer Rim_2! ') === 'outer-rim-2');
    check('names are cut to 20 characters', normalizeSectorName('a'.repeat(30)).length === 20);
    check('a valid name has no problem', sectorNameProblem('core') === null);
    check('an empty name is a problem', !!sectorNameProblem(''));
    check('uppercase is a problem', !!sectorNameProblem('Core'));
    check('main is reserved', !!sectorNameProblem('main'));
    check('fracture is reserved', !!sectorNameProblem('fracture'));
    check('board-a is reserved', !!sectorNameProblem('board-a'));
    check('board-h is not', sectorNameProblem('board-h') === null);
    check('suggestions start with the bot list', suggestSectorName([]) === 'andromeda');
    check('and skip names in use', suggestSectorName(['andromeda']) === 'antlia');
}

// ── 1b. Colours ──────────────────────────────────────────────────────────────

{
    check('the palette has no repeats', new Set(SECTOR_PALETTE).size === SECTOR_PALETTE.length);

    // Seven sectors around a middle one: the middle touches all six, each touches its two
    // neighbours in the ring — a wheel, which needs exactly four colours.
    const hexes = makeMap(2);
    hexes['000'].mapSector = 'hub';
    ['101', '102', '103', '104', '105', '106'].forEach((l, i) => { hexes[l].mapSector = 'spoke' + i; });
    const touching = sectorAdjacency(hexes);
    check('sectors that share an edge touch', touching.get('hub')?.size === 6 && touching.get('spoke0')?.has('spoke1'));
    check('sectors that do not, do not', !touching.get('spoke0')?.has('spoke3'));

    const colour = colourSectors([...touching.keys()], touching);
    const clash = [...touching].some(([a, ns]) => [...ns].some(b => colour[a] === colour[b]));
    check('no two touching sectors share a colour', !clash, JSON.stringify(colour));
    check('four colours are enough', Math.max(...Object.values(colour)) < SECTOR_BASE_COLOURS);

    // A sector painted next to the others keeps theirs where it can.
    hexes['201'].mapSector = 'new';
    const again = colourSectors([...sectorAdjacency(hexes).keys()], sectorAdjacency(hexes), colour);
    const kept = Object.keys(colour).filter(n => again[n] === colour[n]).length;
    check('adding a sector leaves the others their colours', kept === Object.keys(colour).length, JSON.stringify(again));

    // Five sectors all touching each other cannot be done in four (only possible with
    // sectors painted in separate pieces): a fifth colour, still no clash.
    const k5 = new Map(['a', 'b', 'c', 'd', 'e'].map(n => [n, new Set(['a', 'b', 'c', 'd', 'e'].filter(m => m !== n))]));
    const five = colourSectors(k5.keys(), k5);
    check('a map that needs five gets five', new Set(Object.values(five)).size === 5);

    const lonely = colourSectors(['solo'], new Map());
    check('a sector with no neighbours gets the first colour', lonely.solo === 0);
}

// ── 1c. One connected region ─────────────────────────────────────────────────

{
    const hexes = makeMap(3);
    const paint = (name, ...labels) => labels.forEach(l => { hexes[l].mapSector = name; });

    check('touching hexes are one piece', sectorPieces(hexes, ['000', '101', '102']).length === 1);
    check('hexes across a gap are two', sectorPieces(hexes, ['000', '301']).length === 2);

    check('the first hex of a new sector is fine anywhere', wouldSplitSector(hexes, ['301'], 'new') === null);
    paint('core', '000', '101', '102');
    check('a hex touching the sector may join', wouldSplitSector(hexes, ['103'], 'core') === null);
    check('a hex away from it may not', wouldSplitSector(hexes, ['301'], 'core')?.name === 'core');
    check('nor a selection in two groups', wouldSplitSector(hexes, ['104', '305'], 'new')?.pieces === 2);

    // 101 holds 000 and 201 together.
    paint('core', '201');
    check('erasing the end of a sector is fine', wouldSplitSector(hexes, ['201'], null) === null);
    check('erasing the hex that holds it together is not', wouldSplitSector(hexes, ['101'], null)?.name === 'core');
    check('nor painting it into another sector', wouldSplitSector(hexes, ['101'], 'rim')?.name === 'core');

    paint('rim', '304', '305');
    check('merging two sectors that do not touch is refused', wouldSplitSector(hexes, ['304', '305'], 'core')?.name === 'core');

    // An imported sector already in two pieces: it may not get worse, but it may be fixed.
    const split = makeMap(3);
    split['000'].mapSector = 'old';
    split['201'].mapSector = 'old';
    check('a split sector may be joined up', wouldSplitSector(split, ['101'], 'old') === null);
    check('or grown from one of its pieces', wouldSplitSector(split, ['102'], 'old') === null);
    check('but not given a third piece', wouldSplitSector(split, ['304'], 'old')?.pieces === 3);
    const flagged = sectorWarnings(sectorReports(split, 0));
    check('the panel flags a split sector', flagged.some(w => w.includes('old (2 pieces)')), JSON.stringify(flagged));
}

// ── 2. Listing ───────────────────────────────────────────────────────────────

{
    const hexes = makeMap(2);
    hexes['201'].mapSector = 'rim';
    hexes['000'].mapSector = 'core';
    hexes['101'].mapSector = 'core';
    const list = listSectors(hexes);
    check('sectors are listed by name', same([...list.keys()], ['core', 'rim']));
    check('members are in position order', same(list.get('core'), ['000', '101']));
}

// ── 3. Circles ───────────────────────────────────────────────────────────────

{
    const hexes = makeMap(3);
    check('radius 0 is the centre alone', same(circlePositions(hexes, '000', 0), ['000']));
    check('radius 1 around the middle is the first ring',
        same(circlePositions(hexes, '000', 1), ['000', '101', '102', '103', '104', '105', '106']));
    check('a circle includes empty positions and never the corners',
        circlePositions(hexes, '000', 3).length === 37);
    check('a circle stops at the edge of the map', circlePositions(hexes, '301', 1).length < 7);
    check('a corner has no circle', circlePositions(hexes, 'TL', 1).length === 0);
}

// ── 4. Clusters ──────────────────────────────────────────────────────────────

{
    // Two islands: 000 + 101, and 301 two steps beyond 101 (one empty hex between).
    const hexes = place(makeMap(3), '000', '101', '301');
    check('gap 0 keeps islands apart', same(clusterPositions(hexes, '000', 0), ['000', '101']));
    check('gap 1 reaches over one empty hex', same(clusterPositions(hexes, '000', 1), ['000', '101', '301']));
    check('a cap clips the cluster', same(clusterPositions(hexes, '000', 1, 1), ['000', '101']));
    check('no tile at the centre: the centre alone', same(clusterPositions(hexes, '104', 1), ['104']));

    const linked = place(makeMap(3), '000', '304');
    check('without a link, distant tiles are separate', same(clusterPositions(linked, '000', 0), ['000']));
    linked['000'].customAdjacents = { '304': { twoWay: true } };
    check('a custom adjacency joins them', same(clusterPositions(linked, '000', 0), ['000', '304']));

    const wormholed = place(makeMap(3), '000', '304');
    wormholed['000'].customWormholes = new Set(['alpha']);
    wormholed['304'].customWormholes = new Set(['alpha']);
    check('a wormhole does not', same(clusterPositions(wormholed, '000', 0), ['000']));

    const lane = makeMap(2);
    lane['101'].matrix[0][3] = 1;
    check('a hyperlane is a placed tile', isPlacedForBot(lane['101']));
    check('a void hex is not', !isPlacedForBot(lane['102']));
    check('a home system is', isPlacedForBot({ baseType: 'homesystem' }));
}

// ── 5. The bot-native form ───────────────────────────────────────────────────

{
    const hexes = place(makeMap(3), '000', '101', '102', '103', '104', '105', '106', '301');
    const ring1 = ['000', '101', '102', '103', '104', '105', '106'];
    check('the first ring around a tile is a circle',
        same(botEquivalent(hexes, ring1, 0), { type: 'manual_circle', centre: '000', distance: 1 }));

    const voidCircle = makeMap(2);
    check('a circle centred on a void hex has no bot form',
        botEquivalent(voidCircle, circlePositions(voidCircle, '000', 1), 0) === null);

    const half = place(makeMap(2), '000', '101', '102');
    check('an island of tiles that is not a circle is a cluster',
        same(botEquivalent(half, ['000', '101', '102'], 0), { type: 'manual_auto', centre: '000', distance: 0 }));

    const notConnected = place(makeMap(3), '000', '301');
    check('two separate tiles at gap 0 have no bot form',
        botEquivalent(notConnected, ['000', '301'], 0) === null);
    check('but at gap 2 (reach 3) they are a cluster',
        botEquivalent(notConnected, ['000', '301'], 2)?.type === 'manual_auto');

    const partOfIsland = place(makeMap(3), '000', '101', '102', '201');
    check('part of an island is a capped cluster when the cap cuts it exactly',
        same(botEquivalent(partOfIsland, ['000', '101', '102'], 0), { type: 'manual_auto', centre: '000', distance: 1 }));

    const withVoid = place(makeMap(2), '000', '101');
    check('a void hex rules out a cluster', botEquivalent(withVoid, ['000', '101', '102'], 0) === null);
}

// ── 6. Export ────────────────────────────────────────────────────────────────

{
    const hexes = place(makeMap(3), '000', '101', '102', '103', '104', '105', '106', '301', '302');
    for (const l of circlePositions(hexes, '000', 1)) hexes[l].mapSector = 'core';
    hexes['301'].mapSector = 'rim';
    hexes['302'].mapSector = 'rim';
    hexes['303'].mapSector = 'rim';   // void
    const out = buildSectorExport(hexes, 0);
    check('every sector is in the list', same(out.sectors.map(s => s.name), ['core', 'rim']));
    check('void members are listed', out.sectors[1].positions.includes('303'));
    check('the circle gets the bot field on its centre',
        same(out.native.get('000'), { type: 'manual_circle', distance: 1, name: 'core' }));
    check('the editor-only sector gets none', out.native.size === 1);

    const warnings = sectorWarnings(sectorReports(hexes, 0));
    check('the panel says one sector is editor-only', warnings.some(w => /1 sector is not/.test(w)));

    const many = makeMap(5);
    let i = 0;
    for (const [label, hex] of Object.entries(many)) {
        if (!hex.q && hex.q !== 0) continue;
        if (i > BOT_MAX_SECTORS + 2) break;
        hex.realId = '19';
        hex.mapSector = `s${i++}`;
        void label;
    }
    check(`no more than ${BOT_MAX_SECTORS} bot sectors are written`,
        buildSectorExport(many, 0).native.size === BOT_MAX_SECTORS);
}

// ── 7. Import ────────────────────────────────────────────────────────────────

{
    check('bot type aliases are read', parseBotSectorType('Circle') === 'manual_circle'
        && parseBotSectorType('cluster') === 'manual_auto' && parseBotSectorType(' auto ') === 'automatic');

    // The bot's own test payload (MapSectorJsonServiceTest.sectorFieldsAreReadFromTheJsonText).
    const hexes = place(makeMap(2), '000', '101');
    const res = applySectorImport(hexes, {
        sectorGap: 1,
        mapInfo: [
            { position: '000', tileID: '19', sector: { type: 'manual_circle', distance: 1, name: 'core' } },
            { position: '101', tileID: '19' },
        ],
    });
    check('a bot circle is expanded over its positions', listSectors(hexes).get('core')?.length === 7);
    check('the gap is read', res.gap === 1);

    const list = place(makeMap(3), '000');
    list['000'].mapSector = 'stale';
    applySectorImport(list, {
        sectors: [{ name: 'core', positions: ['000', '101'] }, { name: 'rim', positions: ['101', '301', 'tl', '999'] }],
        mapInfo: [{ position: '000', tileID: '19', sector: { type: 'manual_circle', distance: 2, name: 'ignored' } }],
    });
    const got = listSectors(list);
    check('the explicit list wins over bot fields', !got.has('ignored'));
    check('old sectors are cleared', !got.has('stale'));
    check('an overlap keeps the first sector', list['101'].mapSector === 'core');
    check('a corner cannot join', !list.TL.mapSector);
    check('the rest of the second sector is kept', same(got.get('rim'), ['301']));

    const auto = makeMap(1);
    const autoRes = applySectorImport(auto, { mapInfo: [{ position: '000', tileID: '19', sector: { type: 'automatic', distance: 1 } }] });
    check('automatic sectors are skipped with a warning', autoRes.warnings.some(w => /Automatic/.test(w)));

    check('the ring of sector positions is measured', maxSectorRing({ sectors: [{ name: 'a', positions: ['000', '512', '1001'] }] }) === 10);
}

// ── Report ───────────────────────────────────────────────────────────────────

if (failures.length) {
    console.error(`map sectors: ${failures.length} failed, ${passed} passed`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
}
console.log(`map sectors: all ${passed} checks passed`);
