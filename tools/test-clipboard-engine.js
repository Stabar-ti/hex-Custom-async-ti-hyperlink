/**
 * The tile engine behind copy, cut and paste.
 *
 *   node tools/test-clipboard-engine.js      (or: npm test)
 *
 * captureTile, rotateTiles and applyTiles were three closures inside
 * startCopyPasteWizard, reachable only by driving that wizard's popup flow from end to
 * end, and so never tested. They were lifted out verbatim — the extraction asserted
 * character-identity against the original, so nothing here is describing new behaviour.
 * It is describing behaviour that has always been there and had nothing holding it.
 *
 * What is worth pinning is what a rewrite would silently lose: that a rotated block takes
 * its hyperlane matrices and its edge-indexed data round with it, that a hyperlane tile's
 * realID designator is rebuilt rather than left pointing at the old orientation, and that
 * a bidirectional border anomaly moves its mirror on the neighbouring hex.
 *
 * The engine touches the DOM only to draw wormhole icons, so the few calls it makes are
 * stubbed rather than pulling in a DOM implementation the project does not install.
 */

// ── DOM, enough for the wormhole overlay path ────────────────────────────────
const noop = () => {};
const fakeEl = () => ({
    style: {}, dataset: {}, childNodes: [],
    setAttribute: noop, setAttributeNS: noop, getAttribute: () => null,
    appendChild: noop, append: noop, remove: noop, removeChild: noop,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, classList: { add: noop, remove: noop, contains: () => false },
});
globalThis.document = {
    createElementNS: fakeEl,
    createElement: fakeEl,
    getElementById: () => null,
    addEventListener: noop,
    dispatchEvent: noop,
};
globalThis.window = { addEventListener: noop, tileCopyOptions: undefined };
// drawMatrixLinks escapes a label for a selector; the engine calls it on every paste.
globalThis.CSS = { escape: (s) => String(s) };

const {
    captureTile, captureTiles, rotateTiles, applyTiles, pasteTargets, isEmptyHex,
} = await import('../src/features/tileClipboardEngine.js');
const { rotated } = await import('../src/modules/Hyperlanes/hyperlaneModel.js');

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── A map small enough to reason about ───────────────────────────────────────

const zeros = () => Array.from({ length: 6 }, () => Array(6).fill(0));

/** Axial positions for a 7-hex flower, centre first. */
const RING = [
    { label: '000', q: 0, r: 0 },
    { label: '101', q: 0, r: -1 },
    { label: '102', q: 1, r: -1 },
    { label: '103', q: 1, r: 0 },
    { label: '104', q: 0, r: 1 },
    { label: '105', q: -1, r: 1 },
    { label: '106', q: -1, r: 0 },
];

function makeEditor(overrides = {}) {
    const hexes = {};
    for (const { label, q, r } of RING) {
        hexes[label] = {
            label, q, r,
            center: { x: q * 70, y: r * 60 },
            baseType: '', realId: null, planets: [],
            effects: new Set(), wormholes: new Set(),
            customWormholes: new Set(), inherentWormholes: new Set(),
            matrix: zeros(), links: zeros(),
            systemTokens: [], planetTokens: {},
            overlays: [], wormholeOverlays: [],
            polygon: fakeEl(),
        };
    }

    const calls = [];
    const editor = {
        hexes,
        calls,
        effectIconPositions: [{ dx: 0, dy: 0 }, { dx: 5, dy: 5 }],
        svg: fakeEl(),
        sectorIDLookup: {
            '19': { id: '19', name: 'Wellon', planets: [{ name: 'Wellon', resources: 1, influence: 2 }] },
            '40': { id: '40', name: 'Nebula', planets: [], isNebula: true },
            '83A': { id: '83A', name: 'Hyperlane', isHyperlane: true, matrix: zeros() },
            '83A60': { id: '83A60', name: 'Hyperlane 60', isHyperlane: true, matrix: zeros() },
        },
        hyperlaneMatrices: {},
        saveState: (l) => calls.push(['saveState', l]),
        clearAll: (l) => { calls.push(['clearAll', l]); },
        deleteAllSegments: (l) => {
            calls.push(['deleteAllSegments', l]);
            // The real one zeroes the matrix in place, which the apply path relies on.
            const h = hexes[l];
            if (h) { h.matrix = zeros(); h.links = h.matrix; }
        },
        applyEffect: (l, eff) => { calls.push(['applyEffect', l, eff]); hexes[l]?.effects.add(eff); },
        setSectorType: (l, t) => { calls.push(['setSectorType', l, t]); if (hexes[l]) hexes[l].baseType = t; },
        ...overrides,
    };
    return editor;
}

// ── capture ──────────────────────────────────────────────────────────────────

{
    const editor = makeEditor();
    const hex = editor.hexes['101'];
    hex.realId = '19';
    hex.effects = new Set(['nebula']);
    hex.customWormholes = new Set(['alpha']);
    hex.systemTokens = ['tok1'];
    hex.planetTokens = { 0: ['tok2'] };
    hex.borderAnomalies = { 2: { type: 'SPATIALTEAR' } };

    const t = captureTile(editor, '101');
    check('a realID hex captures as type realID', t.type === 'realID', t.type);
    check('it keeps the tile id', t.realId === '19', t.realId);
    check('it keeps its position', t.q === 0 && t.r === -1, `${t.q},${t.r}`);
    check('effects come across as an array', eq(t.effects, ['nebula']), JSON.stringify(t.effects));
    check('custom wormholes come across', eq(t.customWormholes, ['alpha']), JSON.stringify(t.customWormholes));
    check('tokens come across', eq(t.systemTokens, ['tok1']) && eq(t.planetTokens, { 0: ['tok2'] }),
        JSON.stringify([t.systemTokens, t.planetTokens]));
    check('border anomalies come across', !!t.borderAnomalies?.['2'], JSON.stringify(t.borderAnomalies));

    // The capture must be a snapshot, not a view: editing the map afterwards must not
    // change what is on the clipboard.
    hex.effects.add('rift');
    hex.systemTokens.push('tok3');
    check('the capture is a deep copy, not a live view',
        eq(t.effects, ['nebula']) && eq(t.systemTokens, ['tok1']),
        JSON.stringify([t.effects, t.systemTokens]));
}

{
    const editor = makeEditor();
    editor.hexes['102'].baseType = '2 planet';
    const t = captureTile(editor, '102');
    check('a painted hex captures as type baseType', t.type === 'baseType', t.type);
    check('and keeps the painted type', t.baseType === '2 planet', t.baseType);
}

{
    const editor = makeEditor();
    const hex = editor.hexes['103'];
    hex.matrix = zeros();
    hex.matrix[0][3] = 1;
    hex.matrix[3][0] = 1;
    const t = captureTile(editor, '103');
    check('a hex with only hyperlane links captures as type hyperlane', t.type === 'hyperlane', t.type);
    check('and carries its matrix', t.matrix[0][3] === 1, JSON.stringify(t.matrix[0]));
}

{
    const editor = makeEditor();
    const t = captureTile(editor, '104');
    check('an untouched hex captures as type empty', t.type === 'empty', t.type);
    check('a hex that does not exist captures as null', captureTile(editor, 'nope') === null);
    check('captureTiles keeps the order it was given',
        eq(captureTiles(editor, ['102', '101']).map(x => x.label), ['102', '101']));
}

// ── rotate ───────────────────────────────────────────────────────────────────

{
    const editor = makeEditor();
    // One ring of six around the centre; a 60 degree turn maps each onto the next.
    const tiles = captureTiles(editor, ['101', '102', '103', '104', '105', '106']);
    const origin = { q: 0, r: 0 };
    const before = tiles.map(t => `${t.q},${t.r}`);

    rotateTiles(editor, tiles, origin, 1);
    const after = tiles.map(t => `${t.q},${t.r}`);
    check('a rotated ring lands back on the same six hexes',
        eq([...after].sort(), [...before].sort()), JSON.stringify(after));
    check('but not in the same places', !eq(after, before), JSON.stringify(after));

    // Six turns is the identity.
    for (let i = 0; i < 5; i++) rotateTiles(editor, tiles, origin, 1);
    check('six turns of 60 degrees is where it started', eq(tiles.map(t => `${t.q},${t.r}`), before),
        JSON.stringify(tiles.map(t => `${t.q},${t.r}`)));
}

{
    const editor = makeEditor();
    const hex = editor.hexes['101'];
    hex.matrix = zeros();
    hex.matrix[0][3] = 1;
    hex.matrix[3][0] = 1;
    const tiles = captureTiles(editor, ['101']);
    const expected = rotated(JSON.parse(JSON.stringify(hex.matrix)), 1);

    rotateTiles(editor, tiles, { q: 0, r: -1 }, 1);
    check('the hyperlane matrix turns with the block, the same way hyperlaneModel turns it',
        eq(tiles[0].matrix, expected), JSON.stringify(tiles[0].matrix));
}

{
    const editor = makeEditor();
    editor.hexes['101'].realId = '19';
    editor.hexes['101'].borderAnomalies = { 0: { type: 'SPATIALTEAR' } };
    const tiles = captureTiles(editor, ['101']);
    rotateTiles(editor, tiles, { q: 0, r: -1 }, 1);
    check('an edge-indexed border anomaly moves round one side',
        !!tiles[0].borderAnomalies['1'], JSON.stringify(tiles[0].borderAnomalies));
}

{
    // A hyperlane tile whose realID encodes its own orientation must have that designator
    // rebuilt, or the tile would be drawn in the new place at the old angle.
    const editor = makeEditor();
    const hex = editor.hexes['101'];
    hex.realId = '83A';
    hex.matrix = zeros();
    hex.matrix[0][3] = 1;
    const tiles = captureTiles(editor, ['101']);
    rotateTiles(editor, tiles, { q: 0, r: -1 }, 1);
    check('a hyperlane realID is rebuilt for its new orientation',
        tiles[0].realId !== '83A' && /60/.test(String(tiles[0].realId)), String(tiles[0].realId));
}

// ── apply ────────────────────────────────────────────────────────────────────

{
    const editor = makeEditor();
    const src = editor.hexes['101'];
    src.realId = '19';
    src.effects = new Set(['nebula']);
    src.customWormholes = new Set(['alpha']);
    src.systemTokens = ['tok1'];
    src.systemLore = { text: 'hello' };

    const tiles = captureTiles(editor, ['101']);
    // 101 is at (0,-1); 103 is at (1,0). Offset (+1,+1).
    applyTiles(editor, tiles, 1, 1);

    const dest = editor.hexes['103'];
    check('apply writes the tile id to the destination', dest.realId === '19', String(dest.realId));
    check('apply brings the planets from system info', dest.planets?.length === 1,
        JSON.stringify(dest.planets));
    check('apply restores effects', dest.effects.has('nebula'), [...dest.effects].join(','));
    check('apply restores custom wormholes', dest.customWormholes.has('alpha'),
        [...dest.customWormholes].join(','));
    check('apply restores tokens', eq(dest.systemTokens, ['tok1']), JSON.stringify(dest.systemTokens));
    check('apply restores lore', dest.systemLore?.text === 'hello', JSON.stringify(dest.systemLore));
    check('apply saves the destination for undo',
        editor.calls.some(c => c[0] === 'saveState' && c[1] === '103'),
        JSON.stringify(editor.calls.filter(c => c[0] === 'saveState')));
    check('apply leaves the source alone — the cut is the caller\'s job',
        src.realId === '19', String(src.realId));
}

{
    // A bidirectional border anomaly lives on both hexes of the edge, so pasting one has to
    // put the other half on the neighbour.
    const editor = makeEditor();
    editor.hexes['101'].realId = '19';
    editor.hexes['101'].borderAnomalies = { 3: { type: 'SPATIALTEAR' } };
    const tiles = captureTiles(editor, ['101']);

    applyTiles(editor, tiles, 0, 1);          // 101 (0,-1) -> 000 (0,0)
    const dest = editor.hexes['000'];
    check('apply moves the border anomaly with the tile',
        !!dest.borderAnomalies?.['3'], JSON.stringify(dest.borderAnomalies));
    // Side 3 of (0,0) is (0,1) = 104; its mirror sits on the opposite side, 0.
    check('and mirrors it onto the hex across that edge',
        !!editor.hexes['104'].borderAnomalies?.['0'],
        JSON.stringify(editor.hexes['104'].borderAnomalies));
}

{
    const editor = makeEditor();
    editor.hexes['101'].baseType = 'void';
    const tiles = captureTiles(editor, ['101']);
    applyTiles(editor, tiles, 0, 1);
    check('a void tile stays void through a paste', editor.hexes['000'].baseType === 'void',
        editor.hexes['000'].baseType);
}

{
    const editor = makeEditor();
    editor.hexes['101'].baseType = '2 planet';
    const tiles = captureTiles(editor, ['101']);
    applyTiles(editor, tiles, 1, 1);
    check('a painted type survives a paste', editor.hexes['103'].baseType === '2 planet',
        editor.hexes['103'].baseType);
}

// ── targets and emptiness ────────────────────────────────────────────────────

{
    const editor = makeEditor();
    const tiles = captureTiles(editor, ['101', '102']);
    check('pasteTargets names the hexes a block would land on',
        eq(pasteTargets(editor, tiles, 0, 1), ['000', '103']),
        JSON.stringify(pasteTargets(editor, tiles, 0, 1)));
    check('and skips offsets that fall off the map',
        pasteTargets(editor, tiles, 9, 9).length === 0);
}

{
    const editor = makeEditor();
    check('a fresh hex is empty', isEmptyHex(editor.hexes['101']));
    editor.hexes['101'].baseType = 'empty';
    check('a hex painted "empty" is not an empty hex', !isEmptyHex(editor.hexes['101']));
    editor.hexes['102'].matrix[0][3] = 1;
    check('a hex with hyperlane links is not empty', !isEmptyHex(editor.hexes['102']));
}

// ── report ───────────────────────────────────────────────────────────────────

console.log(`\nclipboard engine: ${passed} checks passed, ${failures.length} failed`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
