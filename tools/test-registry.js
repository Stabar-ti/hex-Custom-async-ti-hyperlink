/**
 * Tests for the module registry — the command catalogue and the exclusive map modes.
 *
 *   node tools/test-registry.js      (or: npm test)
 *
 * The registry is what replaced the window-global bus, so the properties worth pinning
 * down are the ones the old arrangement got wrong: an unknown id has to fail loudly
 * rather than silently doing nothing, a required call and an optional call have to
 * behave differently, and arming one map mode has to disarm every other one even when
 * one of them throws on the way out.
 *
 * No DOM — the registry is deliberately free of it, which is what lets this run in node.
 */

import {
    COMMANDS, provide, invoke, tryInvoke, hasCommand, listCommands,
    registerMode, activateMode, deactivateMode, deactivateModes, activeMode, listModes,
    _resetForTests
} from '../src/core/registry.js';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) { passed++; return; }
    failed++;
    console.error(`  FAIL ${label}\n    expected ${e}\n    actual   ${a}`);
}

function throws(label, fn, matcher) {
    try {
        fn();
    } catch (err) {
        if (!matcher || matcher.test(err.message)) { passed++; return; }
        failed++;
        console.error(`  FAIL ${label}\n    message did not match ${matcher}\n    actual: ${err.message}`);
        return;
    }
    failed++;
    console.error(`  FAIL ${label}\n    expected a throw, got none`);
}

// ── Catalogue ─────────────────────────────────────────────────────────────────
{
    const ids = Object.values(COMMANDS);
    check('catalogue ids are unique', ids.length, new Set(ids).size);
    check('catalogue is frozen', Object.isFrozen(COMMANDS), true);

    // Every id is namespaced `owner.verb`. Not cosmetic: the prefix is what makes it
    // possible to see at a glance which module owns a capability.
    const malformed = ids.filter(id => !/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/.test(id));
    check('every id is owner.verb', malformed, []);
}

// ── provide / invoke ──────────────────────────────────────────────────────────
{
    _resetForTests();

    check('nothing is provided to start with', listCommands(), []);
    check('hasCommand is false before provide', hasCommand(COMMANDS.showSystemPicker), false);

    let calls = [];
    provide(COMMANDS.showSystemPicker, (...args) => { calls.push(args); return 'shown'; });

    check('hasCommand is true after provide', hasCommand(COMMANDS.showSystemPicker), true);
    check('invoke returns the result', invoke(COMMANDS.showSystemPicker), 'shown');
    check('invoke forwards arguments', (calls = [], invoke(COMMANDS.showSystemPicker, 'a', 2), calls), [['a', 2]]);
    check('listCommands reports it', listCommands(), [COMMANDS.showSystemPicker]);
}

// ── The failure modes the window bus got wrong ────────────────────────────────
{
    _resetForTests();

    // A typo used to be a permanent silent no-op. Now it cannot even be registered.
    throws('provide rejects an unknown id', () => provide('picker.shwo', () => { }), /unknown command id/);
    throws('tryInvoke rejects an unknown id', () => tryInvoke(/** @type {any} */('nope.nope')), /unknown command id/);
    throws('provide rejects a non-function', () => provide(COMMANDS.showTokenPopup, /** @type {any} */(42)), /must be provided with a function/);

    // A required capability that is missing means the button the user clicked is broken;
    // that should say so rather than appear to work.
    throws('invoke throws when nothing provides the id', () => invoke(COMMANDS.showLorePopup), /before any module provided it/);

    // An optional one is allowed to be absent.
    check('tryInvoke is a no-op when absent', tryInvoke(COMMANDS.showLorePopup), undefined);

    provide(COMMANDS.showLorePopup, (x) => x * 2);
    check('tryInvoke calls through when present', tryInvoke(COMMANDS.showLorePopup, 21), 42);
}

// ── Unprovide ─────────────────────────────────────────────────────────────────
{
    _resetForTests();
    const off = provide(COMMANDS.showCustomLinks, () => 'yes');
    check('provided', hasCommand(COMMANDS.showCustomLinks), true);
    off();
    check('unprovide removes it', hasCommand(COMMANDS.showCustomLinks), false);

    // Unprovide must only remove its own registration, never a newer one that replaced it.
    const off1 = provide(COMMANDS.showCustomLinks, () => 'first');
    const realWarn = console.warn;       // replacing a provider warns on purpose; not news here
    console.warn = () => { };
    provide(COMMANDS.showCustomLinks, () => 'second');
    console.warn = realWarn;
    off1();
    check('a stale unprovide does not remove the newer implementation',
        hasCommand(COMMANDS.showCustomLinks), true);
    check('and the newer one is what runs', invoke(COMMANDS.showCustomLinks), 'second');
}

// ── Exclusive map modes ───────────────────────────────────────────────────────
{
    _resetForTests();

    const log = [];
    registerMode('lore', { deactivate: () => log.push('lore') });
    registerMode('token', { deactivate: () => log.push('token') });

    check('both modes are registered', listModes(), ['lore', 'token']);
    check('nothing is armed to start with', activeMode(), null);

    activateMode('lore');
    check('arming lore disarms token only', log, ['token']);
    check('lore is armed', activeMode(), 'lore');

    log.length = 0;
    activateMode('token');
    check('arming token disarms lore', log, ['lore']);
    check('token is armed', activeMode(), 'token');

    log.length = 0;
    deactivateModes();
    check('deactivateModes disarms everything', log.sort(), ['lore', 'token']);
    check('nothing is armed afterwards', activeMode(), null);

    throws('arming an unregistered mode throws', () => activateMode('ghost'), /is not registered/);
}

// ── A mode disarming itself ───────────────────────────────────────────────────
// The toggle buttons switch their own mode off. Calling the module's deactivate directly
// does the visible work but leaves activeMode() reporting a mode nobody is in, so the
// next button to arm something thinks it still has to disarm this one.
{
    _resetForTests();

    const log = [];
    registerMode('lore', { deactivate: () => log.push('lore') });
    registerMode('token', { deactivate: () => log.push('token') });

    activateMode('lore');
    log.length = 0;

    deactivateMode('lore');
    check('deactivateMode calls that mode only', log, ['lore']);
    check('and clears armed', activeMode(), null);

    // Disarming a mode that is not armed is legitimate — the DOM can get out of step.
    activateMode('token');
    log.length = 0;
    deactivateMode('lore');
    check('disarming an unarmed mode still calls it', log, ['lore']);
    check('and leaves the armed one alone', activeMode(), 'token');

    log.length = 0;
    deactivateMode('nonexistent');
    check('disarming an unregistered mode is a no-op', log, []);
    check('and changes nothing', activeMode(), 'token');
}

// ── A mode that throws must not strand the others ─────────────────────────────
{
    _resetForTests();

    const log = [];
    // Suppress the console.error the registry emits — the point here is that it keeps going.
    const realError = console.error;
    console.error = () => { };

    registerMode('broken', { deactivate: () => { throw new Error('boom'); } });
    registerMode('fine', { deactivate: () => log.push('fine') });

    deactivateModes();
    console.error = realError;

    check('a throwing mode does not stop the others being disarmed', log, ['fine']);
    check('and nothing is left armed', activeMode(), null);
}

// ── Unregistering a mode ──────────────────────────────────────────────────────
{
    _resetForTests();
    const off = registerMode('lore', { deactivate: () => { } });
    activateMode('lore');
    check('armed before unregister', activeMode(), 'lore');
    off();
    check('unregister clears armed', activeMode(), null);
    check('and removes the mode', listModes(), []);
}

_resetForTests();

console.log(`\nregistry: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
