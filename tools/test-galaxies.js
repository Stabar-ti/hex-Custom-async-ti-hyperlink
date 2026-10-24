/**
 * Tests for galaxies: board labels, the far-apart coordinates that keep boards from
 * touching, reading the boards a file uses, the layout, galaxy names, and sectors staying
 * inside one galaxy.
 *
 *   node tools/test-galaxies.js      (or: npm test)
 *
 * The rules mirror the bot's BoardPosition and GalaxyNames: positions a000 … g848, at most
 * 8 rings, hex adjacency never crossing boards, the bot's own name rules.
 *
 * Everything imported here is DOM-free, so it loads straight into node.
 */

import { generateRings } from '../src/draw/drawHexes.js';
import {
    boardOf, localLabel, ringOfLabel, boardQOffset, buildCoordIndex, neighborLabel, axialDistance,
    MAX_BOARD_RINGS,
} from '../src/utils/hexGrid.js';
import {
    galaxyId, galaxyNameProblem, galaxyNameRisk, cleanGalaxyNames, boardRingsFrom, boardOriginsX,
    nextFreeBoard,
} from '../src/features/galaxyModel.js';
import { circlePositions, clusterPositions } from '../src/features/mapSectors.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A main map of `mainRings` and boards `{a: rings}`, laid out as galaxies.js does. */
function makeMap(mainRings, boards = {}) {
    const hexes = {};
    const add = (board, rings) => {
        for (const { q, r, label } of generateRings(rings, false)) {
            const full = board + label;
            hexes[full] = { label: full, q: q + boardQOffset(board), r, board, baseType: '',
                matrix: Array.from({ length: 6 }, () => Array(6).fill(0)) };
        }
    };
    add('', mainRings);
    for (const [b, n] of Object.entries(boards)) add(b, n);
    return hexes;
}

// ── 1. Labels ────────────────────────────────────────────────────────────────

{
    check('a board label names its board', boardOf('a401') === 'a' && boardOf('g848') === 'g');
    check('a main label has no board', boardOf('401') === '' && boardOf('1203') === '');
    check('corners have no board', boardOf('TL') === '');
    check('the local position drops the letter', localLabel('b205') === '205' && localLabel('205') === '205');
    check('rings are read from labels', ringOfLabel('000') === 0 && ringOfLabel('a401') === 4 && ringOfLabel('1203') === 12);
    check('a corner has no ring', ringOfLabel('TL') === null);
    check('the main board is not shifted', boardQOffset('') === 0);
    check('boards are shifted apart', boardQOffset('a') > 0 && boardQOffset('b') > boardQOffset('a'));
    check('the bot caps boards at 8 rings', MAX_BOARD_RINGS === 8);
}

// ── 2. Boards never touch ────────────────────────────────────────────────────

{
    const hexes = makeMap(15, { a: 8, b: 8 });
    const index = buildCoordIndex(hexes);
    check('no two hexes share a coordinate', index.size === Object.keys(hexes).length);

    const around = l => [0, 1, 2, 3, 4, 5].map(s => neighborLabel(index, hexes[l], s)).filter(Boolean);
    check('a board hex neighbours only its own board', around('a101').every(l => boardOf(l) === 'a'));
    check('the main map\'s edge does not reach a board', around('1501').every(l => boardOf(l) === ''));
    check('a board\'s edge does not reach the next', around('a801').every(l => boardOf(l) === 'a'));

    // As far as a sector radius reaches, nothing on another board is in range.
    const closest = Math.min(...Object.values(hexes).filter(h => h.board === 'a')
        .map(h => Math.min(...Object.values(hexes).filter(o => o.board !== 'a').map(o => axialDistance(h, o)))));
    check('every board is more than a sector circle away from the others', closest > 9, String(closest));
}

// ── 3. Which boards a file uses ──────────────────────────────────────────────

{
    check('boards come from positions, sized to the furthest',
        same(boardRingsFrom(['000', '101', 'a000', 'a302', 'c101']), { a: 3, c: 1 }));
    check('a board with only its centre still has a ring', same(boardRingsFrom(['b000']), { b: 1 }));
    check('a saved record can make a board bigger', same(boardRingsFrom(['a101'], { a: 5 }), { a: 5 }));
    check('but never past the bot\'s cap', same(boardRingsFrom([], { a: 12 }), { a: 8 }));
    check('unknown boards are ignored', same(boardRingsFrom([], { h: 3, main: 2 }), {}));
    check('the next free board is the first unused letter', nextFreeBoard({ a: {}, c: {} }) === 'b');
    check('none once all seven are in use',
        nextFreeBoard(Object.fromEntries('abcdefg'.split('').map(b => [b, {}]))) === null);
}

// ── 4. Layout ────────────────────────────────────────────────────────────────

{
    const R = 40;
    const origins = boardOriginsX({ b: 2, a: 3 }, 1000, R);
    check('boards are laid out in letter order', origins.a < origins.b);
    check('the first board clears the main map', origins.a - (3 * 1.5 * R + R) > 1000);
    check('boards do not overlap', origins.b - (2 * 1.5 * R + R) > origins.a + (3 * 1.5 * R + R));
    const roomy = boardOriginsX({ a: 8, b: 1 }, 1000, R);
    check('a bigger board pushes the next one further out', roomy.b > origins.b);
}

// ── 5. Names ─────────────────────────────────────────────────────────────────

{
    check('main is the main board\'s id', galaxyId('') === 'main' && galaxyId('a') === 'a');
    check('no name is fine: the bot names it', galaxyNameProblem('', 'a', {}) === null);
    check('a slug is fine', galaxyNameProblem('frontier', 'a', {}) === null);
    check('uppercase is not', !!galaxyNameProblem('Frontier', 'a', {}));
    check('reserved names are not', !!galaxyNameProblem('board-b', 'a', {}));
    check('two galaxies cannot share a name', !!galaxyNameProblem('frontier', 'b', { a: 'frontier' }));
    check('but a galaxy keeps its own', galaxyNameProblem('frontier', 'a', { a: 'frontier' }) === null);
    check('a name from the bot\'s automatic list is risky', !!galaxyNameRisk('whirlpool', 'a'));
    check('milky-way is safe on main', galaxyNameRisk('milky-way', 'main') === null);
    check('but not elsewhere', !!galaxyNameRisk('milky-way', 'b'));
    check('a name outside the list is safe', galaxyNameRisk('frontier', 'a') === null);
    check('imported names are cleaned',
        same(cleanGalaxyNames({ MAIN: 'Home Base', a: 'frontier', h: 'x', b: 'frontier', c: '' }),
            { main: 'home-base', a: 'frontier' }));
}

// ── 6. Sectors stay inside one galaxy ────────────────────────────────────────

{
    const hexes = makeMap(2, { a: 2 });
    for (const l of ['000', 'a000', 'a101']) hexes[l].realId = '19';
    check('a circle on a board stays on it', circlePositions(hexes, 'a000', 9).every(l => boardOf(l) === 'a'));
    check('and covers the board', circlePositions(hexes, 'a000', 2).length === 19);

    hexes['000'].customAdjacents = { a000: { twoWay: true } };
    hexes.a000.customAdjacents = { '000': { twoWay: true } };
    check('a custom link does not carry a cluster into another galaxy',
        same(clusterPositions(hexes, '000', 2), ['000']));
    check('a cluster grows within its own galaxy', same(clusterPositions(hexes, 'a000', 0), ['a000', 'a101']));
}

// ── Report ───────────────────────────────────────────────────────────────────

if (failures.length) {
    console.error(`galaxies: ${failures.length} failed, ${passed} passed`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
}
console.log(`galaxies: all ${passed} checks passed`);
