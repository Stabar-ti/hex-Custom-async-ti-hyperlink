// @ts-check
/**
 * Grouping the top bar by what things are for.
 *
 * The bar carried eleven top-level buttons, all the same weight regardless of how often
 * anything was used. Three of them were help. One was the settings for the distance
 * calculation, which had no button of its own. Special Modes — the Milty designer, the
 * generator, Spin-To-Win, used a few times a session at most — sat as a peer of Copy/Cut
 * Swap, which is used constantly.
 *
 * This groups them:
 *
 *   Map size ▾  rings and the AsyncTI4-boundaries switch
 *   Analyse ▾   Calculate Slice, Sanity Check, Distance Options
 *   Tools ▾     the Milty designer and Spin-To-Win
 *   Help ▾      Help, Import/Export How-To, Features
 *
 * and moves Copy/Cut Swap into the Edit group beside undo and redo, where it belongs by
 * frequency. Every one of these is the existing button, moved — not a new one — so the
 * handlers bound to them elsewhere keep working.
 */

import { createDropdownFromExisting, makeDropdown } from './dropdownMenu.js';

/**
 * Map size ▾: the ring count and the AsyncTI4-boundaries switch.
 *
 * They lived in File ▸ New map beside Generate Empty Map, which read as if they were
 * settings for the next map. They are not: both resize the current map the moment they
 * change. Generate still reads the ring count from here.
 *
 * Holds inputs, so pressing a step button leaves it open.
 */
function installMapSizeMenu() {
    const panel = document.getElementById('mapSizeMenu');
    const trigger = document.getElementById('mapSizeBtn');
    if (!panel || !trigger) return;
    makeDropdown({ panel, trigger });
}

export function installTopBarMenus() {
    const left = document.getElementById('leftControls');
    const right = document.getElementById('rightControls');
    if (!left || !right) return;

    installMapSizeMenu();

    // Copy/Cut Swap is built into the rail's Edit group by uisectorControls — it arms a
    // selection mode, which makes it a tool rather than a command like undo. It briefly
    // lived in the top bar's Edit group here.

    // ── Analyse ──────────────────────────────────────────────────────────────
    // Distance Options lands here rather than in the bar: it is the settings for a tool,
    // and it had one of the widest buttons in the bar while the tool itself had none.
    createDropdownFromExisting({
        id: 'analyseMenu',
        label: 'Analyse',
        title: 'Slice values, sanity check, and distance settings',
        itemIds: ['calcSliceBtn', 'sanityCheckBtn', 'optionsBtn'],
        host: left,
    });

    // Tools — the Milty designer and Spin-To-Win — is its own button in index.html, and
    // builds its panel as it opens: see installToolsMenu in specialModePopup.js. It was
    // briefly called Generate, which described one of its items, and before that Special
    // Modes, a label this file used to overwrite at startup.

    // ── Help ─────────────────────────────────────────────────────────────────
    // Three buttons for three help popups, all in the bar at full weight.
    //
    // Placed before the version tag, which is the last thing in the group. Help used to be
    // appended after it — and the tag, still absolutely positioned, sat on top of it.
    createDropdownFromExisting({
        id: 'helpMenu',
        label: 'Help',
        title: 'Shortcuts, the manual, the import/export how-to, and the feature list',
        itemIds: ['helpToggle', 'manualBtn', 'infoToggle', 'featuresToggle'],
        host: right,
        before: document.getElementById('versionTag') ?? undefined,
    });
}
