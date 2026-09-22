// @ts-check
/**
 * How one feature reaches another without going through `window`.
 *
 * The problem this replaces
 * ────────────────────────
 * Modules used to publish their entry points as window globals and call each other by
 * guessing the name:
 *
 *     // in the module that owns the popup
 *     window.showCustomLinksPopup = showCustomLinksPopup;
 *
 *     // in some other module, hoping it loaded first
 *     if (typeof window.showCustomLinksPopup === 'function') {
 *       window.showCustomLinksPopup();
 *     }
 *
 * Three things are wrong with that. The `typeof` dance is at every call site because the
 * caller genuinely cannot know whether the other module installed yet. A typo in the name
 * is silently a no-op, forever. And nothing anywhere lists what a module offers, so the
 * only way to find the seam between two features is to grep for a string.
 *
 * What replaces it
 * ────────────────
 * A module publishes a capability once, under an id from the COMMANDS catalogue below:
 *
 *     provide(COMMANDS.showCustomLinks, showCustomLinksPopup);
 *
 * and anyone calls it:
 *
 *     invoke(COMMANDS.showCustomLinks);          // must exist — throws if it does not
 *     tryInvoke(COMMANDS.showTokenPopup, label); // optional — no-op if absent
 *
 * The catalogue is the point. It is the one place that says what crosses a module
 * boundary, ids are checked so a typo throws instead of silently doing nothing, and
 * `invoke` vs `tryInvoke` makes "this must be here" and "this might not be" a decision
 * the caller states rather than an accident of how the check was written.
 *
 * Exclusive map modes
 * ───────────────────
 * Separately: several features arm a mode that takes over map clicks — picking a hex for
 * lore, placing a token. Only one can be armed at a time, so every toolbar button that
 * arms one first has to disarm the others. That used to be a copy-pasted block repeated
 * seven times in uisectorControls.js. Modes register their own disarm here instead, and
 * a button that opens something else calls `deactivateModes()` once.
 *
 * Not in scope
 * ────────────
 * `window.editor` stays. It is one object, it is deliberate, and having the live editor
 * on the console is worth keeping. See types/globals.d.ts.
 *
 * No DOM at module scope — this imports cleanly under node so it can be tested.
 */

// ── Command catalogue ─────────────────────────────────────────────────────────
/**
 * Every capability one module exposes to another. Add an entry here first; `provide`
 * and `invoke` reject ids that are not in this list.
 *
 * Entries are grouped by the module that provides them.
 */
export const COMMANDS = Object.freeze({
    // SystemPicker
    showSystemPicker:          'picker.show',
    toggleSystemPicker:        'picker.toggle',

    // Token
    showTokenPopup:            'token.showPopup',

    // Lore
    showLorePopup:             'lore.showPopup',
    openLoreEditor:            'lore.openEditor',
    openLorePopupAtPhase:      'lore.openPopupAtPhase',

    // Custom adjacency links
    showCustomLinks:           'customLinks.show',

    // Border anomalies
    showBorderAnomalies:       'borderAnomalies.show',
    showBorderAnomalySettings: 'borderAnomalies.showSettings',

    // Milty slice designer
    refreshMiltySliceColors:   'milty.refreshSliceColors',
});

/**
 * A command id. Typed as the union of the catalogue values, so a file with `// @ts-check`
 * cannot pass a string that is not in COMMANDS.
 *
 * @typedef {typeof COMMANDS[keyof typeof COMMANDS]} CommandId
 */

// Set<string>, not Set<CommandId>: the runtime guard exists for callers that are not
// type checked, and it has to be able to test an arbitrary string.
/** @type {Set<string>} */
const KNOWN_IDS = new Set(Object.values(COMMANDS));

/** @type {Map<string, Function>} */
const commands = new Map();

/**
 * Publish a capability. Called once by the owning module, normally from its `install*`.
 *
 * @param {CommandId} id
 * @param {Function} fn
 * @returns {() => void} removes the registration again
 */
export function provide(id, fn) {
    if (!KNOWN_IDS.has(id)) {
        throw new Error('registry: unknown command id "' + id + '" — add it to COMMANDS first');
    }
    if (typeof fn !== 'function') {
        throw new Error('registry: "' + id + '" must be provided with a function');
    }
    // Re-providing is legitimate — a module can be reinstalled — but it is also exactly
    // what a double-install looks like, so say so rather than swapping silently.
    if (commands.has(id) && commands.get(id) !== fn) {
        console.warn('registry: "' + id + '" re-provided; the previous implementation is replaced');
    }
    commands.set(id, fn);
    return () => { if (commands.get(id) === fn) commands.delete(id); };
}

/**
 * Call a capability that must be there. Throws if it is not, because at that point the
 * button the user just clicked is broken and a silent no-op only hides it.
 *
 * @param {CommandId} id
 * @param {...any} args
 */
export function invoke(id, ...args) {
    const fn = commands.get(id);
    if (!fn) {
        throw new Error(
            'registry: "' + id + '" was invoked before any module provided it' +
            (KNOWN_IDS.has(id) ? '' : ' (and it is not in COMMANDS)')
        );
    }
    return fn(...args);
}

/**
 * Call a capability that may legitimately not be installed — a module behind a feature
 * that failed to load, or one that is only installed in some configurations.
 *
 * @param {CommandId} id
 * @param {...any} args
 * @returns {any} the return value, or undefined if nothing provides `id`
 */
export function tryInvoke(id, ...args) {
    if (!KNOWN_IDS.has(id)) {
        throw new Error('registry: unknown command id "' + id + '" — add it to COMMANDS first');
    }
    const fn = commands.get(id);
    return fn ? fn(...args) : undefined;
}

/** @param {CommandId} id */
export function hasCommand(id) {
    return commands.has(id);
}

/** Every id currently provided. For debugging, and for the tests. */
export function listCommands() {
    return [...commands.keys()].sort();
}

// ── Exclusive map modes ───────────────────────────────────────────────────────
/**
 * @typedef {object} MapMode
 * @property {() => void} deactivate - disarm this mode; must be safe to call when it is
 *                                     not armed, and must not call back into the registry
 */

/** @type {Map<string, MapMode>} */
const modes = new Map();

/** @type {string|null} */
let armed = null;

/**
 * Register a mode that takes over map clicks while it is armed.
 *
 * @param {string} id
 * @param {MapMode} mode
 * @returns {() => void} removes the registration again
 */
export function registerMode(id, mode) {
    if (!mode || typeof mode.deactivate !== 'function') {
        throw new Error('registry: mode "' + id + '" needs a deactivate() function');
    }
    modes.set(id, mode);
    return () => {
        if (armed === id) armed = null;
        modes.delete(id);
    };
}

/**
 * Arm `id`, disarming whatever else was armed. Modules call this when their mode
 * actually becomes active.
 *
 * @param {string} id
 */
export function activateMode(id) {
    if (!modes.has(id)) {
        throw new Error('registry: mode "' + id + '" is not registered');
    }
    deactivateModes({ except: id });
    armed = id;
}

/**
 * Disarm one mode. This is what a mode's own toggle calls when the user switches it off.
 * Calling the module's deactivate directly would work too, but it would leave
 * `activeMode()` reporting a mode that is no longer armed.
 *
 * @param {string} id
 */
export function deactivateMode(id) {
    const mode = modes.get(id);
    if (!mode) return;
    try {
        mode.deactivate();
    } catch (err) {
        console.error('registry: mode "' + id + '" failed to deactivate', err);
    }
    if (armed === id) armed = null;
}

/**
 * Disarm every registered mode. This is what a toolbar button calls before opening
 * something else, and it is deliberately unconditional — a mode's `deactivate` has to
 * cope with being called when it was not armed anyway, because the DOM can get out of
 * step with `armed` (a popup closed by its own X button, for instance).
 *
 * @param {{except?: string}} [opts]
 */
export function deactivateModes({ except } = {}) {
    for (const [id, mode] of modes) {
        if (id === except) continue;
        try {
            mode.deactivate();
        } catch (err) {
            // One broken mode must not stop the others being disarmed — leaving a stale
            // mode armed means the next map click does something the user did not ask for.
            console.error('registry: mode "' + id + '" failed to deactivate', err);
        }
    }
    if (armed !== except) armed = null;
}

/** Which mode is armed, if any. */
export function activeMode() {
    return armed;
}

/** Every registered mode id. For debugging, and for the tests. */
export function listModes() {
    return [...modes.keys()].sort();
}

/** Drop all registrations. Tests only — nothing in the app should need this. */
export function _resetForTests() {
    commands.clear();
    modes.clear();
    armed = null;
}
