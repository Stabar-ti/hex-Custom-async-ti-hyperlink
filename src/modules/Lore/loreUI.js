/**
 * Lore Module UI — master-detail editor for system / planet / phase lore.
 *
 * Layout: a target bar (hex pick + chips per system/planet + a phase strip), an entry
 * list on the left (a target holds MANY entries, distinguished by #tags), and a single
 * entry editor on the right (text, the structured footer from loreEffectRows, and
 * trigger/receiver/rounds/tag).
 *
 * The form no longer owns its values: everything lives in loreState, which is what makes
 * unsaved work detectable. Switching entry or target commits first instead of silently
 * discarding, which is the bug this replaced.
 *
 * Entry points are real functions, not DOM ids: openLoreEditor(ref, entryIndex) and
 * showLorePopup(), both also on window. The toolbar's "Add Lore…" button and the map overlay
 * call those; the hex-label input is now just a convenience for typing a label directly.
 */

import { showPopup, hidePopup } from '../../ui/popupUI.js';
import { planetDisplayName } from '../../draw/hexAnchors.js';
import {
    LoreManager, LORE_RECEIVERS, LORE_TRIGGERS, LORE_PINGS, LORE_PERSISTANCE,
    LORE_RECEIVER_LABELS, LORE_TRIGGER_LABELS, LORE_PERSISTANCE_LABELS,
    LORE_PHASE_TARGETS, LORE_PHASE_TRIGGERS, LORE_TEXT_LIMIT,
    LORE_FOW_ONLY_RECEIVERS, LORE_NON_FOW_ONLY_RECEIVERS,
    parseRoundWindow, formatRoundWindow, validateTag, isNonEmptyLoreEntry
} from './loreCore.js';
import { getGate, retargetFooterReferences } from './loreEffects.js';
import { checkAllFooters } from './loreFooterModel.js';
import * as state from './loreState.js';
import * as effectRows from './loreEffectRows.js';
import { openListPicker } from './loreEffectPickers.js';
import { armLoreMapPick, disarmLoreMapPick } from './loreMapPick.js';

// The popup remembers its size, and the pre-rework layout was much narrower. Clear that one
// stored value once so the effect rows aren't squeezed into a column on first open.
const LAYOUT_VERSION_KEY = 'lore-ui-layout-version';
const LAYOUT_VERSION = '2';

const PHASE_LABELS = { strategy: 'Strategy', action: 'Action', status: 'Status', agenda: 'Agenda' };

let loreManager = null;

export function installLoreUI(editor) {
    loreManager = new LoreManager(editor);
    try {
        if (localStorage.getItem(LAYOUT_VERSION_KEY) !== LAYOUT_VERSION) {
            localStorage.removeItem('popup-pos-lorePopup');
            localStorage.setItem(LAYOUT_VERSION_KEY, LAYOUT_VERSION);
        }
    } catch { /* private mode / storage disabled — the popup just uses its default size */ }
    // Any change to the draft re-renders the effect rows and the dirty indicator. The form
    // fields are NOT rewritten here — that would fight the cursor while typing.
    state.subscribe(() => {
        effectRows.refresh();
        updateDirtyUI();
    });
    window.loreManager = loreManager;
    window.showLorePopup = showLorePopup;
    window.openLorePopupAtPhase = openLorePopupAtPhase;
    window.openLoreEditor = openLoreEditor;
    // Dev guard: verifies every footer on the map survives a structured round-trip.
    window.__loreCheckAllFooters = () => checkAllFooters(loreManager.editor);
}

/** Open the editor on a specific target, optionally focused on one entry. */
export function openLoreEditor(ref, entryIndex = null) {
    showLorePopup();
    if (!ref) return;
    selectTarget(ref);
    if (entryIndex != null) loadEntry(entryIndex);
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
        onHelp: () => showLoreHelp(),
        onClose: () => {
            // Commit before the popup goes away, or closing it would be another silent
            // way to lose work. Then release the map so hex clicks paint again.
            commitIfDirty();
            disarmLoreMapPick(loreManager.editor);
        }
    });

    applyMapPicking(mapPickPreference());

    // restore state if the popup was reopened mid-session
    if (state.getRef()?.hexLabel) selectHex(state.getRef().hexLabel);
    else if (state.getRef()?.kind === 'phase') selectPhase(state.getRef().phase);
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
        effectRows.refresh();   // game type gates which effect verbs are offered
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

    // Map picking is the primary way in, so it's on by default while the popup is open.
    // It's a visible toggle because it claims hex clicks — painting sectors with the popup
    // open has to stay possible.
    const pickLabel = document.createElement('label');
    pickLabel.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:0.8em;color:#ccc;cursor:pointer';
    pickLabel.title = 'Click a hex on the map to edit its lore. Right-click a hex to pick one of its planets.';
    const pickToggle = document.createElement('input');
    pickToggle.type = 'checkbox';
    pickToggle.id = 'loreMapPickToggle';
    pickToggle.checked = mapPickPreference();
    pickToggle.onchange = () => {
        setMapPickPreference(pickToggle.checked);
        applyMapPicking(pickToggle.checked);
    };
    pickLabel.appendChild(pickToggle);
    pickLabel.appendChild(document.createTextNode('🎯 Pick from map'));
    row.appendChild(pickLabel);

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

const MAP_PICK_KEY = 'lore-map-pick';

function mapPickPreference() {
    try { return localStorage.getItem(MAP_PICK_KEY) !== 'off'; } catch { return true; }
}

function setMapPickPreference(on) {
    try { localStorage.setItem(MAP_PICK_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

/** Arm or disarm hex picking for the open popup. */
function applyMapPicking(on) {
    if (on) {
        armLoreMapPick(loreManager.editor, { onPick: (ref) => openLoreEditor(ref) });
    } else {
        disarmLoreMapPick(loreManager.editor);
    }
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
    if (!(state.getRef() && state.getRef().hexLabel === hexLabel && state.getRef().kind === 'planet'
        && state.getRef().planetIndex < (hex.planets?.length || 0))) {
        state.setTarget({ kind: 'system', hexLabel });
    }
    selectTarget(state.getRef());
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
    return `${ref.hexLabel} — ${planetDisplayName(planet, ref.planetIndex)}`;
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
        const name = planetDisplayName(planet, i);
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
    if (!state.getRef()) return;
    let el = null;
    if (state.getRef().kind === 'phase') el = document.getElementById(`lorePhaseBtn_${state.getRef().phase}`);
    else if (state.getRef().kind === 'system') el = document.getElementById('loreChip_system');
    else el = document.getElementById(`loreChip_planet${state.getRef().planetIndex}`);
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
    // Commit before switching target, for the same reason as switching entry: the old code
    // moved on and whatever was typed went with it.
    if (!commitIfDirty()) return;
    state.setTarget(ref);

    const main = document.getElementById('loreMain');
    if (main) main.style.display = 'flex';
    highlightSelection();
    updateTriggerOptions();
    updateReceiverOptions();
    renderEntryList();

    const entries = loreManager.getEntries(state.getRef());
    if (entries.length) loadEntry(0);
    else startNewEntry();
}

function entrySummaryLine(entry) {
    const bits = [];
    bits.push(entry.tag ? `#${entry.tag}` : '(untagged)');
    bits.push(LORE_TRIGGER_LABELS[entry.trigger] || entry.trigger);
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
    if (!pane || !state.getRef()) return;
    pane.innerHTML = '';

    const heading = document.createElement('div');
    heading.textContent = targetTitle(state.getRef());
    heading.style.cssText = 'font-weight:bold;color:#9b59b6;font-size:0.9em;margin-bottom:2px';
    pane.appendChild(heading);

    const entries = loreManager.getEntries(state.getRef());
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
            (i === state.getIndex() ? '#9b59b6' : '#555') + ';border-radius:4px;background:' +
            (i === state.getIndex() ? '#3d2a52' : '#34495e') + ';color:#ddd;cursor:pointer';
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
    wireTextLimit(loreTextArea, loreCounter, LORE_TEXT_LIMIT,
        () => state.patchDraft({ loreText: loreTextArea.value }));

    // Footer: flavour + gate + structured effect rows (replaces the raw footer textarea)
    form.appendChild(effectRows.createFooterSection({
        editor: loreManager.editor,
        buildValidationData
    }));

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

    // Errors and warnings from the manager, shown inline instead of via alert()
    const errorBand = document.createElement('div');
    errorBand.id = 'loreErrorBand';
    errorBand.className = 'lore-error-band';
    errorBand.style.display = 'none';
    form.appendChild(errorBand);

    const saveWarnings = document.createElement('div');
    saveWarnings.id = 'loreSaveWarnings';
    saveWarnings.style.cssText = 'display:none;font-size:0.8em;color:#f39c12;margin-top:8px;line-height:1.5';
    form.appendChild(saveWarnings);

    // Save row. "Save as New" and "Update" only ever differed by which index they wrote to —
    // something the entry list already shows — so they collapse into one Save, with the
    // duplicate-an-entry intent moved to the ⋯ menu.
    const buttonRow = document.createElement('div');
    buttonRow.className = 'lore-save-row';
    buttonRow.style.cssText = 'margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    buttonRow.appendChild(mkButton('loreSaveBtn', 'Save', '#27ae60', () => saveEntry()));
    buttonRow.appendChild(mkButton('loreRevertBtn', 'Revert', '#7f8c8d', () => revertEntry()));
    const moreBtn = mkButton('loreMoreBtn', '⋯', '#6c3483', (e) => openEntryMenu(e.currentTarget));
    moreBtn.title = 'Duplicate · Copy · Paste · Copy to… · Delete';
    buttonRow.appendChild(moreBtn);

    const dirtyPill = document.createElement('span');
    dirtyPill.id = 'loreDirtyPill';
    dirtyPill.className = 'lore-dirty-pill';
    dirtyPill.textContent = '● Unsaved';
    dirtyPill.style.display = 'none';
    buttonRow.appendChild(dirtyPill);
    form.appendChild(buttonRow);

    wireFormFields();
    return form;
}

/** Every field writes straight into the draft, so the store always knows what's unsaved. */
function wireFormFields() {
    setTimeout(() => {
        const bind = (id, read) => {
            const node = document.getElementById(id);
            if (node) node.addEventListener('change', () => state.patchDraft(read(node)));
        };
        bind('loreReceiver', n => ({ receiver: n.value }));
        bind('loreTrigger', n => ({ trigger: n.value }));
        bind('lorePing', n => ({ ping: n.value }));
        bind('lorePersistance', n => ({ persistance: n.value }));
        bind('loreTag', n => ({ tag: n.value.trim() }));
        bind('loreRounds', n => {
            const { fromRound, tillRound } = parseRoundWindow(n.value);
            return { fromRound, tillRound };
        });
    }, 0);
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
    if (!select || !state.getRef()) return;
    const isPhase = state.getRef().kind === 'phase';
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

/** Push the draft into the form controls. Only on load/new/revert — never while typing. */
function renderFormFromState() {
    const draft = state.getDraft();
    if (!draft) return;
    const set = (id, value) => { const n = document.getElementById(id); if (n) n.value = value; };
    set('loreLoreText', draft.loreText || '');
    setSelectValue('loreReceiver', draft.receiver);
    setSelectValue('loreTrigger', draft.trigger);
    set('lorePing', draft.ping);
    set('lorePersistance', draft.persistance);
    set('loreRounds', formatRoundWindow(draft.fromRound, draft.tillRound));
    set('loreTag', draft.tag || '');

    const index = state.getIndex();
    setEditorTitle(index === -1
        ? `New entry on ${targetTitle(state.getRef())}`
        : `Editing ${draft.tag ? '#' + draft.tag : 'entry ' + (index + 1)} on ${targetTitle(state.getRef())}`);

    document.getElementById('loreLoreTextCounter')
        ?.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('loreLoreText')
        ?.dispatchEvent(new Event('input', { bubbles: true }));
    effectRows.refresh();
    updateDirtyUI();
}

/**
 * Commit whatever is open before moving away. This is the fix for the old behaviour, where
 * loadEntry() simply overwrote the form and any unsaved typing vanished without a word.
 * Returns false when a hard validation error blocks the move.
 */
function commitIfDirty() {
    if (!state.isDirty() || !state.getDraft()) return true;
    return saveEntry({ silent: true });
}

function loadEntry(index) {
    if (!commitIfDirty()) return;
    const entries = loreManager.getEntries(state.getRef());
    const entry = entries[index];
    if (!entry) { startNewEntry(); return; }
    state.loadEntry(index, entry);
    hideSaveWarnings();
    hideError();
    renderFormFromState();
    renderEntryList();
}

function startNewEntry() {
    if (!commitIfDirty()) return;
    const isPhase = state.getRef()?.kind === 'phase';
    state.startNew({
        receiver: isPhase ? 'ALL' : 'CURRENT',
        trigger: isPhase ? 'PHASE_START' : 'CONTROLLED'
    });
    hideSaveWarnings();
    hideError();
    renderFormFromState();
    renderEntryList();
}

/** The dirty pill and the Save/Revert enablement, driven by the store. */
function updateDirtyUI() {
    const dirty = state.isDirty();
    const pill = document.getElementById('loreDirtyPill');
    if (pill) pill.style.display = dirty ? 'inline-block' : 'none';

    const saveBtn = document.getElementById('loreSaveBtn');
    if (saveBtn) {
        saveBtn.textContent = state.getIndex() === -1 ? 'Create entry' : 'Save';
        saveBtn.disabled = !dirty;
        saveBtn.style.opacity = dirty ? '1' : '0.5';
        saveBtn.style.cursor = dirty ? 'pointer' : 'not-allowed';
    }
    const revertBtn = document.getElementById('loreRevertBtn');
    if (revertBtn) {
        revertBtn.disabled = !dirty;
        revertBtn.style.opacity = dirty ? '1' : '0.5';
        revertBtn.style.cursor = dirty ? 'pointer' : 'not-allowed';
    }
}

function hideError() {
    const band = document.getElementById('loreErrorBand');
    if (band) { band.style.display = 'none'; band.textContent = ''; }
}

/** Errors are shown in place. The old UI used alert(), which the rest of the app never does. */
function showError(message) {
    const band = document.getElementById('loreErrorBand');
    if (!band) return;
    band.style.display = 'block';
    band.textContent = message;
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

/**
 * One save path. Creates when nothing is loaded, updates otherwise — the distinction the old
 * "Save as New" / "Update" pair encoded is already visible in the entry list.
 */
function saveEntry({ silent = false } = {}) {
    const ref = state.getRef();
    const entry = state.entryToSave();
    if (!ref || !entry) { showError('Select a hex or phase first.'); return false; }

    const roundsWarning = parseRoundWindow(
        document.getElementById('loreRounds')?.value || '').warning;

    const index = state.getIndex();
    const result = index === -1
        ? loreManager.addEntry(ref, entry)
        : loreManager.updateEntry(ref, index, entry);

    if (!result.ok) { showError(result.error); return false; }
    hideError();

    const saved = loreManager.getEntries(ref)[result.index];
    state.markSaved(result.index, saved);

    const warnings = [...(roundsWarning ? [roundsWarning] : []), ...result.warnings];
    showSaveWarnings(warnings);
    if (!silent) {
        updateHexStatus(`Saved on ${targetTitle(ref)}${warnings.length ? ' (with warnings)' : ''}`);
    }
    afterMutation();
    renderFormFromState();
    return true;
}

function revertEntry() {
    state.revert();
    hideError();
    hideSaveWarnings();
    renderFormFromState();
}

function deleteEntry() {
    const ref = state.getRef();
    const index = state.getIndex();
    if (!ref || index === -1) return;
    loreManager.removeEntry(ref, index);
    updateHexStatus(`Deleted entry on ${targetTitle(ref)}`);
    afterMutation();
    const entries = loreManager.getEntries(ref);
    // The draft is gone, so nothing is dirty — load directly rather than via loadEntry,
    // which would try to commit a draft that no longer has a home.
    if (entries.length) {
        const next = Math.min(index, entries.length - 1);
        state.loadEntry(next, entries[next]);
    } else {
        state.startNew({
            receiver: ref.kind === 'phase' ? 'ALL' : 'CURRENT',
            trigger: ref.kind === 'phase' ? 'PHASE_START' : 'CONTROLLED'
        });
    }
    hideError();
    renderFormFromState();
    renderEntryList();
}

/** Duplicate / Copy / Paste / Copy to… / Delete, moved off the button row into one menu. */
async function openEntryMenu(anchor) {
    const hasEntry = state.getIndex() !== -1;
    const items = [{ value: 'copy', label: 'Copy' }];
    if (state.hasClipboard()) items.push({ value: 'paste', label: 'Paste into this form' });
    items.push({ value: 'copyto', label: 'Copy to…' });
    if (hasEntry) {
        items.unshift({ value: 'duplicate', label: 'Duplicate' });
        items.push({ value: 'delete', label: 'Delete this entry' });
    }

    const choice = await openListPicker(anchor, items,
        { title: 'Entry actions', searchable: false, width: 220 });
    if (!choice) return;
    if (choice === 'duplicate') duplicateEntry();
    else if (choice === 'copy') copyEntry();
    else if (choice === 'paste') pasteEntry();
    else if (choice === 'copyto') copyEntryTo();
    else if (choice === 'delete') confirmDelete();
}

/** Two-step inline confirm, replacing confirm(). */
function confirmDelete() {
    const band = document.getElementById('loreErrorBand');
    if (!band) { deleteEntry(); return; }
    band.style.display = 'block';
    band.textContent = 'Delete this entry? ';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'lore-inline-prompt__btn';
    yes.textContent = 'Delete';
    yes.onclick = () => { hideError(); deleteEntry(); };
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'lore-inline-prompt__btn';
    no.textContent = 'Cancel';
    no.onclick = () => hideError();
    band.append(yes, no);
}

/** Clone the loaded entry as a new one; LoreManager auto-tags on collision. */
function duplicateEntry() {
    const ref = state.getRef();
    const entry = state.entryToSave();
    if (!ref || !entry) return;
    const result = loreManager.addEntry(ref, entry);
    if (!result.ok) { showError(result.error); return; }
    afterMutation();
    const saved = loreManager.getEntries(ref)[result.index];
    state.loadEntry(result.index, saved);
    updateHexStatus(`Duplicated as ${saved.tag ? '#' + saved.tag : 'entry ' + (result.index + 1)}`);
    renderFormFromState();
    renderEntryList();
}

/** Save/copy this entry to other targets (the bot's comma-separated multi-target save). */
async function copyEntryTo() {
    const ref = state.getRef();
    const entry = state.entryToSave();
    if (!ref || !entry) return;
    const anchor = document.getElementById('loreMoreBtn');

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
    if (!result.ok) { showError(result.error); return; }
    updateHexStatus(`Copied entry to ${targetTitle(targetRef)}${result.warnings.length ? ' (auto-tagged)' : ''}`);
    afterMutation();
}

function copyEntry() {
    const entry = state.entryToSave();
    if (!entry) return;
    state.setClipboard(entry);
    updateHexStatus('Copied entry to the lore clipboard.');
}

function pasteEntry() {
    const clip = state.getClipboard();
    const ref = state.getRef();
    if (!clip) { showError('Nothing copied yet.'); return; }
    if (!ref) { showError('Select a target first.'); return; }

    const adjusted = _applyHexReplacements(clip, ref);
    // A pasted trigger can't carry across target kinds — phase lore needs a phase trigger.
    if ((ref.kind === 'phase') !== LORE_PHASE_TRIGGERS.includes(adjusted.trigger)) {
        adjusted.trigger = ref.kind === 'phase' ? 'PHASE_START' : 'CONTROLLED';
    }
    // Fill the form rather than saving, so the GM can adjust before committing.
    state.patchDraft(adjusted);
    renderFormFromState();
    updateHexStatus('Pasted into the editor — Save to commit.');
}

/** Rewrites tile_name:/planet: footer references when an entry moves to another target. */
function _applyHexReplacements(loreData, targetRef) {
    if (targetRef.kind === 'phase') return loreData;
    const targetHex = loreManager.editor.hexes[targetRef.hexLabel];
    if (!targetHex) return loreData;
    const planetIndex = targetRef.kind === 'planet' ? targetRef.planetIndex : null;
    loreData.footerText = retargetFooterReferences(loreData.footerText, targetHex, planetIndex);
    return loreData;
}

function afterMutation() {
    renderEntryList();
    if (state.getRef()?.hexLabel) renderChipBar(loreManager.editor.hexes[state.getRef().hexLabel]);
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

    const mk = (text, border, bg, fg, title, onClick, id) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.title = title;
        if (id) btn.id = id;
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
        'Removes every lore entry on the map, including phase lore.', () => clearAllLore(),
        'loreClearAllBtn'));

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
                showError('Failed to import lore data: ' + error.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportLoreBotFormat() {
    const wireString = loreManager.exportWireFormat();
    if (!wireString) {
        updateHexStatus('No lore data to export.');
        return;
    }
    downloadFile(wireString, 'lore_data_bot.txt', 'text/plain');
    updateHexStatus('Lore data exported in bot format');
}

/**
 * A real popup with a textarea, not prompt(). A wire-format dump is routinely thousands of
 * characters and browsers truncate what prompt() accepts, so long pastes were being silently
 * cut off before they ever reached the parser.
 */
function importLoreBotFormat() {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:520px';

    const help = document.createElement('div');
    help.style.cssText = 'font-size:0.82em;color:#aaa;line-height:1.5';
    help.textContent = 'Paste the bot\'s lore wire format. Fields are separated by ";" and entries by "|": '
        + 'target;loreText;footerText;receiver;trigger;ping;persistance[;fromRound;tillRound]. '
        + 'Targets are tile positions (104), planet identifiers, or phases '
        + '(strategy/action/status/agenda); "#Tag" suffixes are kept.';
    body.appendChild(help);

    const area = document.createElement('textarea');
    area.rows = 10;
    area.placeholder = '104;You feel watched.;;CURRENT;CONTROLLED;NO;ONCE;0;0|...';
    area.style.cssText = 'width:100%;box-sizing:border-box;font-family:var(--font-mono,monospace);font-size:0.85em';
    body.appendChild(area);

    const status = document.createElement('div');
    status.style.cssText = 'font-size:0.82em;color:#f39c12;line-height:1.5';
    body.appendChild(status);

    showPopup({
        id: 'loreBotImportPopup',
        title: 'Import lore (bot format)',
        content: body,
        draggable: true,
        style: { border: '2px solid var(--popup-border-lore)', padding: '14px' },
        actions: [
            {
                label: 'Import', action: () => {
                    const text = area.value.trim();
                    if (!text) { status.textContent = 'Nothing to import — paste the export first.'; return; }
                    const result = loreManager.importWireFormat(text);
                    let message = `Imported ${result.systemCount} system + ${result.planetCount} planet `
                        + `+ ${result.phaseCount} phase entries`;
                    if (result.skipped.length > 0) {
                        message += ` (${result.skipped.length} skipped)`;
                        console.warn('Lore import skipped entries:', result.skipped);
                        status.textContent = `${result.skipped.length} entr(y/ies) skipped — see the console for why.`;
                    } else {
                        hidePopup('loreBotImportPopup');
                    }
                    updateHexStatus(message);
                    refreshAfterBulkImport();
                }
            },
            { label: 'Cancel', action: () => hidePopup('loreBotImportPopup') }
        ]
    });
}

/** Two-step inline confirm on the button itself, rather than a blocking confirm(). */
function clearAllLore() {
    const btn = document.getElementById('loreClearAllBtn');
    if (!btn) return;
    if (btn.dataset.armed === 'yes') {
        btn.dataset.armed = '';
        btn.textContent = 'Clear All Lore';
        const clearedCount = loreManager.clearAllLore();
        updateHexStatus(`Cleared lore from ${clearedCount} targets`);
        refreshAfterBulkImport();
        return;
    }
    btn.dataset.armed = 'yes';
    btn.textContent = 'Click again to clear everything';
    setTimeout(() => {
        if (btn.dataset.armed === 'yes') {
            btn.dataset.armed = '';
            btn.textContent = 'Clear All Lore';
        }
    }, 4000);
}

function refreshAfterBulkImport() {
    loreManager.editor.loreOverlay?.refresh();
    const currentHex = document.getElementById('hexLabelInput')?.value.trim();
    if (state.getRef()?.kind === 'phase') selectPhase(state.getRef().phase);
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
                    <li><strong>Pick a target</strong> — with the popup open, <strong>click a hex on the map</strong>
                        (right-click one to choose a specific planet). Turn that off with the
                        <em>🎯 Pick from map</em> checkbox if you'd rather paint sectors with the popup open;
                        you can also type a hex label. For phase lore click a <em>Phase</em> button
                        (Strategy/Action/Status/Agenda) — no hex needed.</li>
                    <li><strong>Pick or add an entry</strong> in the left-hand list. Each row shows its tag, trigger,
                        receiver, round window, and gate.</li>
                    <li><strong>Edit</strong> on the right: lore text, the footer (flavour + effects), trigger /
                        receiver / ping / persistence, a <em>Rounds</em> window (<code>3</code>, <code>2-5</code>,
                        <code>4-</code>, <code>-6</code>, blank = always), and a <em>Tag</em>.</li>
                    <li><strong>Save</strong>. It's disabled until something actually changes, and an
                        <em>● Unsaved</em> pill shows when it has. Switching entry, switching target, or closing the
                        popup <strong>saves first</strong> rather than discarding your edits. <em>Revert</em> puts the
                        entry back to its last saved state.</li>
                </ol>

                <h4 style="color:#9b59b6">Game type</h4>
                <p style="margin-top:0">
                    Set <em>Game type</em> (top left) to match the target game: Fog of War games can use
                    <code>ADJACENT</code>/<code>GM</code> receivers, GM pings, and fog-tile effects; normal games
                    (with the <code>lore_mode</code> toggle) use the <code>CARDS</code> private-thread receiver
                    instead. The editor hides what doesn't apply.
                </p>

                <h4 style="color:#9b59b6">The footer: flavour, gate, effects</h4>
                <p style="margin-top:0">
                    The footer carries three different things, so it's edited as three:
                </p>
                <ul style="margin-top:0;padding-left:18px">
                    <li><strong>Flavour</strong> — prose players read under the lore text.</li>
                    <li><strong>Gate</strong> — whether the entry fires straight away, behind
                        <em>Accept/Reject</em> buttons, or behind a <em>dice roll</em>.</li>
                    <li><strong>Effects</strong> — one row per bot command. Add them with the
                        <em>＋ Player rewards / Map changes / Fog of War</em> buttons.</li>
                </ul>
                <p style="margin-top:0">
                    Everything on an effect row is editable in place — click the value chip to reopen that effect's
                    picker, and use the row's own controls for the rest:
                </p>
                <ul style="margin-top:0;padding-left:18px">
                    <li><strong>When</strong> (the dropdown) — <em>Always</em>, or <em>On Accept</em>/<em>On Reject</em>
                        under a choice gate, or a <em>roll bin</em> like <code>2-10</code> under a dice gate. First
                        matching bin wins; untagged lines always fire.</li>
                    <li><strong>@here / @target</strong> — by default a unit/token/cc/fog effect acts on the entry's
                        own tile. Click the chip to point it at another system or planet.</li>
                    <li><strong>＋?</strong> — a condition (<code>?red</code>, <code>?!faction:winnu</code>,
                        <code>?round:3-</code>) so the line only fires for players matching <em>all</em> of them.
                        "Else" = a second row with the negated condition.</li>
                    <li><strong>▲▼ ⧉ 🗑</strong> — reorder, duplicate, remove.</li>
                    <li><strong>＋ Text line</strong> — prose tied to one outcome, e.g. what players read when the
                        roll lands in a particular bin.</li>
                </ul>
                <p style="margin-top:0">
                    The <strong>Preview</strong> box shows exactly what players will see; effect lines are never shown
                    to them. The counter tracks the whole footer against the 400-character limit — hover it for a
                    gate/flavour/effects breakdown. <strong>&lt;/&gt; Raw footer</strong> lets you edit the stored text
                    directly; if a footer uses something the editor can't safely rebuild, it opens automatically and
                    the rows lock, so nothing hand-authored is ever silently rewritten.
                </p>

                <h4 style="color:#9b59b6">Phase lore</h4>
                <p style="margin-top:0">
                    Phase entries fire on <em>Phase begins/ends</em> — there is no acting player and no home system,
                    so use receiver <code>ALL</code> (or <code>GM</code> for map-effects-only), give map effects an
                    explicit colour, and point tile-bound effects somewhere with each row's <code>@target</code> chip.
                    The warnings list flags all of these footguns.
                </p>
                <p style="margin-top:0">
                    <strong>Fog sighting effects</strong> (Fog of War games only) never touch the shared board — they
                    only override what <em>one receiving player's client</em> shows for a position that's still fogged
                    to them: <em>Set Fog Sighting</em> plants a tile ID (real or a decoy) as what that player currently
                    believes is there; <em>Clear Fog Sighting</em> wipes it back to plain unknown fog.
                </p>

                <h4 style="color:#9b59b6">Entry list, tags &amp; copy</h4>
                <p style="margin-top:0">
                    Multiple entries on one target need distinct tags (letters+digits); saving a colliding entry
                    auto-tags it. The <strong>⋯</strong> menu holds <em>Duplicate</em> (clone the open entry as a new
                    one), <em>Copy</em>/<em>Paste</em> through the lore clipboard — which the map overlay shares —
                    <em>Copy to…</em> (save it onto any other system/planet/phase, rewriting footer
                    <code>tile_name:</code>/<code>planet:</code> references), and <em>Delete</em>.
                </p>

                <h4 style="color:#9b59b6">Overview &amp; map overlay</h4>
                <p style="margin-top:0">
                    <strong>📋 Overview</strong> lists every entry on the map — click a row to jump to it.
                    Toggle <em>Lore Indicators</em> in the Overlays panel to mark lore on the board. Each marker
                    sits on what it describes — the system, or the individual planet — and encodes its entry at a
                    glance:
                </p>
                <ul style="margin-top:0;padding-left:18px">
                    <li><strong>Colour</strong> — purple for system lore, blue for planet lore.</li>
                    <li><strong>Glyph</strong> — the trigger: ⚑ in control · ◎ activated · ➜ units moved in ·
                        ✦ space battle · ▲ ground battle.</li>
                    <li><strong>Rim</strong> — solid when it fires straight away, long-dashed for Accept/Reject,
                        finely dashed for a dice roll.</li>
                    <li><strong>×N badge</strong> for several entries, <strong>⏱</strong> when a round window applies.</li>
                </ul>
                <p style="margin-top:0">
                    <strong>Click a marker</strong> to open that exact target in the editor. Hovering one draws arcs
                    to every tile its effects reach — gold for <code>!swap</code>, blue for placements, dashed red for
                    removals — so lore that moves or alters another system is visible on the board. Hover also shows
                    the full tooltip (every entry, with per-entry Copy); Ctrl+click a hex pastes the clipboard onto it.
                    Phase lore shows as a corner banner while the overlay is on.
                </p>

                <h4 style="color:#9b59b6">Export / Import</h4>
                <p style="margin-top:0">
                    <em>Export/Import Lore</em> moves everything as JSON (systems, planets, phases, game type).
                    <em>Export Lore (Bot format)</em> writes the bot's 9-field wire format —
                    <code>target;loreText;footerText;receiver;trigger;ping;persistance;fromRound;tillRound</code>
                    joined by <code>|</code>, with <code>#Tag</code> targets and phase targets — ready for the bot's
                    GM <em>Import from URL</em>. Import accepts old 7-field entries too. The <strong>AsyncTI4 mapinfo
                    export/import is also full-fidelity</strong>: every entry per target (with round windows)
                    plus all phase lore rides along in the normal map save and mapinfo file. Bot-assigned
                    <code>#Tag</code>s are re-generated on import either way, so don't treat them as stable IDs.
                </p>

                <p style="color:#888;font-size:0.85em">
                    Note: lore edits on hexes are undo-able (Ctrl+Z); phase lore isn't undo-tracked yet.
                    Run <code>__loreCheckAllFooters()</code> in the browser console to verify every footer on the
                    map survives a structured round-trip.
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
