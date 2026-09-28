/**
 * The shortcut list is data, and the panel and the status bar are both drawn from it.
 *
 *   node tools/test-shortcuts.js      (or: npm test)
 *
 * The mistake this is here to catch is a quiet one: a combo token that is neither a key
 * nor a known mouse action. 'click' instead of 'Click' parses as a key called CLICK and
 * renders as a keycap — nothing throws, the panel just says something false.
 */

import { SHORTCUTS, MOUSE_TOKENS, parseCombo } from '../src/ui/shortcuts.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) passed++;
    else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// Named keys the list may use. Anything else must be a single character.
const NAMED_KEYS = new Set(['Mod', 'Shift', 'Alt', 'Esc', 'Enter']);

const ids = new Set();
const hints = new Set();

for (const group of SHORTCUTS) {
    check(`group ${group.id} has a unique id`, !ids.has(group.id));
    ids.add(group.id);
    check(`group ${group.id} is not empty`, group.items.length > 0);

    for (const item of group.items) {
        check(`"${item.does}" says what it does`, typeof item.does === 'string' && item.does.length > 3);
        check(`"${item.does}" has a combo`, item.combos.length > 0);

        for (const combo of [...item.combos, ...(item.hintCombo ? [item.hintCombo] : [])]) {
            for (const token of combo.split('+')) {
                const known = token in MOUSE_TOKENS || NAMED_KEYS.has(token) || token.length === 1;
                check(`"${combo}" (${group.id}): token "${token}" is a key or a mouse action`, known);
            }
            // At most one mouse action per combo: "Shift+Click", not "Click+Drag".
            const mice = combo.split('+').filter(t => t in MOUSE_TOKENS);
            check(`"${combo}" has at most one mouse action`, mice.length <= 1);
        }

        if (item.hint) {
            check(`hint "${item.hint}" is used once`, !hints.has(item.hint));
            hints.add(item.hint);
        }
    }
}

check('the status bar has something to show', hints.size >= 2);

// Mod reads as the platform's own key.
{
    const pc = parseCombo('Mod+Shift+Z', { mac: false });
    const mac = parseCombo('Mod+Shift+Z', { mac: true });
    check('Mod is Ctrl off a Mac', pc[0].kind === 'key' && pc[0].text === 'Ctrl', JSON.stringify(pc));
    check('Mod is ⌘ on a Mac', mac[0].kind === 'key' && mac[0].text === '⌘', JSON.stringify(mac));
    check('letters are shown in capitals', pc[2].kind === 'key' && pc[2].text === 'Z', JSON.stringify(pc));
}
{
    const parts = parseCombo('Shift+D+RightClick', { mac: false });
    check('a mouse action parses as one',
        parts.length === 3 && parts[2].kind === 'mouse' && parts[2].token === 'RightClick',
        JSON.stringify(parts));
}

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nshortcuts: ${passed} checks passed, ${failures.length} failed`);

if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
