/**
 * The Footer block of the lore entry editor: flavour prose, the gate, and the effect list.
 *
 * Effects used to be raw text in a textarea — the pickers only ever APPENDED a line, so
 * changing one meant retyping the DSL by hand, a condition always landed on whichever line
 * happened to be last, and which branch a new effect went into depended on a dropdown you
 * had to remember to set beforehand. Here every effect is a row you can edit in place:
 * its branch, arguments, @target and ?conditions are all controls on that row.
 *
 * The rows render from the FooterDoc in loreState and write back through setDoc, which is
 * the only thing that rewrites footerText. When a footer is too unusual to rebuild safely
 * (doc.unsafe) the rows lock and the raw editor takes over, so nothing hand-authored is
 * ever silently rewritten.
 */

import {
    EFFECT_VERBS, TILE_DEFAULT_VERBS, getDisplayFooter, validateLoreEffects,
    serializeEffectBody, parseEffectLine, withGateMarker
} from './loreEffects.js';
import {
    parseFooterDoc, serializeFooterDoc, footerDocBreakdown, flavourProblem
} from './loreFooterModel.js';
import { LORE_FOOTER_LIMIT } from './loreCore.js';
import * as state from './loreState.js';
import {
    openNumberPicker, openUnitPicker, openTokenPicker, openTargetPicker, openSwapPicker,
    openColorPicker, openTechPicker, openSetTilePicker, openRotateHyperlanePicker,
    openSetHyperlanePicker, openFogTilePicker, openConditionPicker, openListPicker
} from './loreEffectPickers.js';

// Verbs whose only operand is an amount — a quick -3..+3 (or positive-only) picker.
const NUMERIC_PICKER_RANGES = {
    tg: { min: -3, max: 3 },
    fleet: { min: -3, max: 3 },
    tactic: { min: -3, max: 3 },
    strategy: { min: -3, max: 3 },
    comms: { min: -3, max: 3 },
    ac: { min: 1, max: 3 },
    so: { min: 1, max: 3 }
};

const VERB_GROUPS = [
    ['player', 'Player rewards'],
    ['map', 'Map changes'],
    ['fow', 'Fog of War']
];

let ctx = { editor: null, buildValidationData: () => ({}) };
let rawEditorOpen = false;

// ── helpers ────────────────────────────────────────────────────────────────

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function verbSpec(verb) {
    return EFFECT_VERBS.find(v => v.verb === verb) || null;
}

function verbLabel(verb) {
    return verbSpec(verb)?.label || verb;
}

function argsToText(args) {
    return (args || []).join(' ');
}

/** Whether the row's @target control is meaningful for this verb. */
function isTileVerb(verb) {
    return TILE_DEFAULT_VERBS.has(verb);
}

/** Token pickers need to know whether the effect lands in space or on a planet. */
function tokenScopeFor(block) {
    if (block?.targetRef) return ctx.editor?.hexes?.[block.targetRef] ? 'space' : 'planet';
    return state.getRef()?.kind === 'planet' ? 'planet' : 'space';
}

/**
 * Runs the right picker for a verb and resolves its operand string.
 * Returns null when the author cancelled, '' when the verb takes no operands.
 * This is the dispatch the old createVerbButton did inline, kept verbatim so every
 * picker behaves exactly as before.
 */
async function pickArgs(verb, anchorEl, block) {
    const editor = ctx.editor;

    if (NUMERIC_PICKER_RANGES[verb]) {
        const n = await openNumberPicker(anchorEl, NUMERIC_PICKER_RANGES[verb]);
        if (n == null) return null;
        return (verb === 'ac' || verb === 'so') ? `${n}` : (n > 0 ? `+${n}` : `${n}`);
    }
    if (verb === 'unit' || verb === 'removeunit') {
        return await openUnitPicker(anchorEl, verb === 'removeunit' ? 'remove' : 'add');
    }
    if (verb === 'token' || verb === 'removetoken') {
        return await openTokenPicker(anchorEl, tokenScopeFor(block));
    }
    if (verb === 'swap') {
        const pair = await openSwapPicker(anchorEl, editor);
        return pair ? `${pair[0]} ${pair[1]}` : null;
    }
    if (verb === 'tech' || verb === 'removetech') {
        return await openTechPicker(anchorEl, editor, { mode: verb === 'removetech' ? 'remove' : 'grant' });
    }
    if (verb === 'cc' || verb === 'removecc') {
        return await openColorPicker(anchorEl, editor, {
            title: verb === 'cc' ? 'Place command token of…' : 'Remove command token of…',
            allowNeutral: false, allowCurrent: true
        });
    }
    if (verb === 'clearunits') {
        return await openColorPicker(anchorEl, editor, { title: 'Clear all units of…' });
    }
    if (verb === 'settile') return await openSetTilePicker(anchorEl, editor);
    if (verb === 'rotatehyperlane') return await openRotateHyperlanePicker(anchorEl, editor);
    if (verb === 'sethyperlane') return await openSetHyperlanePicker(anchorEl, editor);
    if (verb === 'addfogtile') return await openFogTilePicker(anchorEl, editor);

    return undefined; // no picker for this verb — fall back to the spec's template
}

/** Verbs pickArgs can resolve interactively; the rest are edited as text. */
function hasPicker(verb) {
    return !!NUMERIC_PICKER_RANGES[verb] || [
        'unit', 'removeunit', 'token', 'removetoken', 'swap', 'tech', 'removetech',
        'cc', 'removecc', 'clearunits', 'settile', 'rotatehyperlane', 'sethyperlane',
        'addfogtile'
    ].includes(verb);
}

// ── mutation helpers (every one goes through state.setDoc) ─────────────────

function currentDoc() {
    return state.getDoc() || parseFooterDoc('');
}

function commitDoc(mutate) {
    const doc = JSON.parse(JSON.stringify(currentDoc()));
    mutate(doc);
    state.setDoc(doc);
}

function updateBlock(index, patch) {
    commitDoc(doc => {
        if (doc.blocks[index]) Object.assign(doc.blocks[index], patch);
    });
}

function removeBlock(index) {
    commitDoc(doc => { doc.blocks.splice(index, 1); });
}

function duplicateBlock(index) {
    commitDoc(doc => {
        const copy = JSON.parse(JSON.stringify(doc.blocks[index]));
        doc.blocks.splice(index + 1, 0, copy);
    });
}

function moveBlock(index, delta) {
    commitDoc(doc => {
        const to = index + delta;
        if (to < 0 || to >= doc.blocks.length) return;
        const [b] = doc.blocks.splice(index, 1);
        doc.blocks.splice(to, 0, b);
    });
}

function appendBlock(block) {
    commitDoc(doc => { doc.blocks.push(block); });
}

// ── branch control ─────────────────────────────────────────────────────────

/** The branch choices available under the current gate. */
function branchOptions(gate) {
    if (gate?.type === 'choice') {
        return [[null, 'Always'], ['accept', 'On Accept'], ['reject', 'On Reject']];
    }
    if (gate?.type === 'roll') {
        return [[null, 'Always'], ['__bin', 'Roll bin…']];
    }
    return [[null, 'Always']];
}

function createBranchControl(block, index, gate) {
    const wrap = el('span', 'lore-row-branch');
    const options = branchOptions(gate);
    const isBin = block.branch && !['accept', 'reject'].includes(block.branch);

    const select = document.createElement('select');
    select.className = 'lore-branch-select';
    select.title = 'When this line fires. Set per line — no need to choose before adding it.';
    for (const [value, label] of options) {
        const opt = document.createElement('option');
        opt.value = value === null ? '' : value;
        opt.textContent = label;
        select.appendChild(opt);
    }
    select.value = isBin ? '__bin' : (block.branch || '');
    select.onchange = () => {
        if (select.value === '__bin') {
            updateBlock(index, { branch: block.branch && isBin ? block.branch : '1' });
        } else {
            updateBlock(index, { branch: select.value || null });
        }
    };
    wrap.appendChild(select);

    if (gate?.type === 'roll' && isBin) {
        const binInput = document.createElement('input');
        binInput.type = 'text';
        binInput.className = 'lore-bin-input';
        binInput.value = block.branch;
        binInput.size = 5;
        binInput.title = 'Roll result range, e.g. "3" or "2-10". First matching bin wins.';
        binInput.onchange = () => {
            const v = binInput.value.trim();
            if (/^\d+(-\d+)?$/.test(v)) updateBlock(index, { branch: v });
            else binInput.value = block.branch;
        };
        wrap.appendChild(binInput);
    }
    return wrap;
}

// ── rows ───────────────────────────────────────────────────────────────────

function createEffectRow(block, index, gate, problemsByRow, locked) {
    const row = el('div', 'lore-effect-row');
    if (problemsByRow.has(index)) row.classList.add('is-invalid');

    row.appendChild(el('span', 'lore-drag-handle', '⋮⋮'));
    row.appendChild(createBranchControl(block, index, gate));
    row.appendChild(el('span', 'lore-row-verb', verbLabel(block.verb)));

    // Arguments. Verbs with a picker get a chip that reopens it; the rest (e.g. !vp, whose
    // operand is a free-text objective label) get an inline field, so every effect is
    // editable in place without anyone having to retype the DSL.
    if (hasPicker(block.verb)) {
        const argsBtn = el('button', 'lore-chip lore-chip--arg', argsToText(block.args) || '(no args)');
        argsBtn.type = 'button';
        argsBtn.title = 'Edit this effect\'s values';
        argsBtn.onclick = async (e) => {
            e.preventDefault();
            const picked = await pickArgs(block.verb, argsBtn, block);
            if (picked == null) return;
            updateBlock(index, { args: String(picked).trim().split(/\s+/).filter(Boolean) });
        };
        row.appendChild(argsBtn);
    } else {
        const argsInput = document.createElement('input');
        argsInput.type = 'text';
        argsInput.className = 'lore-args-input';
        argsInput.value = argsToText(block.args);
        argsInput.placeholder = verbSpec(block.verb)?.template || 'values';
        argsInput.title = 'Values for this effect';
        argsInput.onchange = () =>
            updateBlock(index, { args: argsInput.value.trim().split(/\s+/).filter(Boolean) });
        row.appendChild(argsInput);
    }

    // @target — per row now, instead of one sticky global applied at insert time.
    if (isTileVerb(block.verb)) {
        const targetBtn = el('button', 'lore-chip lore-chip--target',
            block.targetRef ? `@${block.targetRef}` : '@here');
        targetBtn.type = 'button';
        targetBtn.title = block.targetRef
            ? 'This effect is redirected at another system or planet. Click to change.'
            : 'This effect acts on the entry\'s own tile. Click to redirect it elsewhere.';
        targetBtn.onclick = async (e) => {
            e.preventDefault();
            const choice = await openTargetPicker(targetBtn, ctx.editor);
            if (choice === null) return;
            updateBlock(index, { targetRef: choice || null });
        };
        row.appendChild(targetBtn);
    }

    // ?conditions — each removable, added to THIS row rather than "the last line".
    for (const condition of block.conditions || []) {
        const chip = el('span', 'lore-chip lore-chip--cond');
        chip.appendChild(document.createTextNode(`?${condition}`));
        const x = el('button', 'lore-chip__x', '×');
        x.type = 'button';
        x.title = 'Remove this condition';
        x.onclick = () => updateBlock(index, {
            conditions: block.conditions.filter(c => c !== condition)
        });
        chip.appendChild(x);
        row.appendChild(chip);
    }

    const addCond = el('button', 'lore-chip lore-chip--addcond', '＋?');
    addCond.type = 'button';
    addCond.title = 'Only fire this line for players matching a condition';
    addCond.onclick = async (e) => {
        e.preventDefault();
        const token = await openConditionPicker(addCond, ctx.editor);
        if (!token) return;
        const clean = String(token).replace(/^\?/, '');
        updateBlock(index, { conditions: [...(block.conditions || []), clean] });
    };
    row.appendChild(addCond);

    row.appendChild(createRowActions(index));

    if (problemsByRow.has(index)) {
        const warn = el('div', 'lore-row-problem', `⚠️ ${problemsByRow.get(index).join(' · ')}`);
        row.appendChild(warn);
    }
    if (locked) row.querySelectorAll('button, select, input').forEach(c => { c.disabled = true; });
    return row;
}

function createProseRow(block, index, gate, locked) {
    const row = el('div', 'lore-effect-row lore-prose-row');
    row.appendChild(el('span', 'lore-drag-handle', '⋮⋮'));
    row.appendChild(el('span', 'lore-row-verb', '💬'));
    row.appendChild(createBranchControl(block, index, gate));

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'lore-prose-input';
    input.value = block.text || '';
    input.placeholder = 'Text players read for this outcome';
    input.onchange = () => updateBlock(index, { text: input.value });
    row.appendChild(input);

    row.appendChild(createRowActions(index));
    if (locked) row.querySelectorAll('button, select, input').forEach(c => { c.disabled = true; });
    return row;
}

function createRowActions(index) {
    const actions = el('span', 'lore-row-actions');
    const mk = (label, title, fn) => {
        const b = el('button', 'lore-row-action', label);
        b.type = 'button';
        b.title = title;
        b.onclick = fn;
        actions.appendChild(b);
    };
    mk('▲', 'Move up', () => moveBlock(index, -1));
    mk('▼', 'Move down', () => moveBlock(index, 1));
    mk('⧉', 'Duplicate', () => duplicateBlock(index));
    mk('🗑', 'Remove', () => removeBlock(index));
    return actions;
}

// ── add controls ───────────────────────────────────────────────────────────

function newEffectBlock(verb, args, inheritBranch) {
    return {
        kind: 'effect',
        branch: inheritBranch ?? null,
        verb,
        args: args || [],
        targetRef: null,
        conditions: []
    };
}

/** The branch a newly added line should inherit — the last row's, so runs stay together. */
function inheritedBranch(doc) {
    const last = (doc.blocks || [])[doc.blocks.length - 1];
    return last ? last.branch : null;
}

async function addEffectFromGroup(group, anchorEl) {
    const gameType = ctx.editor?.loreGameType || 'unknown';
    const items = EFFECT_VERBS
        .filter(v => v.group === group)
        .filter(v => !(v.fowOnly && gameType === 'normal'))
        .map(v => ({ value: v.verb, label: v.label }));

    const verb = await openListPicker(anchorEl, items, { title: 'Add effect', width: 240 });
    if (!verb) return;

    const spec = verbSpec(verb);
    const picked = await pickArgs(verb, anchorEl, null);
    if (picked === null) return;

    let args;
    if (picked === undefined) {
        // No picker: seed from the spec's template so the row starts valid.
        args = parseEffectLine(spec?.template || verb)?.args || [];
    } else {
        args = String(picked).trim().split(/\s+/).filter(Boolean);
    }
    appendBlock(newEffectBlock(verb, args, inheritedBranch(currentDoc())));
}

// ── gate ───────────────────────────────────────────────────────────────────

/** Bin-tagged lines stop being bins when the roll gate goes away — ask, don't silently change. */
function changeGate(newType) {
    const doc = currentDoc();
    const binBlocks = (doc.blocks || []).filter(
        b => b.branch && !['accept', 'reject'].includes(b.branch));

    const apply = (stripBins) => commitDoc(d => {
        d.gate = newType === 'roll'
            ? { type: 'roll', count: d.gate?.count || 2, sides: d.gate?.sides || 10 }
            : { type: newType };
        if (newType !== 'choice') {
            for (const b of d.blocks) {
                if (b.branch === 'accept' || b.branch === 'reject') b.branch = null;
            }
        }
        if (newType !== 'roll') {
            for (const b of d.blocks) {
                const isBin = b.branch && !['accept', 'reject'].includes(b.branch);
                if (!isBin) continue;
                // "Keep as text" folds the bin tag into the prose so the author can still see
                // what it said. An effect has no text to fold it into, so its tag just goes.
                if (!stripBins && b.kind === 'prose') {
                    b.text = `${b.branch}: ${b.text}`;
                }
                b.branch = null;
            }
        }
    });

    if (newType !== 'roll' && binBlocks.length) {
        showGatePrompt(binBlocks.length, apply);
        return;
    }
    apply(true);
}

let pendingGatePrompt = null;

function showGatePrompt(count, apply) {
    pendingGatePrompt = { count, apply };
    refresh();
}

function createGateSection(gate, locked) {
    const wrap = el('div', 'lore-gate-row');
    wrap.appendChild(el('span', 'lore-gate-label', 'Gate:'));

    const mkRadio = (value, label, title) => {
        const lab = el('label', 'lore-gate-option');
        lab.title = title;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'loreGate';
        radio.value = value;
        radio.checked = (gate?.type || 'none') === value;
        radio.disabled = locked;
        radio.onchange = () => changeGate(value);
        lab.appendChild(radio);
        lab.appendChild(document.createTextNode(label));
        wrap.appendChild(lab);
    };

    mkRadio('none', 'None', 'Effects fire as soon as the lore triggers.');
    mkRadio('choice', 'Accept / Reject',
        'Each recipient gets Accept and Reject buttons; lines fire according to their pick.');
    mkRadio('roll', 'Dice roll',
        'Each recipient rolls; a line fires when the total lands in its bin.');

    if (gate?.type === 'roll') {
        const spec = el('span', 'lore-roll-spec');
        const count = document.createElement('input');
        count.type = 'number'; count.min = '1'; count.max = '20';
        count.value = gate.count || 2; count.className = 'lore-roll-input';
        count.disabled = locked;
        count.onchange = () => commitDoc(d => {
            d.gate = { ...d.gate, count: parseInt(count.value, 10) || 2 };
        });
        spec.appendChild(count);
        spec.appendChild(el('span', null, 'd'));
        const sides = document.createElement('input');
        sides.type = 'number'; sides.min = '2'; sides.max = '100';
        sides.value = gate.sides || 10; sides.className = 'lore-roll-input';
        sides.disabled = locked;
        sides.onchange = () => commitDoc(d => {
            d.gate = { ...d.gate, sides: parseInt(sides.value, 10) || 10 };
        });
        spec.appendChild(sides);
        wrap.appendChild(spec);
    }
    return wrap;
}

// ── validation attribution ─────────────────────────────────────────────────

/**
 * validateLoreEffects reports problems with an `(in \`!<line>\`)` suffix, and that suffix is
 * exactly serializeEffectBody's output — so each problem can be pinned to the row it came
 * from instead of piling up in one anonymous list.
 */
function attributeProblems(problems, blocks) {
    const byRow = new Map();
    const leftovers = [];
    const keyOf = new Map();
    blocks.forEach((b, i) => {
        if (b.kind === 'effect') keyOf.set(serializeEffectBody(b), i);
    });

    for (const problem of problems) {
        const m = problem.match(/\(in `!([^`]*)`\)/);
        const index = m ? keyOf.get(m[1]) : undefined;
        if (index === undefined) {
            leftovers.push(problem);
        } else {
            const text = problem.replace(/\s*\(in `![^`]*`\)/, '');
            byRow.set(index, [...(byRow.get(index) || []), text]);
        }
    }
    return { byRow, leftovers };
}

// ── section ────────────────────────────────────────────────────────────────

export function createFooterSection(context) {
    ctx = { ...ctx, ...context };
    const section = el('div', 'lore-panel lore-footer-section');
    section.id = 'loreFooterSection';
    return section;
}

/** Rebuilds the whole footer block from loreState. Cheap — a handful of rows. */
export function refresh() {
    const section = document.getElementById('loreFooterSection');
    if (!section) return;
    const draft = state.getDraft();
    section.innerHTML = '';
    if (!draft) return;

    const doc = currentDoc();
    const locked = !!doc.unsafe;

    // header + budget meter
    const header = el('div', 'lore-panel-header');
    header.appendChild(el('span', 'lore-panel-title', 'Footer'));
    const breakdown = footerDocBreakdown(doc);
    const meter = el('span', 'lore-counter', `${breakdown.total}/${LORE_FOOTER_LIMIT}`);
    meter.title = `gate ${breakdown.gate} · flavour ${breakdown.flavour} · effects ${breakdown.effects}`;
    if (breakdown.total > LORE_FOOTER_LIMIT) meter.classList.add('is-over');
    else if (breakdown.total > LORE_FOOTER_LIMIT * 0.9) meter.classList.add('is-warn');
    header.appendChild(meter);
    section.appendChild(header);

    if (locked) {
        const banner = el('div', 'lore-error-band',
            'This footer uses text the editor can\'t safely rebuild, so it\'s shown as raw text. ' +
            'Editing it here keeps it exactly as you type it.');
        section.appendChild(banner);
    }

    // flavour
    section.appendChild(el('label', 'lore-field-label', 'Flavour — what players read'));
    const flavour = document.createElement('textarea');
    flavour.className = 'lore-flavour-input';
    flavour.rows = 2;
    flavour.value = doc.flavour || '';
    flavour.disabled = locked;
    flavour.placeholder = 'Optional prose shown under the lore text';
    flavour.oninput = () => {
        const problem = flavourProblem(flavour.value);
        problemEl.textContent = problem;
        problemEl.style.display = problem ? 'block' : 'none';
    };
    flavour.onchange = () => {
        if (flavourProblem(flavour.value)) return;
        commitDoc(d => { d.flavour = flavour.value; });
    };
    section.appendChild(flavour);
    const problemEl = el('div', 'lore-field-problem');
    problemEl.style.display = 'none';
    section.appendChild(problemEl);

    // gate
    section.appendChild(createGateSection(doc.gate, locked));

    if (pendingGatePrompt) {
        const prompt = el('div', 'lore-inline-prompt');
        prompt.appendChild(el('span', null,
            `${pendingGatePrompt.count} line(s) use roll bins. Without a dice gate those tags mean nothing.`));
        const strip = el('button', 'lore-inline-prompt__btn', 'Drop the bin tags');
        strip.type = 'button';
        strip.onclick = () => { const p = pendingGatePrompt; pendingGatePrompt = null; p.apply(true); };
        const keep = el('button', 'lore-inline-prompt__btn', 'Keep them as text');
        keep.type = 'button';
        keep.onclick = () => { const p = pendingGatePrompt; pendingGatePrompt = null; p.apply(false); };
        const cancel = el('button', 'lore-inline-prompt__btn', 'Cancel');
        cancel.type = 'button';
        cancel.onclick = () => { pendingGatePrompt = null; refresh(); };
        prompt.append(strip, keep, cancel);
        section.appendChild(prompt);
    }

    // validation, attributed per row
    const problems = validateLoreEffects(
        { footerText: draft.footerText, receiver: draft.receiver, persistance: draft.persistance },
        {
            targetKind: state.getRef()?.kind || 'system',
            gameType: ctx.editor?.loreGameType || 'unknown',
            editor: ctx.editor,
            data: ctx.buildValidationData()
        }
    );
    const { byRow, leftovers } = attributeProblems(problems, doc.blocks || []);

    // rows
    section.appendChild(el('label', 'lore-field-label', 'Effects'));
    const list = el('div', 'lore-effect-list');
    if (!(doc.blocks || []).length) {
        list.appendChild(el('div', 'lore-empty', 'No effects yet — add one below.'));
    }
    (doc.blocks || []).forEach((block, i) => {
        list.appendChild(block.kind === 'prose'
            ? createProseRow(block, i, doc.gate, locked)
            : createEffectRow(block, i, doc.gate, byRow, locked));
    });
    section.appendChild(list);

    // add row
    const addRow = el('div', 'lore-add-row');
    const textBtn = el('button', 'lore-add-btn', '＋ Text line');
    textBtn.type = 'button';
    textBtn.title = 'Prose tied to one outcome — the only way to write per-bin flavour';
    textBtn.disabled = locked;
    textBtn.onclick = () => appendBlock({
        kind: 'prose', branch: inheritedBranch(currentDoc()), text: ''
    });
    addRow.appendChild(textBtn);

    for (const [group, label] of VERB_GROUPS) {
        if (group === 'fow' && ctx.editor?.loreGameType === 'normal') continue;
        const btn = el('button', `lore-add-btn lore-add-btn--${group}`, `＋ ${label}`);
        btn.type = 'button';
        btn.disabled = locked;
        btn.onclick = (e) => { e.preventDefault(); addEffectFromGroup(group, btn); };
        addRow.appendChild(btn);
    }
    section.appendChild(addRow);

    if (leftovers.length) {
        const warn = el('div', 'lore-warn-list');
        leftovers.forEach(p => warn.appendChild(el('div', null, `⚠️ ${p}`)));
        section.appendChild(warn);
    }

    // preview
    section.appendChild(el('div', 'lore-field-label lore-field-label--sub',
        'Preview — what players will see'));
    const preview = el('div', 'lore-preview',
        getDisplayFooter(draft.footerText) || '(nothing shown to players — only bot effects)');
    section.appendChild(preview);

    // raw escape hatch
    section.appendChild(createRawEditor(draft, locked));
}

function createRawEditor(draft, locked) {
    const details = document.createElement('details');
    details.className = 'lore-raw';
    details.open = locked || rawEditorOpen;
    details.ontoggle = () => { rawEditorOpen = details.open; };

    const summary = document.createElement('summary');
    summary.textContent = '</> Raw footer';
    details.appendChild(summary);

    const area = document.createElement('textarea');
    area.className = 'lore-raw-input';
    area.rows = 4;
    area.value = draft.footerText || '';
    details.appendChild(area);

    const apply = el('button', 'lore-add-btn', 'Apply raw footer');
    apply.type = 'button';
    apply.onclick = () => state.setRawFooter(area.value);
    details.appendChild(apply);

    return details;
}

/** Keeps the gate marker helper reachable for callers that build a footer from scratch. */
export { withGateMarker, serializeFooterDoc };
