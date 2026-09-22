/**
 * The click handler's routing, and the rule that keeps it safe.
 *
 *   node tools/test-hex-modes.js      (or: npm test)
 *
 * This guards one bug, which is worth a file of its own because of what it cost: with no
 * tool armed, clicking a hex destroyed it.
 *
 * The editor booted in 'hyperlane' mode and had no idle state. Disarming a tool called
 * setMode('none'), and every branch in uiEvents that did not claim 'none' fell through to
 * the paint branch at the bottom — which snapshots the hex for undo, clears it, and calls
 * setSectorType. 'none' has no entry in sectorColors, so the hex was filled with the blank
 * default. A map could be quietly eaten one click at a time by a tool that was not there.
 *
 * The fix routes anything that is not a paint mode to selection instead, and it decides
 * that by asking sectorColors rather than by listing names: the paint modes ARE its keys,
 * so a mode that is not one of them cannot be painted, whatever it is called. These checks
 * hold both halves of that — the data invariant, and the routing that depends on it.
 *
 * uiEvents touches the DOM through hexSelection, so the few calls it makes are stubbed
 * below rather than pulling in a DOM implementation the project does not install.
 */

import { sectorColors } from '../src/constants/constants.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// ── The data invariant the guard rests on ─────────────────────────────────────

for (const idle of ['select', 'none']) {
    check(`'${idle}' is not a paint type`, !(idle in sectorColors),
        `sectorColors has a '${idle}' entry, so the guard would let it paint`);
}

// The blank entry is what 'none' used to be painted with. It stays in the table because
// sectorColors[''] is the fallback fill for an unpainted hex, but nothing may route to it
// from a click.
check("the blank fill still exists for unpainted hexes", '' in sectorColors);

for (const mode of ['1 planet', '2 planet', '3 planet', 'empty', 'special', 'nebula',
    'rift', 'asteroid', 'supernova', 'homesystem', 'void', 'hyperlane']) {
    check(`'${mode}' is a paint type`, mode in sectorColors,
        `the rail offers it, so a click on it must still paint`);
}

// ── The routing ───────────────────────────────────────────────────────────────

// Enough DOM for hexSelection's ring and its CustomEvent, and no more.
const noop = () => {};
const fakeNode = () => ({
    id: '', style: {}, setAttribute: noop, appendChild: noop, remove: noop,
    querySelector: () => null,
});
globalThis.document = {
    createElementNS: fakeNode,
    dispatchEvent: noop,
    getElementById: () => null,
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

const { registerClickHandler } = await import('../src/ui/uiEvents.js');

/** An editor that records what was done to it instead of doing it. */
function makeEditor(mode) {
    const calls = [];
    const editor = {
        mode,
        hexes: { '101': { label: '101', baseType: '2 planet', realId: '19', center: { x: 0, y: 0 } } },
        svg: { querySelector: () => null, appendChild: noop },
        hexRadius: 40,
        saveState: (label) => calls.push(['saveState', label]),
        clearAll: (label) => calls.push(['clearAll', label]),
        setSectorType: (label, type) => calls.push(['setSectorType', label, type]),
        applyEffect: (label, eff) => calls.push(['applyEffect', label, eff]),
        toggleWormholeOnHex: (label, w) => calls.push(['toggleWormhole', label, w]),
        calls,
    };
    registerClickHandler(editor);
    return editor;
}

// Idle modes must touch nothing. 'select' is the default the editor boots in, 'none' is
// what every tool calls to disarm, and '' is what the value-hint panel releases the map
// with. All three reached the paint branch before.
for (const idle of ['select', 'none', '', undefined]) {
    const editor = makeEditor(idle);
    editor._onHexClick({}, '101');
    check(`mode ${JSON.stringify(idle)} makes no edit`, editor.calls.length === 0,
        JSON.stringify(editor.calls));
    check(`mode ${JSON.stringify(idle)} selects the hex instead`,
        editor.selectedHexLabel === '101', String(editor.selectedHexLabel));
}

// A mode nobody has heard of is not a licence to paint.
{
    const editor = makeEditor('definitely-not-a-tool');
    editor._onHexClick({}, '101');
    check('an unknown mode makes no edit', editor.calls.length === 0, JSON.stringify(editor.calls));
}

// And the real paint modes still paint.
{
    const editor = makeEditor('2 planet');
    editor._onHexClick({}, '101');
    const did = editor.calls.map(c => c[0]);
    check('a paint mode still saves history', did.includes('saveState'), JSON.stringify(editor.calls));
    check('a paint mode still sets the sector type',
        editor.calls.some(c => c[0] === 'setSectorType' && c[2] === '2 planet'),
        JSON.stringify(editor.calls));
    check('a paint mode does not select', !editor.selectedHexLabel, String(editor.selectedHexLabel));
}

{
    const editor = makeEditor('nebula');
    editor._onHexClick({}, '101');
    check('an effect mode still applies its effect',
        editor.calls.some(c => c[0] === 'applyEffect' && c[2] === 'nebula'),
        JSON.stringify(editor.calls));
}

// Clicking the selected hex again clears it, so the ring can be dismissed with the gesture
// that raised it.
{
    const editor = makeEditor('select');
    editor._onHexClick({}, '101');
    editor._onHexClick({}, '101');
    check('clicking the selected hex again deselects it', editor.selectedHexLabel === null,
        String(editor.selectedHexLabel));
}

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nhex modes: ${passed} checks passed, ${failures.length} failed`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
