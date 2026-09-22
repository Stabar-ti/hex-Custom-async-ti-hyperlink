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
 *   Analyse ▾   Calculate Slice, Sanity Check, Distance Options
 *   Generate ▾  the Milty designer, the random generator, AutoMapper, Spin-To-Win
 *   Help ▾      Help, Import/Export How-To, Features
 *
 * and moves Copy/Cut Swap into the Edit group beside undo and redo, where it belongs by
 * frequency. Every one of these is the existing button, moved — not a new one — so the
 * handlers bound to them elsewhere keep working.
 */

import { createDropdownFromExisting } from './dropdownMenu.js';

export function installTopBarMenus() {
    const left = document.getElementById('leftControls');
    const right = document.getElementById('rightControls');
    if (!left || !right) return;

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

    // ── Setup ────────────────────────────────────────────────────────────────
    // Special Modes is the Milty designer and friends: bulk tools for building a map
    // before the game starts. It was briefly called Generate, which described one of the
    // four items — the designer designs, the AutoMapper fills and Spin-To-Win rearranges.
    const special = document.getElementById('specialModesBtn');
    if (special) {
        special.textContent = 'Tools ▾';
        special.title = 'Milty slice designer, draft generator, AutoMapper and Spin-To-Win';
    }

    // ── Help ─────────────────────────────────────────────────────────────────
    // Three buttons for three help popups, all in the bar at full weight.
    createDropdownFromExisting({
        id: 'helpMenu',
        label: 'Help',
        title: 'Shortcuts, the import/export how-to, and the feature list',
        itemIds: ['helpToggle', 'infoToggle', 'featuresToggle'],
        host: right,
    });
}
