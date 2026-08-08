/**
 * Tests the "this tile no longer exists" warning on the map-string import path, run
 * against the real src/data/import.js and the real public/data/SystemInfo.json.
 *
 *   node tools/test-import-warning.js      (or: npm test)
 *
 * This matters because of the Eronous exclusion: every previously-saved map that used an
 * Eronous tile now imports against data that has never heard of it. The old behaviour was
 * to drop the id on the floor and leave a silently blank hex, which reads as data loss.
 * What is asserted here is that the id survives on the hex (so a re-export still carries
 * it) and that the user is told once, in one toast, however many tiles are affected.
 *
 * Unlike the picker modules, import.js touches the DOM, so this file stubs enough of one
 * to let it run — which is also why it lives here rather than in a browser-only check.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// ── DOM stub ──────────────────────────────────────────────────────────────────
//
// Only what import.js and uiToast.js actually reach for. Toast text is captured by
// intercepting the append into the toast stack.

const toasts = [];

function stubEl() {
    return {
        style: { cssText: '' },
        dataset: {}, children: [],
        className: '', textContent: '', type: '', title: '', id: '',
        isConnected: true,
        appendChild(c) { this.children.push(c); return c; },
        append(...c) { this.children.push(...c); },
        remove() {}, removeChild() {}, addEventListener() {},
        querySelector: () => null, querySelectorAll: () => [],
        setAttribute() {}, setAttributeNS() {},
    };
}

const doc = {
    body: stubEl(),
    head: stubEl(),
    getElementById: () => null,
    createElement: () => stubEl(),
    createElementNS: () => stubEl(),
    createTextNode: t => ({ textContent: t }),
    dispatchEvent: () => true,
    addEventListener: () => {},
};

// showToast appends the toast into a stack element it appends to <body>; hook that
// second append so the rendered text is observable.
const bodyAppend = doc.body.appendChild.bind(doc.body);
doc.body.appendChild = node => {
    node.appendChild = child => {
        node.children.push(child);
        const text = (child.children || []).map(c => c.textContent).filter(Boolean).join(' ');
        if (text) toasts.push(text);
        return child;
    };
    return bodyAppend(node);
};

globalThis.document = doc;
globalThis.CustomEvent = class { constructor(name, init) { this.type = name; this.detail = init?.detail; } };
globalThis.window = { Image: class { set src(_) {} } };
globalThis.requestAnimationFrame = fn => fn();
globalThis.alert = () => {};

// import.js logs the full id list; that is deliberate, but it is noise here.
const realWarn = console.warn;
console.warn = (msg, ...rest) => {
    if (typeof msg === 'string' && msg.startsWith('Unresolved tile IDs')) return;
    realWarn(msg, ...rest);
};
const realLog = console.log;
const quietLog = (msg, ...rest) => {
    if (typeof msg === 'string' && (msg.startsWith('redrawing') || msg.startsWith('Loaded'))) return;
    realLog(msg, ...rest);
};

// ── editor stub ───────────────────────────────────────────────────────────────

const systems = JSON.parse(
    readFileSync(join(here, '..', 'public', 'data', 'SystemInfo.json'), 'utf8')
).systems;

check('SystemInfo.json loaded', Array.isArray(systems) && systems.length > 500,
    `got ${systems?.length}`);

const lookup = {};
for (const sys of systems) {
    lookup[sys.id.toUpperCase()] = sys;
    for (const alias of sys.aliases || []) lookup[alias.toUpperCase()] = sys;
}

function makeEditor({ withLookup = true } = {}) {
    const hexes = {};
    return {
        hexes,
        sectorIDLookup: withLookup ? lookup : {},
        hyperlaneMatrices: {},
        effectIconPositions: [{ dx: 0, dy: 0 }],
        svg: stubEl(),
        showTileImages: false,
        fillCorners: true,
        generateMap() {
            // Two rings is enough for every token string used below.
            const labels = ['000'];
            for (let ring = 1; ring <= 2; ring++) {
                for (let i = 1; i <= 6 * ring; i++) labels.push(`${ring}${String(i).padStart(2, '0')}`);
            }
            for (const id of labels) {
                hexes[id] = { center: { x: 0, y: 0 }, overlays: [], wormholeOverlays: [], effects: new Set() };
            }
        },
        setSectorType(id, type) { hexes[id].baseType = type; },
        applyEffect(id, effect) { hexes[id].effects.add(effect); },
        deleteAllSegments() {},
    };
}

const { importSectorTypes } = await import('../src/data/import.js');

function runImport(tokenString, opts) {
    toasts.length = 0;
    const editor = makeEditor(opts);
    console.log = quietLog;
    try {
        importSectorTypes(editor, tokenString);
    } finally {
        console.log = realLog;
    }
    return { editor, toast: toasts[0] || '', count: toasts.length };
}

// ── 1. Unknown ids: warn once, keep the id ────────────────────────────────────

{
    const { editor, toast, count } = runImport('18 er23 er45 er23 1 2 3');

    check('unknown ids produce exactly one toast', count === 1, `got ${count}`);
    check('the toast names every dead id', toast.includes('ER23') && toast.includes('ER45'), toast);
    check('a repeated dead id is listed once', (toast.match(/ER23/g) || []).length === 1, toast);
    check('the toast counts tiles, not hexes', toast.includes('2 tiles'), toast);

    // The point of the whole exercise: a re-export must still carry these.
    check('a dead id stays on its hex', editor.hexes['101'].realId === 'ER23',
        `got ${editor.hexes['101'].realId}`);
    check('the second dead id stays too', editor.hexes['102'].realId === 'ER45',
        `got ${editor.hexes['102'].realId}`);
    check('a dead tile classifies as empty', editor.hexes['101'].baseType === 'empty',
        `got ${editor.hexes['101'].baseType}`);

    check('known tiles are untouched', editor.hexes['000'].realId === '18',
        `got ${editor.hexes['000'].realId}`);
    check('an alias still resolves to its canonical id', editor.hexes['104'].realId === '01',
        `got ${editor.hexes['104'].realId}`);
}

// ── 2. Nothing to report stays quiet ──────────────────────────────────────────

{
    const { count, toast } = runImport('18 1 2 3 4 5 6');
    check('an all-known map shows no toast', count === 0, toast);
}

// ── 3. Placeholders are not "unknown" ─────────────────────────────────────────
//
// '-1' (blank) and 'HL' (bare hyperlane) are real entries in SystemInfo.json. They
// resolve normally, and must never be reported as missing tiles.

{
    const { count, toast } = runImport('18 -1 -1 HL 1 2 3');
    check('-1 and HL are not reported as missing', count === 0, toast);

    const { editor } = runImport('18 -1 1 2 3 4 5');
    check('-1 resolves to the blank system', editor.hexes['101'].realId === '-1',
        `got ${editor.hexes['101'].realId}`);
    check('-1 classifies as void', editor.hexes['101'].baseType === 'void',
        `got ${editor.hexes['101'].baseType}`);
}

// ── 4. A failed data load must not turn into a wall of text ───────────────────
//
// Empty sectorIDLookup means SystemInfo.json did not load. Every tile would look
// unresolved; loadSystemInfo already alerts about the real cause.

{
    const { count, toast } = runImport('18 1 2 3 4 5 6', { withLookup: false });
    check('no toast when the system lookup is empty', count === 0, toast);
}

// ── 5. Long lists are capped ──────────────────────────────────────────────────

{
    const ids = Array.from({ length: 12 }, (_, i) => `er${i + 1}`).join(' ');
    const { toast, count } = runImport(`18 ${ids}`);

    check('twelve dead tiles still produce one toast', count === 1, `got ${count}`);
    check('the toast reports the true total', toast.includes('12 tiles'), toast);
    check('the tail is collapsed into a count', toast.includes('and 4 more'), toast);
    check('at most eight ids are listed', (toast.match(/ER\d+/g) || []).length === 8, toast);
}

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nimport warning: ${passed} checks passed, ${failures.length} failed ` +
    `(${systems.length} systems)`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
