/**
 * Lore Module UI — master-detail editor for system / planet / phase lore.
 *
 * Layout: a target bar (hex pick + chips per system/planet + a phase strip), an entry
 * list on the left (a target holds MANY entries, distinguished by #tags), and a single
 * entry editor on the right (text, footer + effects builder, trigger/receiver/rounds/tag,
 * choice/roll gates, per-line ?conditions).
 *
 * External contract kept for uisectorControls.js "Add Lore…" hex-pick mode:
 * fill #hexLabelInput and click #selectHexBtn.
 */

import { showPopup } from '../../ui/popupUI.js';
import {
    LoreManager, LORE_RECEIVERS, LORE_TRIGGERS, LORE_PINGS, LORE_PERSISTANCE,
    LORE_RECEIVER_LABELS, LORE_TRIGGER_LABELS, LORE_PERSISTANCE_LABELS,
    LORE_PHASE_TARGETS, LORE_PHASE_TRIGGERS, LORE_TEXT_LIMIT, LORE_FOOTER_LIMIT,
    LORE_FOW_ONLY_RECEIVERS, LORE_NON_FOW_ONLY_RECEIVERS,
    createLoreEntry, parseRoundWindow, formatRoundWindow, validateTag, isNonEmptyLoreEntry
} from './loreCore.js';
import {
    EFFECT_VERBS, getGate, withGateMarker, getDisplayFooter, validateLoreEffects
} from './loreEffects.js';
import {
    openNumberPicker, openUnitPicker, openTokenPicker, openTargetPicker, openSwapPicker,
    openColorPicker, openTechPicker, openSetTilePicker, openRotateHyperlanePicker,
    openSetHyperlanePicker, openFogTilePicker, openConditionPicker, openListPicker
} from './loreEffectPickers.js';

// Verbs whose footer-DSL semantics are "amount only" — clicking shows a quick -3..+3
// (or positive-only) number picker instead of inserting a fixed template.
const NUMERIC_PICKER_RANGES = {
    tg: { min: -3, max: 3 },
    fleet: { min: -3, max: 3 },
    tactic: { min: -3, max: 3 },
    strategy: { min: -3, max: 3 },
    comms: { min: -3, max: 3 },
    ac: { min: 1, max: 3 },
    so: { min: 1, max: 3 }
};

// Verbs that resolve against a board target, so the "Target" control's @ref is meaningful.
const TARGET_AWARE_VERBS = new Set([
    'unit', 'plastic', 'removeunit', 'token', 'removetoken',
    'cc', 'removecc', 'clearunits', 'addfogtile', 'removefogtile'
]);

const PHASE_LABELS = { strategy: 'Strategy', action: 'Action', status: 'Status', agenda: 'Agenda' };

let loreManager = null;

// Selected target + entry
let currentRef = null;      // {kind:'system'|'planet'|'phase', hexLabel?, planetIndex?, phase?}
let currentIndex = -1;      // index into the target's entry list; -1 = composing a new entry

// Editor-local clipboard (one full entry)
let copiedEntry = null;

// The optional @target redirect for effect insertion
let effectTarget = null;

export function installLoreUI(editor) {
    loreManager = new LoreManager(editor);
    window.loreManager = loreManager;
    window.showLorePopup = showLorePopup;
    window.openLorePopupAtPhase = openLorePopupAtPhase;
}

/** Opens the popup focused on one phase's entry list (used by the overlay's phase banner). */
function openLorePopupAtPhase(phase) {
    showLorePopup();
    setTimeout(() => selectPhase(phase), 50);
}

// ─────────────────────────────────────────── popup shell ───────────────────────────────────────────

export function showLorePopup() {
    if (document.getElementById('lorePopup')) return;

    const content = document.createElement('div');
    content.style.minWidth = '640px';

    content.appendChild(createHeaderSection());
    content.appendChild(createTargetSection());
    content.appendChild(createMainSection());
    content.appendChild(createActionButtonsSection());

    showPopup({
        id: 'lorePopup',
        className: 'popup-ui lore-popup',
        title: 'Lore Module',
        content,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        style: {
            left: '260px',
            top: '80px',
            minWidth: '680px',
            maxWidth: '1100px',
            minHeight: '400px',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '2px solid var(--popup-border-lore)',
            boxShadow: '0 8px 40px #000a',
            padding: '16px'
        },
        showHelp: true,
        onHelp: () => showLoreHelp()
    });

    // restore state if the popup was reopened mid-session
    if (currentRef?.hexLabel) selectHex(currentRef.hexLabel);
    else if (currentRef?.kind === 'phase') selectPhase(currentRef.phase);
}

function createHeaderSection() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px';

    const gameTypeLabel = document.createElement('label');
    gameTypeLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.9em;color:#ddd';
    gameTypeLabel.title = 'Sets the validation context: Fog of War games allow Adjacent/GM receivers, pings, ' +
        'and fog-tile effects; normal games use the Private Card Thread receiver instead.';
    gameTypeLabel.appendChild(document.createTextNode('Game type:'));
    const gameTypeSelect = document.createElement('select');
    gameTypeSelect.id = 'loreGameType';
    gameTypeSelect.style.cssText = 'padding:4px 6px;border:1px solid #666;border-radius:4px;background:#34495e;color:#fff';
    [['unknown', 'Not decided'], ['fow', 'Fog of War'], ['normal', 'Normal (lore_mode)']].forEach(([v, t]) => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = t;
        gameTypeSelect.appendChild(opt);
    });
    gameTypeSelect.value = loreManager.editor.loreGameType || 'unknown';
    gameTypeSelect.onchange = () => {
        loreManager.editor.loreGameType = gameTypeSelect.value;
        updateReceiverOptions();
        updateEffectsPreview();
    };
    gameTypeLabel.appendChild(gameTypeSelect);
    row.appendChild(gameTypeLabel);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    row.appendChild(spacer);

    const overviewBtn = document.createElement('button');
    overviewBtn.textContent = '📋 Overview';
    overviewBtn.title = 'Table of every lore entry on the map (systems, planets, and phases).';
    overviewBtn.style.cssText = 'padding:6px 12px;border:1px solid #9b59b6;border-radius:4px;' +
        'background:#2c3e50;color:#9b59b6;cursor:pointer';
    overviewBtn.onclick = () => showLoreOverview();
    row.appendChild(overviewBtn);

    return row;
}

// ─────────────────────────────────────────── target bar ───────────────────────────────────────────

function createTargetSection() {
    const section = document.createElement('div');
    section.id = 'hexSelectorSection';
    section.style.cssText = 'margin-bottom:12px;padding:10px 12px;border:1px solid #555;border-radius:6px;background:#2c3e50';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';

    const label = document.createElement('strong');
    label.textContent = 'Target:';
    label.style.color = '#fff';
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'hexLabelInput';
    input.placeholder = 'Hex label (e.g. 001, 305)';
    input.style.cssText = 'width:160px;padding:6px;border:1px solid #666;border-radius:4px;background:#34495e;color:#fff';
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectHex(input.value.trim()); });
    row.appendChild(input);

    const selectBtn = document.createElement('button');
    selectBtn.id = 'selectHexBtn';
    selectBtn.textContent = 'Select';
    selectBtn.style.cssText = 'padding:6px 12px;border:1px solid #27ae60;border-radius:4px;background:#27ae60;color:#fff;cursor:pointer';
    selectBtn.onclick = () => selectHex(input.value.trim());
    row.appendChild(selectBtn);

    const hint = document.createElement('span');
    hint.textContent = 'or use "Add Lore…" in the toolbar and click hexes on the map';
    hint.style.cssText = 'font-size:0.8em;color:#888';
    row.appendChild(hint);

    const phaseWrap = document.createElement('div');
    phaseWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto';
    const phaseLabel = document.createElement('span');
    phaseLabel.textContent = 'Phases:';
    phaseLabel.style.cssText = 'font-size:0.85em;color:#aaa';
    phaseWrap.appendChild(phaseLabel);
    LORE_PHASE_TARGETS.forEach(phase => {
        const btn = document.createElement('button');
        btn.id = `lorePhaseBtn_${phase}`;
        btn.textContent = PHASE_LABELS[phase];
        btn.title = `Lore that fires when the ${PHASE_LABELS[phase]} phase begins or ends (no hex needed).`;
        btn.style.cssText = 'padding:4px 10px;border:1px solid #666;border-radius:12px;background:#34495e;color:#ddd;cursor:pointer;font-size:0.82em';
        btn.onclick = () => selectPhase(phase);
        phaseWrap.appendChild(btn);
    });
    row.appendChild(phaseWrap);
    section.appendChild(row);

    const chipBar = document.createElement('div');
    chipBar.id = 'loreChipBar';
    chipBar.style.cssText = 'display:none;gap:6px;flex-wrap:wrap;margin-top:8px';
    section.appendChild(chipBar);

    const statusDiv = document.createElement('div');
    statusDiv.id = 'hexStatus';
    statusDiv.style.cssText = 'margin-top:6px;font-size:0.85em;color:#ccc';
    section.appendChild(statusDiv);

    return section;
}

function updateHexStatus(message) {
    const statusDiv = document.getElementById('hexStatus');
    if (statusDiv) statusDiv.textContent = message;
}

function selectHex(hexLabel) {
    if (!hexLabel) {
        updateHexStatus('Please enter a hex label');
        return;
    }
    const hex = loreManager.editor.hexes[hexLabel];
    if (!hex) {
        updateHexStatus(`Hex ${hexLabel} not found`);
        return;
    }
    const input = document.getElementById('hexLabelInput');
    if (input) input.value = hexLabel;

    renderChipBar(hex);
    updateHexStatus(`Selected hex ${hexLabel} — ${hex.planets?.length || 0} planet(s)`);

    // keep the current planet selection when re-selecting the same hex, else go to System
    if (!(currentRef && currentRef.hexLabel === hexLabel && currentRef.kind === 'planet'
        && currentRef.planetIndex < (hex.planets?.length || 0))) {
        currentRef = { kind: 'system', hexLabel };
    }
    selectTarget(currentRef);
}

function selectPhase(phase) {
    const input = document.getElementById('hexLabelInput');
    if (input) input.value = '';
    const chipBar = document.getElementById('loreChipBar');
    if (chipBar) chipBar.style.display = 'none';
    updateHexStatus(`Phase lore: fires when the ${PHASE_LABELS[phase]} phase begins/ends.`);
    selectTarget({ kind: 'phase', phase });
}

function targetTitle(ref) {
    if (!ref) return '';
    if (ref.kind === 'phase') return `${PHASE_LABELS[ref.phase]} phase`;
    if (ref.kind === 'system') return `${ref.hexLabel} — System`;
    const planet = loreManager.editor.hexes[ref.hexLabel]?.planets?.[ref.planetIndex];
    const name = planet?.name || planet?.planetID || planet?.id || `Planet ${ref.planetIndex + 1}`;
    return `${ref.hexLabel} — ${name}`;
}

function renderChipBar(hex) {
    const chipBar = document.getElementById('loreChipBar');
    if (!chipBar) return;
    chipBar.style.display = 'flex';
    chipBar.innerHTML = '';

    const mkChip = (text, ref, id) => {
        const chip = document.createElement('button');
        chip.id = id;
        chip.textContent = text;
        chip.style.cssText = 'padding:4px 12px;border:1px solid #666;border-radius:12px;' +
            'background:#34495e;color:#ddd;cursor:pointer;font-size:0.85em';
        chip.onclick = () => selectTarget(ref);
        chipBar.appendChild(chip);
        return chip;
    };

    const sysCount = loreManager.getEntries({ kind: 'system', hexLabel: hex.label }).filter(isNonEmptyLoreEntry).length;
    mkChip(`System${sysCount ? ` ×${sysCount}` : ''}`, { kind: 'system', hexLabel: hex.label }, 'loreChip_system');

    (hex.planets || []).forEach((planet, i) => {
        const name = planet?.name || planet?.planetID || planet?.id || `Planet ${i + 1}`;
        const count = loreManager.getEntries({ kind: 'planet', hexLabel: hex.label, planetIndex: i })
            .filter(isNonEmptyLoreEntry).length;
        mkChip(`${name}${count ? ` ×${count}` : ''}`, { kind: 'planet', hexLabel: hex.label, planetIndex: i }, `loreChip_planet${i}`);
    });
}

function highlightSelection() {
    // chips
    document.querySelectorAll('#loreChipBar button').forEach(chip => {
        chip.style.background = '#34495e';
        chip.style.borderColor = '#666';
    });
    // phase buttons
    LORE_PHASE_TARGETS.forEach(phase => {
        const btn = document.getElementById(`lorePhaseBtn_${phase}`);
        if (btn) { btn.style.background = '#34495e'; btn.style.borderColor = '#666'; }
    });
    if (!currentRef) return;
    let el = null;
    if (currentRef.kind === 'phase') el = document.getElementById(`lorePhaseBtn_${currentRef.phase}`);
    else if (currentRef.kind === 'system') el = document.getElementById('loreChip_system');
    else el = document.getElementById(`loreChip_planet${currentRef.planetIndex}`);
    if (el) { el.style.background = '#8e44ad'; el.style.borderColor = '#9b59b6'; }
}

// ─────────────────────────────────────────── main area ───────────────────────────────────────────

function createMainSection() {
    const main = document.createElement('div');
    main.id = 'loreMain';
    main.style.cssText = 'display:none;gap:12px;margin-bottom:14px;align-items:flex-start';

    const listPane = document.createElement('div');
    listPane.id = 'loreEntryListPane';
    listPane.style.cssText = 'flex:0 0 220px;display:flex;flex-direction:column;gap:6px;' +
        'padding:10px;border:1px solid #555;border-radius:6px;background:#2c3e50;max-height:60vh;overflow-y:auto';
    main.appendChild(listPane);

    const editorPane = document.createElement('div');
    editorPane.id = 'loreEditorPane';
    editorPane.style.cssText = 'flex:1;min-width:360px';
    editorPane.appendChild(createEntryEditor());
    main.appendChild(editorPane);

    return main;
}

function selectTarget(ref) {
    currentRef = ref;
    effectTarget = null;
    const targetBtn = document.getElementById('loreTargetBtn');
    if (targetBtn) targetBtn.textContent = '🎯 Target: none';

    const main = document.getElementById('loreMain');
    if (main) main.style.display = 'flex';
    highlightSelection();
    updateTriggerOptions();
    updateReceiverOptions();
    renderEntryList();

    const entries = loreManager.getEntries(currentRef);
    if (entries.length) loadEntry(0);
    else startNewEntry();
}

function entrySummaryLine(entry) {
    const bits = [];
    bits.push(entry.tag ? `#${entry.tag}` : '(untagged)');
    bits.push(LORE_TRIGGER_LABELS[entry.trigger] ? entry.trigger : entry.trigger);
    return bits.join(' · ');
}

function entryMetaLine(entry) {
    const bits = [entry.receiver];
    const rounds = formatRoundWindow(entry.fromRound, entry.tillRound);
    if (rounds) bits.push(`R${rounds}`);
    const gate = getGate(entry.footerText);
    if (gate.type === 'roll') bits.push(`🎲${gate.count}d${gate.sides}`);
    if (gate.type === 'choice') bits.push('⚖ choice');
    if (entry.ping === 'YES') bits.push('📣');
    return bits.join(' · ');
}

function renderEntryList() {
    const pane = document.getElementById('loreEntryListPane');
    if (!pane || !currentRef) return;
    pane.innerHTML = '';

    const heading = document.createElement('div');
    heading.textContent = targetTitle(currentRef);
    heading.style.cssText = 'font-weight:bold;color:#9b59b6;font-size:0.9em;margin-bottom:2px';
    pane.appendChild(heading);

    const entries = loreManager.getEntries(currentRef);
    if (!entries.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No lore entries yet.';
        empty.style.cssText = 'color:#888;font-style:italic;font-size:0.85em';
        pane.appendChild(empty);
    }

    entries.forEach((entry, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;border:1px solid ' +
            (i === currentIndex ? '#9b59b6' : '#555') + ';border-radius:4px;background:' +
            (i === currentIndex ? '#3d2a52' : '#34495e') + ';color:#ddd;cursor:pointer';
        const line1 = document.createElement('div');
        line1.textContent = entrySummaryLine(entry);
        line1.style.cssText = 'font-size:0.85em;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const line2 = document.createElement('div');
        line2.textContent = entryMetaLine(entry);
        line2.style.cssText = 'font-size:0.75em;color:#aaa';
        const line3 = document.createElement('div');
        line3.textContent = (entry.loreText || '').slice(0, 60) || '(no text)';
        line3.style.cssText = 'font-size:0.72em;color:#888;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        row.appendChild(line1);
        row.appendChild(line2);
        row.appendChild(line3);
        row.onclick = () => loadEntry(i);
        pane.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add entry';
    addBtn.style.cssText = 'padding:6px;border:1px dashed #27ae60;border-radius:4px;background:transparent;' +
        'color:#27ae60;cursor:pointer;font-size:0.85em;margin-top:4px';
    addBtn.onclick = () => startNewEntry();
    pane.appendChild(addBtn);
}

// ─────────────────────────────────────────── entry editor ───────────────────────────────────────────

function createEntryEditor() {
    const form = document.createElement('div');
    form.className = 'lore-form';
    form.style.cssText = 'padding:12px;border:1px solid #555;border-radius:6px;background:#34495e';

    const editorTitle = document.createElement('div');
    editorTitle.id = 'loreEditorTitle';
    editorTitle.style.cssText = 'font-weight:bold;color:#fff;margin-bottom:8px';
    form.appendChild(editorTitle);

    // Lore text + counter
    form.appendChild(mkLabel('Lore Text (the narrative players receive):'));
    const loreTextArea = mkTextarea('loreLoreText', 4);
    form.appendChild(loreTextArea);
    const loreCounter = mkCounter('loreLoreTextCounter', LORE_TEXT_LIMIT);
    form.appendChild(loreCounter);
    wireTextLimit(loreTextArea, loreCounter, LORE_TEXT_LIMIT);

    // Footer text + counter
    form.appendChild(mkLabel('Footer Text (flavor + !effect lines):'));
    const footerArea = mkTextarea('loreFooterText', 4);
    form.appendChild(footerArea);
    const footerCounter = mkCounter('loreFooterTextCounter', LORE_FOOTER_LIMIT);
    form.appendChild(footerCounter);
    wireTextLimit(footerArea, footerCounter, LORE_FOOTER_LIMIT, () => updateEffectsPreview());

    // Gate row (choice / roll)
    form.appendChild(createGateRow());

    // Effects builder
    form.appendChild(createEffectsSection());

    // Options: receiver / trigger / ping / persistance
    const optionsRow = document.createElement('div');
    optionsRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:10px';
    optionsRow.appendChild(createSelectField('loreReceiver', 'Receiver:', LORE_RECEIVERS, LORE_RECEIVER_LABELS));
    optionsRow.appendChild(createSelectField('loreTrigger', 'Trigger:', LORE_TRIGGERS, LORE_TRIGGER_LABELS));
    optionsRow.appendChild(createSelectField('lorePing', 'Ping GM:', LORE_PINGS));
    optionsRow.appendChild(createSelectField('lorePersistance', 'Persistence:', LORE_PERSISTANCE, LORE_PERSISTANCE_LABELS));
    form.appendChild(optionsRow);

    // Rounds + tag row
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:10px';

    const roundsWrap = document.createElement('div');
    roundsWrap.style.flex = '1';
    const roundsLabel = mkLabel('Whole-entry Rounds (blank = any · 3 · 2-5 · 4- · -6):', '0.9em');
    roundsLabel.title = 'Restricts WHEN THIS ENTRY CAN FIRE AT ALL — every effect line in it, whole-entry gate. ' +
        'For restricting a single ! effect LINE instead, use the ❓ Condition button\'s "Rounds" option below.';
    roundsWrap.appendChild(roundsLabel);
    const roundsInput = document.createElement('input');
    roundsInput.type = 'text';
    roundsInput.id = 'loreRounds';
    roundsInput.placeholder = 'any';
    roundsInput.title = roundsLabel.title;
    roundsInput.style.cssText = 'width:100%;padding:4px 6px;border:1px solid #666;border-radius:4px;background:#2c3e50;color:#fff;box-sizing:border-box';
    roundsInput.addEventListener('input', () => {
        const { warning } = parseRoundWindow(roundsInput.value);
        roundsInput.style.borderColor = warning ? '#f39c12' : '#666';
        roundsInput.title = warning || '';
    });
    roundsWrap.appendChild(roundsInput);
    metaRow.appendChild(roundsWrap);

    const tagWrap = document.createElement('div');
    tagWrap.style.flex = '1';
    tagWrap.appendChild(mkLabel('Tag (letters+digits — allows several entries per target):', '0.9em'));
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.id = 'loreTag';
    tagInput.placeholder = 'untagged';
    tagInput.style.cssText = 'width:100%;padding:4px 6px;border:1px solid #666;border-radius:4px;background:#2c3e50;color:#fff;box-sizing:border-box';
    tagInput.addEventListener('input', () => {
        const problem = validateTag(tagInput.value.trim());
        tagInput.style.borderColor = problem ? '#e74c3c' : '#666';
        tagInput.title = problem || '';
    });
    tagWrap.appendChild(tagInput);
    metaRow.appendChild(tagWrap);
    form.appendChild(metaRow);

    // Warnings from the manager (round shorthand, phase footguns) shown on save
    const saveWarnings = document.createElement('div');
    saveWarnings.id = 'loreSaveWarnings';
    saveWarnings.style.cssText = 'display:none;font-size:0.8em;color:#f39c12;margin-top:8px;line-height:1.5';
    form.appendChild(saveWarnings);

    // Buttons
    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'margin-top:12px;display:flex;gap:8px;flex-wrap:wrap';
    const saveNewBtn = mkButton('loreSaveNewBtn', 'Save as New', '#27ae60', () => saveAsNew());
    saveNewBtn.title = 'Always adds the form\'s content as a brand-new entry (auto-tags on collision) — ' +
        'never overwrites whatever is currently loaded.';
    buttonRow.appendChild(saveNewBtn);
    const updateBtn = mkButton('loreUpdateBtn', 'Update', '#2980b9', () => updateLoadedEntry());
    buttonRow.appendChild(updateBtn);
    buttonRow.appendChild(mkButton('loreDeleteBtn', 'Delete', '#e74c3c', () => deleteEntry()));
    buttonRow.appendChild(mkButton('loreCopyToBtn', 'Copy to…', '#6c3483', () => copyEntryTo()));
    buttonRow.appendChild(mkButton('loreCopyBtn', 'Copy', '#3498db', () => copyEntry()));
    buttonRow.appendChild(mkButton('lorePasteBtn', 'Paste', '#3498db', () => pasteEntry()));
    form.appendChild(buttonRow);

    // Receiver affects gate warnings
    setTimeout(() => {
        const receiverSelect = document.getElementById('loreReceiver');
        if (receiverSelect) receiverSelect.addEventListener('change', () => updateEffectsPreview());
    }, 0);

    return form;
}

function mkLabel(text, fontSize = '1em') {
    const label = document.createElement('label');
    label.textContent = text;
    label.style.cssText = `display:block;margin:6px 0 4px 0;color:#fff;font-weight:bold;font-size:${fontSize}`;
    return label;
}

function mkTextarea(id, rows) {
    const area = document.createElement('textarea');
    area.id = id;
    area.rows = rows;
    area.style.cssText = 'width:100%;padding:6px;border:1px solid #666;border-radius:4px;' +
        'background:#2c3e50;color:#fff;resize:vertical;margin-bottom:2px;box-sizing:border-box';
    return area;
}

function mkCounter(id, limit) {
    const counter = document.createElement('div');
    counter.id = id;
    counter.style.cssText = 'font-size:12px;color:#888;text-align:right;margin-bottom:6px';
    counter.textContent = `0/${limit} characters`;
    return counter;
}

function mkButton(id, text, color, onClick) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = text;
    btn.style.cssText = `padding:6px 12px;border:1px solid ${color};border-radius:4px;background:${color};color:#fff;cursor:pointer`;
    btn.onclick = onClick;
    return btn;
}

/** Live counter + strips the export-reserved ';'/'|' characters as the user types. */
function wireTextLimit(area, counter, limit, extra = null) {
    area.addEventListener('input', function () {
        if (/[;|]/.test(this.value)) {
            const cursorPosition = this.selectionStart;
            this.value = this.value.replace(/[;|]/g, '');
            this.setSelectionRange(Math.max(0, cursorPosition - 1), Math.max(0, cursorPosition - 1));
        }
        const length = this.value.length;
        counter.textContent = `${length}/${limit} characters`;
        counter.style.color = length > limit ? '#e74c3c' : length > limit * 0.9 ? '#f39c12' : '#888';
        if (extra) extra();
    });
}

function createSelectField(id, label, options, labels = null) {
    const container = document.createElement('div');
    container.style.cssText = 'flex:1;min-width:130px';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display:block;margin-bottom:4px;color:#fff;font-size:0.9em';

    const select = document.createElement('select');
    select.id = id;
    select.style.cssText = 'width:100%;padding:4px;border:1px solid #666;border-radius:4px;background:#2c3e50;color:#fff';
    options.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option;
        optionEl.textContent = labels && labels[option] ? labels[option] : option;
        select.appendChild(optionEl);
    });

    container.appendChild(labelEl);
    container.appendChild(select);
    return container;
}

/** Phase targets only offer PHASE_START/PHASE_END; board targets exclude them (hard rule). */
function updateTriggerOptions() {
    const select = document.getElementById('loreTrigger');
    if (!select || !currentRef) return;
    const isPhase = currentRef.kind === 'phase';
    const previous = select.value;
    select.innerHTML = '';
    LORE_TRIGGERS
        .filter(t => LORE_PHASE_TRIGGERS.includes(t) === isPhase)
        .forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = LORE_TRIGGER_LABELS[t] || t;
            select.appendChild(opt);
        });
    select.value = [...select.options].some(o => o.value === previous) ? previous
        : (isPhase ? 'PHASE_START' : 'CONTROLLED');
}

/** Receiver availability follows the game type (mirrors the bot's add-UI). */
function updateReceiverOptions() {
    const select = document.getElementById('loreReceiver');
    if (!select) return;
    const gameType = loreManager.editor.loreGameType || 'unknown';
    const previous = select.value;
    select.innerHTML = '';
    LORE_RECEIVERS
        .filter(r => {
            if (gameType === 'normal' && LORE_FOW_ONLY_RECEIVERS.includes(r)) return false;
            if (gameType === 'fow' && LORE_NON_FOW_ONLY_RECEIVERS.includes(r)) return false;
            return true;
        })
        .forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = LORE_RECEIVER_LABELS[r] || r;
            select.appendChild(opt);
        });
    select.value = [...select.options].some(o => o.value === previous) ? previous : 'CURRENT';

    const pingSelect = document.getElementById('lorePing');
    if (pingSelect) {
        pingSelect.disabled = gameType === 'normal';
        if (gameType === 'normal') pingSelect.value = 'NO';
        pingSelect.title = gameType === 'normal' ? 'Pinging the GM is a Fog of War feature.' : '';
    }
}

// ── gate row ──

function createGateRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 0;' +
        'padding:8px;border:1px solid #555;border-radius:6px;background:#2c3e50';

    const title = document.createElement('span');
    title.textContent = 'Gate:';
    title.style.cssText = 'font-size:0.85em;font-weight:bold;color:#9b59b6';
    row.appendChild(title);

    const mkRadio = (value, text, tooltip) => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.85em;color:#ddd;cursor:pointer';
        label.title = tooltip;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'loreGate';
        radio.value = value;
        radio.id = `loreGate_${value}`;
        radio.addEventListener('change', () => applyGateFromControls());
        label.appendChild(radio);
        label.appendChild(document.createTextNode(text));
        row.appendChild(label);
        return radio;
    };

    mkRadio('none', 'None', 'Effects fire immediately when the lore triggers.');
    mkRadio('choice', 'Accept/Reject choice', 'Each recipient gets Accept/Reject buttons; "accept:"/"reject:" lines fire on that pick (adds a !choice marker).');
    mkRadio('roll', 'Dice roll', 'Each recipient gets a Roll button; "N-M:" bin lines fire when the total lands in that range (adds a !roll NdM marker).');

    const rollSpec = document.createElement('span');
    rollSpec.id = 'loreRollSpecWrap';
    rollSpec.style.cssText = 'display:none;align-items:center;gap:4px;font-size:0.85em;color:#ddd';
    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.id = 'loreRollCount';
    countInput.min = '1';
    countInput.max = '20';
    countInput.value = '2';
    countInput.style.cssText = 'width:48px;padding:3px;border:1px solid #666;border-radius:4px;background:#34495e;color:#fff';
    countInput.addEventListener('change', () => applyGateFromControls());
    const dLabel = document.createElement('span');
    dLabel.textContent = 'd';
    const sidesInput = document.createElement('input');
    sidesInput.type = 'number';
    sidesInput.id = 'loreRollSides';
    sidesInput.min = '2';
    sidesInput.max = '100';
    sidesInput.value = '10';
    sidesInput.style.cssText = 'width:48px;padding:3px;border:1px solid #666;border-radius:4px;background:#34495e;color:#fff';
    sidesInput.addEventListener('change', () => applyGateFromControls());
    rollSpec.appendChild(countInput);
    rollSpec.appendChild(dLabel);
    rollSpec.appendChild(sidesInput);
    row.appendChild(rollSpec);

    const wrap = document.createElement('div');
    wrap.appendChild(row);
    wrap.appendChild(createInsertModeRow());
    return wrap;
}

/**
 * "New effects insert as:" row — sits directly under the gate radios/dice inputs (not up
 * in the Effects section) so the mode you just set is right next to what you set it for.
 * Hidden entirely while Gate = None (every effect always fires, nothing to choose).
 */
function createInsertModeRow() {
    const row = document.createElement('div');
    row.id = 'loreInsertRow';
    row.style.cssText = 'display:none;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;' +
        'padding-top:8px;border-top:1px solid #444';

    const label = document.createElement('span');
    label.textContent = 'New effects insert as:';
    label.style.cssText = 'font-size:0.82em;color:#aaa';
    row.appendChild(label);

    const insertModeSelect = document.createElement('select');
    insertModeSelect.id = 'loreInsertMode';
    insertModeSelect.style.cssText = 'padding:3px 6px;font-size:0.8em;border:1px solid #666;border-radius:4px;background:#34495e;color:#fff';
    row.appendChild(insertModeSelect);

    const binInput = document.createElement('input');
    binInput.type = 'text';
    binInput.id = 'loreBinRange';
    binInput.placeholder = 'bin: 2-10';
    binInput.title = 'Roll-bin range for inserted effects, e.g. "2-10" or "15" (first matching bin wins).';
    binInput.style.cssText = 'display:none;width:80px;padding:3px 6px;font-size:0.8em;border:1px solid #666;' +
        'border-radius:4px;background:#34495e;color:#fff';
    row.appendChild(binInput);

    return row;
}

/** Rewrites the footer's marker line to match the gate radio/NdM controls. */
function applyGateFromControls() {
    const footerInput = document.getElementById('loreFooterText');
    if (!footerInput) return;
    const type = document.querySelector('input[name="loreGate"]:checked')?.value || 'none';
    const count = parseInt(document.getElementById('loreRollCount')?.value, 10) || 2;
    const sides = parseInt(document.getElementById('loreRollSides')?.value, 10) || 10;
    footerInput.value = withGateMarker(footerInput.value, { type, count, sides });
    footerInput.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Syncs the gate controls (and the insert-mode dropdown) to whatever the footer contains. */
function syncGateControls(footerText) {
    const gate = getGate(footerText);
    const radio = document.getElementById(`loreGate_${gate.type}`);
    if (radio) radio.checked = true;
    const rollWrap = document.getElementById('loreRollSpecWrap');
    if (rollWrap) rollWrap.style.display = gate.type === 'roll' ? 'inline-flex' : 'none';
    if (gate.type === 'roll') {
        const countInput = document.getElementById('loreRollCount');
        const sidesInput = document.getElementById('loreRollSides');
        if (countInput && document.activeElement !== countInput) countInput.value = gate.count;
        if (sidesInput && document.activeElement !== sidesInput) sidesInput.value = gate.sides;
    }
    rebuildInsertModeOptions(gate.type);
}

// ── effects section ──

function createEffectsSection() {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:4px;padding:10px;border:1px solid #555;border-radius:6px;background:#2c3e50';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px';

    const title = document.createElement('span');
    title.textContent = 'Effects (bot commands)';
    title.style.cssText = 'font-size:0.85em;font-weight:bold;color:#9b59b6';
    header.appendChild(title);

    const targetBtn = document.createElement('button');
    targetBtn.type = 'button';
    targetBtn.id = 'loreTargetBtn';
    targetBtn.textContent = '🎯 Target: none';
    targetBtn.title = 'Redirect tile-bound effects (units, tokens, cc, fog…) at a specific system or planet (@target). ' +
        'Phase lore REQUIRES this for those effects — it has no system of its own.';
    targetBtn.style.cssText = 'padding:3px 8px;font-size:0.8em;border:1px solid #666;border-radius:4px;background:#34495e;color:#ddd;cursor:pointer';
    targetBtn.onclick = async (e) => {
        e.preventDefault();
        const choice = await openTargetPicker(targetBtn, loreManager.editor);
        if (choice === null) return;
        effectTarget = choice || null;
        targetBtn.textContent = choice ? `🎯 Target: ${choice}` : '🎯 Target: none';
    };
    header.appendChild(targetBtn);

    const conditionBtn = document.createElement('button');
    conditionBtn.type = 'button';
    conditionBtn.textContent = '❓ Condition';
    conditionBtn.title = 'Append a per-player condition (?color · ?faction:x · ?round:3-6) to the last effect line — ' +
        'the line only fires for players matching ALL its conditions.';
    conditionBtn.style.cssText = 'padding:3px 8px;font-size:0.8em;border:1px solid #666;border-radius:4px;background:#34495e;color:#f39c12;cursor:pointer';
    conditionBtn.onclick = async (e) => {
        e.preventDefault();
        const token = await openConditionPicker(conditionBtn, loreManager.editor);
        if (token) appendConditionToLastEffectLine(token);
    };
    header.appendChild(conditionBtn);

    section.appendChild(header);

    // verb buttons, grouped
    const groups = [
        ['player', 'Player rewards', '#3498db'],
        ['map', 'Map changes', '#16a085'],
        ['fow', 'Fog of War', '#7f8c8d']
    ];
    for (const [group, groupLabel, color] of groups) {
        const groupRow = document.createElement('div');
        groupRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;align-items:center';
        const tag = document.createElement('span');
        tag.textContent = groupLabel + ':';
        tag.style.cssText = 'font-size:0.75em;color:#888;flex:0 0 90px';
        groupRow.appendChild(tag);
        EFFECT_VERBS.filter(v => v.group === group).forEach(spec => {
            groupRow.appendChild(createVerbButton(spec, color));
        });
        section.appendChild(groupRow);
    }

    const warningsDiv = document.createElement('div');
    warningsDiv.id = 'loreEffectWarnings';
    warningsDiv.style.cssText = 'display:none;font-size:0.8em;color:#f39c12;margin-bottom:8px;line-height:1.5';
    section.appendChild(warningsDiv);

    const previewLabel = document.createElement('div');
    previewLabel.textContent = 'Preview — what players will see:';
    previewLabel.style.cssText = 'font-size:0.78em;color:#aaa;margin-bottom:3px';
    section.appendChild(previewLabel);

    const previewDiv = document.createElement('div');
    previewDiv.id = 'loreFooterPreview';
    previewDiv.style.cssText = 'font-size:0.85em;font-style:italic;color:#ccc;padding:6px;' +
        'border:1px dashed #555;border-radius:4px;background:#1c2733;white-space:pre-wrap;min-height:1.4em';
    section.appendChild(previewDiv);

    return section;
}

function createVerbButton({ verb, label, template, fowOnly, hint }, color) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.title = hint ? `${hint}\n\n!${template}` : `!${template}${fowOnly ? ' (Fog of War games only)' : ''}`;
    btn.style.cssText = `padding:3px 8px;font-size:0.78em;border:1px solid #666;border-radius:3px;` +
        `background:${color};color:#fff;cursor:pointer`;
    btn.onclick = async (e) => {
        e.preventDefault();
        const editor = loreManager.editor;
        let args = null;

        if (NUMERIC_PICKER_RANGES[verb]) {
            const n = await openNumberPicker(btn, NUMERIC_PICKER_RANGES[verb]);
            if (n == null) return;
            args = (verb === 'ac' || verb === 'so') ? `${n}` : (n > 0 ? `+${n}` : `${n}`);
        } else if (verb === 'unit' || verb === 'removeunit') {
            args = await openUnitPicker(btn, verb === 'removeunit' ? 'remove' : 'add');
            if (args == null) return;
        } else if (verb === 'token' || verb === 'removetoken') {
            args = await openTokenPicker(btn, resolveTokenScope());
            if (args == null) return;
        } else if (verb === 'swap') {
            const pair = await openSwapPicker(btn, editor);
            if (!pair) return;
            args = `${pair[0]} ${pair[1]}`;
        } else if (verb === 'tech' || verb === 'removetech') {
            args = await openTechPicker(btn, editor, { mode: verb === 'removetech' ? 'remove' : 'grant' });
            if (args == null) return;
        } else if (verb === 'cc' || verb === 'removecc') {
            const picked = await openColorPicker(btn, editor, {
                title: verb === 'cc' ? 'Place command token of…' : 'Remove command token of…',
                allowNeutral: false, allowCurrent: true
            });
            if (picked === null) return;
            args = picked; // '' = current player → bare verb
        } else if (verb === 'clearunits') {
            const picked = await openColorPicker(btn, editor, { title: 'Clear all units of…' });
            if (picked === null) return;
            args = picked;
        } else if (verb === 'settile') {
            args = await openSetTilePicker(btn, editor);
            if (args == null) return;
        } else if (verb === 'rotatehyperlane') {
            args = await openRotateHyperlanePicker(btn, editor);
            if (args == null) return;
        } else if (verb === 'sethyperlane') {
            args = await openSetHyperlanePicker(btn, editor);
            if (args == null) return;
        } else if (verb === 'addfogtile') {
            args = await openFogTilePicker(btn, editor);
            if (args == null) return;
        }

        const target = TARGET_AWARE_VERBS.has(verb) ? effectTarget : null;
        const body = args ? `${verb} ${args}`.trim() : (args === '' ? verb : template);
        insertEffectSnippet(target ? `${body} @${target}` : body);
    };
    return btn;
}

/** Token scope follows the @target redirect if set, else the selected chip. */
function resolveTokenScope() {
    if (effectTarget) return loreManager.editor.hexes[effectTarget] ? 'space' : 'planet';
    return currentRef?.kind === 'planet' ? 'planet' : 'space';
}

function getInsertTag() {
    const select = document.getElementById('loreInsertMode');
    if (!select) return '';
    if (select.value === 'accept') return 'accept:';
    if (select.value === 'reject') return 'reject:';
    if (select.value === 'bin') {
        const range = document.getElementById('loreBinRange')?.value.trim();
        return range && /^\d+(-\d+)?$/.test(range) ? `${range}:` : '';
    }
    return '';
}

function rebuildInsertModeOptions(gateType) {
    const insertRow = document.getElementById('loreInsertRow');
    if (insertRow) insertRow.style.display = gateType === 'none' ? 'none' : 'flex';

    const select = document.getElementById('loreInsertMode');
    const binInput = document.getElementById('loreBinRange');
    if (!select) return;
    const previous = select.value;
    const options = [['always', 'Always']];
    if (gateType === 'choice') {
        options.push(['accept', 'On Accept'], ['reject', 'On Reject']);
    } else if (gateType === 'roll') {
        options.push(['bin', 'Roll bin…']);
    }
    select.innerHTML = '';
    options.forEach(([value, text]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        select.appendChild(opt);
    });
    select.value = options.some(([v]) => v === previous) ? previous : 'always';
    if (binInput) binInput.style.display = (gateType === 'roll' && select.value === 'bin') ? 'inline-block' : 'none';
    select.onchange = () => {
        if (binInput) binInput.style.display = select.value === 'bin' ? 'inline-block' : 'none';
    };
}

function insertEffectSnippet(template) {
    const footerInput = document.getElementById('loreFooterText');
    if (!footerInput) return;
    const line = `${getInsertTag()}!${template}`;
    const current = footerInput.value;
    footerInput.value = current + (current && !current.endsWith('\n') ? '\n' : '') + line;
    footerInput.dispatchEvent(new Event('input', { bubbles: true }));
    footerInput.focus();
}

function appendConditionToLastEffectLine(token) {
    const footerInput = document.getElementById('loreFooterText');
    if (!footerInput) return;
    const lines = footerInput.value.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('!') && !/^!(choice|roll\s)/i.test(lines[i].trim())) {
            lines[i] = `${lines[i].trimEnd()} ${token}`;
            footerInput.value = lines.join('\n');
            footerInput.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
    }
    updateHexStatus('Conditions attach to effect lines — insert an effect first.');
}

/** Lookup data handed to validateLoreEffects (skips checks whose data isn't loaded). */
function buildValidationData() {
    const loreData = loreManager.editor.loreData;
    const data = {};
    if (loreData) {
        data.techIndex = loreData.techIndex;
        data.colorNames = loreData.colorNames;
        data.factionIds = loreData.factionIds;
        data.unitAliases = loreData.unitAliases;
    }
    const categorized = window.tokenManager?.getCategorizedTokens?.();
    if (categorized) {
        data.tokenIds = new Set();
        Object.values(categorized).forEach(cat => cat.tokens.forEach(t => data.tokenIds.add(t.id.toLowerCase())));
    }
    return data;
}

/** Refreshes gate controls, validation warnings, and the player-facing preview. */
function updateEffectsPreview() {
    const footerInput = document.getElementById('loreFooterText');
    if (!footerInput) return;
    const footerText = footerInput.value;

    syncGateControls(footerText);

    const warningsDiv = document.getElementById('loreEffectWarnings');
    if (warningsDiv) {
        const receiver = document.getElementById('loreReceiver')?.value || 'CURRENT';
        const persistance = document.getElementById('lorePersistance')?.value || 'ONCE';
        const problems = validateLoreEffects({ footerText, receiver, persistance }, {
            targetKind: currentRef?.kind || 'system',
            gameType: loreManager.editor.loreGameType || 'unknown',
            editor: loreManager.editor,
            data: buildValidationData()
        });
        if (problems.length === 0) {
            warningsDiv.style.display = 'none';
            warningsDiv.innerHTML = '';
        } else {
            warningsDiv.style.display = 'block';
            warningsDiv.textContent = '';
            problems.forEach(p => {
                const line = document.createElement('div');
                line.textContent = `⚠️ ${p}`;
                warningsDiv.appendChild(line);
            });
        }
    }

    const previewDiv = document.getElementById('loreFooterPreview');
    if (previewDiv) {
        const display = getDisplayFooter(footerText);
        previewDiv.textContent = display || '(nothing shown to players — only bot effects)';
    }
}

// ─────────────────────────────────────────── entry CRUD ───────────────────────────────────────────

function setEditorTitle(text) {
    const el = document.getElementById('loreEditorTitle');
    if (el) el.textContent = text;
}

/** Sets a select's value, appending the option if game-type filtering removed it —
 *  loading legacy data must never silently change the entry's stored value. */
function setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (!select) return;
    if (![...select.options].some(o => o.value === value)) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
    }
    select.value = value;
}

function loadEntry(index) {
    const entries = loreManager.getEntries(currentRef);
    const entry = entries[index];
    if (!entry) { startNewEntry(); return; }
    currentIndex = index;

    document.getElementById('loreLoreText').value = entry.loreText || '';
    document.getElementById('loreFooterText').value = entry.footerText || '';
    setSelectValue('loreReceiver', entry.receiver);
    setSelectValue('loreTrigger', entry.trigger);
    document.getElementById('lorePing').value = entry.ping;
    document.getElementById('lorePersistance').value = entry.persistance;
    document.getElementById('loreRounds').value = formatRoundWindow(entry.fromRound, entry.tillRound);
    document.getElementById('loreTag').value = entry.tag || '';

    setEditorTitle(`Editing ${entry.tag ? '#' + entry.tag : 'entry ' + (index + 1)} on ${targetTitle(currentRef)}`);
    hideSaveWarnings();
    refreshCountersAndPreview();
    renderEntryList();
    updateSaveButtonsState();
}

function startNewEntry() {
    currentIndex = -1;
    const isPhase = currentRef?.kind === 'phase';
    document.getElementById('loreLoreText').value = '';
    document.getElementById('loreFooterText').value = '';
    document.getElementById('loreReceiver').value = isPhase ? 'ALL' : 'CURRENT';
    document.getElementById('loreTrigger').value = isPhase ? 'PHASE_START' : 'CONTROLLED';
    document.getElementById('lorePing').value = 'NO';
    document.getElementById('lorePersistance').value = 'ONCE';
    document.getElementById('loreRounds').value = '';
    document.getElementById('loreTag').value = '';
    setEditorTitle(`New entry on ${targetTitle(currentRef)}`);
    hideSaveWarnings();
    refreshCountersAndPreview();
    renderEntryList();
    updateSaveButtonsState();
}

/** "Update"/"Delete" only ever act on an entry that's actually loaded (currentIndex >= 0) —
 *  disabling them otherwise makes it impossible to accidentally overwrite/delete nothing. */
function updateSaveButtonsState() {
    const updateBtn = document.getElementById('loreUpdateBtn');
    const deleteBtn = document.getElementById('loreDeleteBtn');
    const editing = currentIndex !== -1;
    const entries = loreManager.getEntries(currentRef);
    const entry = editing ? entries[currentIndex] : null;
    const label = entry ? (entry.tag ? `#${entry.tag}` : `entry ${currentIndex + 1}`) : '';

    if (updateBtn) {
        updateBtn.disabled = !editing;
        updateBtn.textContent = editing ? `Update ${label}` : 'Update';
        updateBtn.style.opacity = editing ? '1' : '0.5';
        updateBtn.style.cursor = editing ? 'pointer' : 'not-allowed';
    }
    if (deleteBtn) {
        deleteBtn.disabled = !editing;
        deleteBtn.style.opacity = editing ? '1' : '0.5';
        deleteBtn.style.cursor = editing ? 'pointer' : 'not-allowed';
    }
}

function refreshCountersAndPreview() {
    ['loreLoreText', 'loreFooterText'].forEach(id => {
        document.getElementById(id)?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const roundsInput = document.getElementById('loreRounds');
    roundsInput?.dispatchEvent(new Event('input', { bubbles: true }));
    updateEffectsPreview();
}

function collectEntryFromForm() {
    const roundsRaw = document.getElementById('loreRounds').value;
    const { fromRound, tillRound, warning } = parseRoundWindow(roundsRaw);
    return {
        entry: createLoreEntry({
            loreText: document.getElementById('loreLoreText').value,
            footerText: document.getElementById('loreFooterText').value,
            receiver: document.getElementById('loreReceiver').value,
            trigger: document.getElementById('loreTrigger').value,
            ping: document.getElementById('lorePing').value,
            persistance: document.getElementById('lorePersistance').value,
            fromRound, tillRound,
            tag: document.getElementById('loreTag').value.trim()
        }),
        roundsWarning: warning
    };
}

function hideSaveWarnings() {
    const div = document.getElementById('loreSaveWarnings');
    if (div) { div.style.display = 'none'; div.textContent = ''; }
}

function showSaveWarnings(warnings) {
    const div = document.getElementById('loreSaveWarnings');
    if (!div) return;
    if (!warnings.length) { hideSaveWarnings(); return; }
    div.style.display = 'block';
    div.textContent = '';
    warnings.forEach(w => {
        const line = document.createElement('div');
        line.textContent = `⚠️ ${w}`;
        div.appendChild(line);
    });
}

/** Always appends the form's content as a brand-new entry — never overwrites whatever is
 *  currently loaded, even if you were editing an existing one (auto-tags on collision). */
function saveAsNew() {
    if (!currentRef) { alert('Select a hex or phase first.'); return; }
    const { entry, roundsWarning } = collectEntryFromForm();

    const result = loreManager.addEntry(currentRef, entry);
    if (!result.ok) { alert(result.error); return; }

    const warnings = [...(roundsWarning ? [roundsWarning] : []), ...result.warnings];
    showSaveWarnings(warnings);
    updateHexStatus(`Saved new entry on ${targetTitle(currentRef)}${warnings.length ? ' (with warnings)' : ''}`);
    afterMutation();
    loadEntry(result.index);
}

/** Overwrites the currently loaded entry. Disabled (see updateSaveButtonsState) unless one is loaded. */
function updateLoadedEntry() {
    if (!currentRef) { alert('Select a hex or phase first.'); return; }
    if (currentIndex === -1) return; // button is disabled in this state; guard anyway
    const { entry, roundsWarning } = collectEntryFromForm();

    const result = loreManager.updateEntry(currentRef, currentIndex, entry);
    if (!result.ok) { alert(result.error); return; }

    const warnings = [...(roundsWarning ? [roundsWarning] : []), ...result.warnings];
    showSaveWarnings(warnings);
    currentIndex = result.index;
    updateHexStatus(`Updated entry on ${targetTitle(currentRef)}${warnings.length ? ' (with warnings)' : ''}`);
    afterMutation();
    loadEntry(currentIndex);
}

function deleteEntry() {
    if (!currentRef || currentIndex === -1) return; // button is disabled in this state; guard anyway
    if (!confirm('Delete this lore entry?')) return;
    loreManager.removeEntry(currentRef, currentIndex);
    updateHexStatus(`Deleted entry on ${targetTitle(currentRef)}`);
    afterMutation();
    const entries = loreManager.getEntries(currentRef);
    if (entries.length) loadEntry(Math.min(currentIndex, entries.length - 1));
    else startNewEntry();
}

/** Save/copy this entry to other targets (the bot's comma-separated multi-target save). */
async function copyEntryTo() {
    if (!currentRef) return;
    const { entry } = collectEntryFromForm();
    const anchor = document.getElementById('loreCopyToBtn');

    const editor = loreManager.editor;
    const items = [];
    for (const [label, hex] of Object.entries(editor.hexes || {})) {
        items.push({ value: JSON.stringify({ kind: 'system', hexLabel: label }), label: `${label} (system)` });
        (hex.planets || []).forEach((planet, i) => {
            const name = planet?.name || planet?.planetID || planet?.id;
            if (name) items.push({ value: JSON.stringify({ kind: 'planet', hexLabel: label, planetIndex: i }), label: `${name} — ${label}` });
        });
    }
    LORE_PHASE_TARGETS.forEach(phase => {
        items.push({ value: JSON.stringify({ kind: 'phase', phase }), label: `${PHASE_LABELS[phase]} phase` });
    });

    const choice = await openListPicker(anchor, items, { title: 'Copy this entry to…', width: 280 });
    if (!choice) return;
    const targetRef = JSON.parse(choice);

    const adjusted = _applyHexReplacements({ ...entry }, targetRef);
    const result = loreManager.addEntry(targetRef, adjusted);
    if (!result.ok) { alert(result.error); return; }
    updateHexStatus(`Copied entry to ${targetTitle(targetRef)}${result.warnings.length ? ' (auto-tagged)' : ''}`);
    afterMutation();
}

function copyEntry() {
    const { entry } = collectEntryFromForm();
    copiedEntry = entry;
    updateHexStatus('Copied entry to the lore clipboard.');
}

function pasteEntry() {
    if (!copiedEntry) { alert('Nothing copied yet.'); return; }
    if (!currentRef) { alert('Select a target first.'); return; }
    const adjusted = _applyHexReplacements({ ...copiedEntry }, currentRef);
    // fill the form rather than saving directly, so the GM can adjust before committing
    document.getElementById('loreLoreText').value = adjusted.loreText;
    document.getElementById('loreFooterText').value = adjusted.footerText;
    document.getElementById('loreReceiver').value = adjusted.receiver;
    if ((currentRef.kind === 'phase') !== LORE_PHASE_TRIGGERS.includes(adjusted.trigger)) {
        // pasted across target kinds: trigger can't carry over
        document.getElementById('loreTrigger').value = currentRef.kind === 'phase' ? 'PHASE_START' : 'CONTROLLED';
    } else {
        document.getElementById('loreTrigger').value = adjusted.trigger;
    }
    document.getElementById('lorePing').value = adjusted.ping;
    document.getElementById('lorePersistance').value = adjusted.persistance;
    document.getElementById('loreRounds').value = formatRoundWindow(adjusted.fromRound, adjusted.tillRound);
    document.getElementById('loreTag').value = adjusted.tag || '';
    refreshCountersAndPreview();
    updateHexStatus('Pasted entry into the editor — click Save as New to commit.');
}

/** Rewrites tile_name:/planet: footer references when an entry moves to another target. */
function _applyHexReplacements(loreData, targetRef) {
    if (!loreData.footerText?.includes('tile_name:') || targetRef.kind === 'phase') return loreData;
    const targetHex = loreManager.editor.hexes[targetRef.hexLabel];
    if (!targetHex) return loreData;
    loreData.footerText = loreData.footerText.replace(/tile_name:\w+/g, `tile_name:${targetHex.label}`);
    if (targetRef.kind === 'planet') {
        const planet = targetHex.planets?.[targetRef.planetIndex];
        if (planet) {
            const pName = (planet.name || planet.planetID || planet.id || '').replace(/\s+/g, '');
            if (pName) loreData.footerText = loreData.footerText.replace(/planet:\w+/g, `planet:${pName}`);
        }
    }
    return loreData;
}

function afterMutation() {
    renderEntryList();
    if (currentRef?.hexLabel) renderChipBar(loreManager.editor.hexes[currentRef.hexLabel]);
    highlightSelection();
    loreManager.editor.loreOverlay?.refresh();
}

// ─────────────────────────────────────────── overview ───────────────────────────────────────────

function showLoreOverview() {
    const existing = document.getElementById('loreOverviewPopup');
    if (existing) existing.remove();

    const content = document.createElement('div');
    content.style.cssText = 'max-height:65vh;overflow-y:auto';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85em;color:#ddd';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Target', 'Tag', 'Trigger', 'Receiver', 'Rounds', 'Text'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        th.style.cssText = 'text-align:left;padding:4px 8px;border-bottom:1px solid #666;color:#9b59b6;position:sticky;top:0;background:#2c3e50';
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');

    const addRow = (targetText, ref, entryIndex, entry) => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'cursor:pointer';
        tr.onmouseover = () => tr.style.backgroundColor = '#34495e';
        tr.onmouseout = () => tr.style.backgroundColor = 'transparent';
        const cells = [
            targetText,
            entry.tag ? `#${entry.tag}` : '—',
            entry.trigger,
            entry.receiver,
            formatRoundWindow(entry.fromRound, entry.tillRound) || '—',
            (entry.loreText || '').slice(0, 50) + ((entry.loreText || '').length > 50 ? '…' : '')
        ];
        cells.forEach(text => {
            const td = document.createElement('td');
            td.textContent = text;
            td.style.cssText = 'padding:4px 8px;border-bottom:1px solid #444';
            tr.appendChild(td);
        });
        tr.onclick = () => {
            if (ref.kind === 'phase') selectPhase(ref.phase);
            else {
                selectHex(ref.hexLabel);
                selectTarget(ref);
            }
            loadEntry(entryIndex);
        };
        tbody.appendChild(tr);
    };

    let total = 0;
    for (const info of loreManager.getHexesWithLore()) {
        info.systemEntries.forEach((entry, i) => {
            addRow(`${info.label} (system)`, { kind: 'system', hexLabel: info.label }, i, entry);
            total++;
        });
        for (const [idx, list] of Object.entries(info.planetEntries)) {
            const planet = loreManager.editor.hexes[info.label]?.planets?.[idx];
            const name = planet?.name || planet?.planetID || planet?.id || `planet ${Number(idx) + 1}`;
            list.forEach((entry, i) => {
                addRow(`${name} — ${info.label}`, { kind: 'planet', hexLabel: info.label, planetIndex: Number(idx) }, i, entry);
                total++;
            });
        }
    }
    for (const [phase, list] of Object.entries(loreManager.getPhaseLoreSummary())) {
        list.forEach((entry, i) => {
            addRow(`${PHASE_LABELS[phase]} phase`, { kind: 'phase', phase }, i, entry);
            total++;
        });
    }

    table.appendChild(tbody);
    if (total === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No lore entries on this map yet.';
        empty.style.cssText = 'color:#888;font-style:italic';
        content.appendChild(empty);
    } else {
        content.appendChild(table);
    }

    showPopup({
        id: 'loreOverviewPopup',
        className: 'popup-ui popup-ui-info',
        title: `Lore Overview (${total} entries)`,
        content,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        style: {
            minWidth: '520px',
            maxWidth: '800px',
            maxHeight: '75vh',
            border: '2px solid var(--popup-border-lore)'
        }
    });
}

// ─────────────────────────────────────────── bottom actions ───────────────────────────────────────────

function createActionButtonsSection() {
    const section = document.createElement('div');
    section.style.cssText = 'border-top:1px solid #555;padding-top:14px;display:flex;gap:8px;flex-wrap:wrap';

    const mk = (text, border, bg, fg, title, onClick) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.title = title;
        btn.style.cssText = `padding:8px 16px;border:1px solid ${border};border-radius:4px;background:${bg};color:${fg};cursor:pointer`;
        btn.onclick = onClick;
        return btn;
    };

    section.appendChild(mk('Export Lore', '#27ae60', '#27ae60', '#fff',
        'Downloads all lore (systems, planets, phases) as a JSON file.', () => exportLore()));
    section.appendChild(mk('Import Lore', '#f39c12', '#f39c12', '#fff',
        'Loads lore from a JSON file exported here.', () => importLore()));
    section.appendChild(mk('Export Lore (Bot format)', '#27ae60', '#2c3e50', '#27ae60',
        'Downloads the bot\'s 9-field wire format (with #tags, rounds, and phase targets) for the bot\'s GM Lore Import-from-URL.',
        () => exportLoreBotFormat()));
    section.appendChild(mk('Import Lore (Bot format)', '#f39c12', '#2c3e50', '#f39c12',
        'Loads lore from the bot\'s wire format text (7- or 9-field entries).', () => importLoreBotFormat()));
    section.appendChild(mk('Clear All Lore', '#e74c3c', '#e74c3c', '#fff',
        'Removes every lore entry on the map, including phase lore.', () => clearAllLore()));

    return section;
}

function exportLore() {
    const loreData = loreManager.exportLore();
    const jsonString = JSON.stringify(loreData, null, 2);
    downloadFile(jsonString, 'lore_data.json', 'application/json');
    updateHexStatus('Lore data exported');
}

function importLore() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const loreData = JSON.parse(event.target.result);
                const importedCount = loreManager.importLore(loreData);
                updateHexStatus(`Imported lore data for ${importedCount} targets`);
                refreshAfterBulkImport();
            } catch (error) {
                alert('Failed to import lore data: ' + error.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportLoreBotFormat() {
    const wireString = loreManager.exportWireFormat();
    if (!wireString) {
        alert('No lore data to export');
        return;
    }
    downloadFile(wireString, 'lore_data_bot.txt', 'text/plain');
    updateHexStatus('Lore data exported in bot format');
}

function importLoreBotFormat() {
    const wireString = prompt(
        'Paste the bot\'s lore wire format below.\n' +
        'Format: target;loreText;footerText;receiver;trigger;ping;persistance[;fromRound;tillRound], entries separated by "|".\n' +
        'Targets: tile positions (104), planet identifiers, or phases (strategy/action/status/agenda); "#Tag" suffixes are kept.'
    );
    if (wireString === null) return;

    const result = loreManager.importWireFormat(wireString);
    let message = `Imported ${result.systemCount} system + ${result.planetCount} planet + ${result.phaseCount} phase entries`;
    if (result.skipped.length > 0) {
        message += ` (${result.skipped.length} skipped)`;
        console.warn('Lore import skipped entries:', result.skipped);
    }
    updateHexStatus(message);
    refreshAfterBulkImport();
}

function clearAllLore() {
    if (confirm('Are you sure you want to clear ALL lore data from the map (including phase lore)? This cannot be undone.')) {
        const clearedCount = loreManager.clearAllLore();
        updateHexStatus(`Cleared lore from ${clearedCount} targets`);
        refreshAfterBulkImport();
    }
}

function refreshAfterBulkImport() {
    loreManager.editor.loreOverlay?.refresh();
    const currentHex = document.getElementById('hexLabelInput')?.value.trim();
    if (currentRef?.kind === 'phase') selectPhase(currentRef.phase);
    else if (currentHex) selectHex(currentHex);
}

function downloadFile(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────── help ───────────────────────────────────────────

function showLoreHelp() {
    showPopup({
        id: 'loreHelpPopup',
        className: 'popup-ui popup-ui-info',
        title: 'Lore Module Help',
        content: `
            <div style="line-height:1.6;font-size:13px">

                <h4 style="color:#9b59b6;margin-top:0">Overview</h4>
                <p style="margin-top:0">
                    The Lore Module attaches narrative text and bot commands to <strong>systems, planets, and
                    game phases</strong>. The AsyncTI4 bot delivers each entry when its trigger fires (a system is
                    activated, a planet is controlled, a phase begins…). A target can hold <strong>many entries</strong>,
                    told apart by their <em>#tags</em>.
                </p>

                <h4 style="color:#9b59b6">Workflow</h4>
                <ol style="margin-top:0;padding-left:18px">
                    <li><strong>Pick a target</strong> — type a hex label (or use the toolbar's <em>Add Lore…</em> map-pick
                        mode), then click the <em>System</em> or a planet chip. Or click a <em>Phase</em> button
                        (Strategy/Action/Status/Agenda) for phase lore — no hex needed.</li>
                    <li><strong>Pick or add an entry</strong> in the left-hand list. Each row shows its tag, trigger,
                        receiver, round window, and gate.</li>
                    <li><strong>Edit</strong> on the right: lore text, footer (flavor + effects), trigger/receiver/
                        ping/persistence, a <em>Rounds</em> window (<code>3</code>, <code>2-5</code>, <code>4-</code>,
                        <code>-6</code>, blank = always), and a <em>Tag</em>.</li>
                    <li><strong>Save as New</strong> to add it (always creates a new entry, auto-tagging on
                        collision — it never overwrites what's loaded); once an entry is loaded, <strong>Update</strong>
                        becomes enabled to overwrite that specific entry instead. Warnings (the same ones the bot
                        would emit) appear underneath.</li>
                </ol>

                <h4 style="color:#9b59b6">Game type</h4>
                <p style="margin-top:0">
                    Set <em>Game type</em> (top left) to match the target game: Fog of War games can use
                    <code>ADJACENT</code>/<code>GM</code> receivers, GM pings, and fog-tile effects; normal games
                    (with the <code>lore_mode</code> toggle) use the <code>CARDS</code> private-thread receiver
                    instead. The editor hides what doesn't apply.
                </p>

                <h4 style="color:#9b59b6">Phase lore</h4>
                <p style="margin-top:0">
                    Phase entries fire on <em>Phase begins/ends</em> — there is no acting player and no home system,
                    so use receiver <code>ALL</code> (or <code>GM</code> for map-effects-only), give map effects an
                    explicit color, and point tile-bound effects somewhere with the 🎯 <code>@target</code> button.
                    The warnings list flags all of these footguns.
                </p>

                <h4 style="color:#9b59b6">Effects (bot commands)</h4>
                <p style="margin-top:0">
                    Footer lines starting with <code>!</code> are machine effects, never shown to players; the
                    <strong>Preview</strong> box shows exactly what players will see. Buttons insert correctly-shaped
                    lines, with pickers for amounts, units, tokens, techs (specific / random draw / player's choice),
                    command tokens, and tiles/hyperlanes (set/swap/rotate).
                </p>
                <ul style="margin-top:0;padding-left:18px">
                    <li><strong>🎯 Target</strong> — redirect unit/token/cc/fog-sighting effects at another system or
                        planet (<code>@target</code>).</li>
                    <li><strong>❓ Condition</strong> — appends <code>?red</code> / <code>?!faction:winnu</code> /
                        <code>?round:3-</code> to the last effect line: the line only fires for players matching ALL
                        of its conditions. "Else" = another line with the negated condition.</li>
                </ul>
                <p style="margin-top:0">
                    <strong>Fog sighting effects</strong> (Fog of War games only) never touch the shared board — they
                    only override what <em>one receiving player's client</em> shows for a position that's still fogged
                    to them: <em>Set Fog Sighting</em> plants a tile ID (real or a decoy) as what that player currently
                    believes is there; <em>Clear Fog Sighting</em> wipes it back to plain unknown fog. Useful for lore
                    that "plants false intel" or "reveals a hint" to one player without changing anyone else's view.
                </p>

                <h4 style="color:#9b59b6">Gates: choice &amp; dice roll</h4>
                <p style="margin-top:0">
                    The <em>Gate</em> row manages a whole-entry gate: <strong>Accept/Reject</strong> (adds
                    <code>!choice</code>) or a <strong>Dice roll</strong> (adds <code>!roll NdM</code>). Either way, a
                    <em>"New effects insert as…"</em> row appears right under the Gate controls — set it to
                    <em>On Accept/On Reject</em>, or for rolls, <em>Roll bin…</em> plus a range like <code>2-10</code>
                    — then click effect buttons below as normal; the line fires when the rolled total lands in the
                    bin (first matching bin wins, untagged lines always fire). A numeric prefix like <code>3:</code>
                    is ONLY treated as a bin while a <code>!roll</code> marker exists — otherwise it stays flavor text.
                </p>

                <h4 style="color:#9b59b6">Entry list, tags &amp; copy</h4>
                <p style="margin-top:0">
                    Multiple entries on one target need distinct tags (letters+digits); saving a colliding entry
                    auto-tags it. <em>Save as New</em> always adds the form's content as another entry — it never
                    overwrites what's loaded; <em>Update</em> (enabled once an entry is loaded) overwrites that one
                    specific entry. <em>Copy to…</em> saves the entry onto any other system/planet/phase (footer
                    <code>tile_name:</code>/<code>planet:</code> references are rewritten); <em>Copy</em>/<em>Paste</em>
                    move an entry through the editor clipboard.
                </p>

                <h4 style="color:#9b59b6">Overview &amp; map overlay</h4>
                <p style="margin-top:0">
                    <strong>📋 Overview</strong> lists every entry on the map — click a row to jump to it.
                    The map overlay (toggle <em>Lore Indicators</em> in the Overlays panel) marks hexes with lore:
                    🟢 book = system, 🟠 scroll = planet, 🟣 star = both, with an <strong>×N badge</strong> for
                    multiple entries. Hover for the full tooltip (every entry + per-entry Copy); Ctrl+click a hex
                    to paste the overlay clipboard. Phase lore shows as a corner banner while the overlay is on.
                </p>

                <h4 style="color:#9b59b6">Export / Import</h4>
                <p style="margin-top:0">
                    <em>Export/Import Lore</em> moves everything as JSON (systems, planets, phases, game type).
                    <em>Export Lore (Bot format)</em> writes the bot's 9-field wire format —
                    <code>target;loreText;footerText;receiver;trigger;ping;persistance;fromRound;tillRound</code>
                    joined by <code>|</code>, with <code>#Tag</code> targets and phase targets — ready for the bot's
                    GM <em>Import from URL</em>. Import accepts old 7-field entries too. The <strong>AsyncTI4 mapinfo
                    export/import is now also full-fidelity</strong>: every entry per target (with round windows)
                    plus all phase lore rides along in the normal map save and mapinfo file, validated the same way
                    a modal save is on the bot side — either export path carries everything. Bot-assigned
                    <code>#Tag</code>s are re-generated on import either way, so don't treat them as stable IDs.
                </p>

                <p style="color:#888;font-size:0.85em">
                    Note: lore edits on hexes are undo-able (Ctrl+Z); phase lore isn't undo-tracked yet.
                </p>
            </div>
        `,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        style: {
            minWidth: '460px',
            maxWidth: '640px',
            maxHeight: '80vh',
            overflowY: 'auto',
            border: '2px solid var(--popup-border-lore)'
        }
    });
}
