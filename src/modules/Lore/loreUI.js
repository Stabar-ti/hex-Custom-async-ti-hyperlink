/**
 * Lore Module UI - User interface for managing system and planet lore
 */

import { showPopup } from '../../ui/popupUI.js';
import {
    LoreManager, LORE_RECEIVERS, LORE_TRIGGERS, LORE_PINGS, LORE_PERSISTANCE,
    LORE_RECEIVER_LABELS, LORE_TRIGGER_LABELS, LORE_PERSISTANCE_LABELS
} from './loreCore.js';
import { EFFECT_VERBS, isChoiceGated, getDisplayFooter, validateLoreEffects } from './loreEffects.js';
import {
    openNumberPicker, openUnitPicker, openTokenPicker, openTargetPicker, openSwapPicker
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

// Verbs that resolve against a board target, so the "Target" control's @ref is meaningful for them.
const TARGET_AWARE_VERBS = new Set(['unit', 'plastic', 'removeunit', 'token', 'removetoken']);

// Per-prefix ("system" / "planet0" / ...) state for the optional @target redirect.
const effectTargetState = new Map();

/** Token Add/Remove should offer space tokens for a system holder, planet tokens/attachments
 *  for a planet holder — following the @target redirect when one is set, since that's the
 *  holder the effect will actually resolve against, not necessarily this lore's own location. */
function resolveTokenScope(prefix) {
    const target = effectTargetState.get(prefix);
    if (target) {
        return loreManager.editor.hexes[target] ? 'space' : 'planet';
    }
    return prefix === 'system' ? 'space' : 'planet';
}

let loreManager = null;

// Memory storage for copy/paste functionality
let copiedSystemLore = null;
let copiedPlanetLore = null;

export function installLoreUI(editor) {
    loreManager = new LoreManager(editor);
    window.loreManager = loreManager;
    window.showLorePopup = showLorePopup;
}

/**
 * Show the main lore management popup
 */
export function showLorePopup() {
    if (document.getElementById('lorePopup')) {
        return;
    }
    
    const content = document.createElement('div');
    content.style.minWidth = '400px';
    
    // Header
    const header = document.createElement('div');
    header.innerHTML = '<h3 style="margin-top: 0; color: #fff;">Lore Management</h3>';
    header.style.marginBottom = '16px';
    content.appendChild(header);
    
    // Instructions
    const instructions = document.createElement('div');
    instructions.innerHTML = `
        <p style="margin: 0 0 12px 0; color: #ccc; font-size: 0.9em;">
            Manage lore text for systems and planets. Select a hex first, then configure its lore settings.
        </p>
    `;
    content.appendChild(instructions);
    
    // Hex selector section
    const selectorSection = createHexSelectorSection();
    content.appendChild(selectorSection);
    
    // Lore editor section (initially hidden)
    const editorSection = createLoreEditorSection();
    content.appendChild(editorSection);
    
    // Action buttons
    const actionSection = createActionButtonsSection();
    content.appendChild(actionSection);
    
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
            left: '300px',
            top: '100px',
            minWidth: '450px',
            maxWidth: '800px',
            minHeight: '300px',
            maxHeight: '700px',
            border: '2px solid var(--popup-border-lore)',
            boxShadow: '0 8px 40px #000a',
            padding: '20px'
        },
        showHelp: true,
        onHelp: () => showLoreHelp()
    });
}

function createHexSelectorSection() {
    const section = document.createElement('div');
    section.id = 'hexSelectorSection';
    section.style.marginBottom = '20px';
    section.style.padding = '12px';
    section.style.border = '1px solid #555';
    section.style.borderRadius = '6px';
    section.style.backgroundColor = '#2c3e50';
    
    const label = document.createElement('label');
    label.innerHTML = '<strong>Select Hex:</strong>';
    label.style.display = 'block';
    label.style.marginBottom = '8px';
    label.style.color = '#fff';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'hexLabelInput';
    input.placeholder = 'Enter hex label (e.g., 001, 201)';
    input.style.width = '200px';
    input.style.padding = '6px';
    input.style.border = '1px solid #666';
    input.style.borderRadius = '4px';
    input.style.backgroundColor = '#34495e';
    input.style.color = '#fff';
    
    const selectBtn = document.createElement('button');
    selectBtn.id = 'selectHexBtn';
    selectBtn.textContent = 'Select';
    selectBtn.style.marginLeft = '8px';
    selectBtn.style.padding = '6px 12px';
    selectBtn.style.border = '1px solid #27ae60';
    selectBtn.style.borderRadius = '4px';
    selectBtn.style.backgroundColor = '#27ae60';
    selectBtn.style.color = '#fff';
    selectBtn.style.cursor = 'pointer';
    selectBtn.onclick = () => selectHex(input.value.trim());
    
    const statusDiv = document.createElement('div');
    statusDiv.id = 'hexStatus';
    statusDiv.style.marginTop = '8px';
    statusDiv.style.fontSize = '0.9em';
    statusDiv.style.color = '#ccc';
    
    section.appendChild(label);
    section.appendChild(input);
    section.appendChild(selectBtn);
    section.appendChild(statusDiv);
    
    return section;
}

function createLoreEditorSection() {
    const section = document.createElement('div');
    section.id = 'loreEditorSection';
    section.style.display = 'none';
    section.style.marginBottom = '20px';
    
    // System Lore Section
    const systemSection = document.createElement('div');
    systemSection.innerHTML = '<h4 style="margin: 0 0 12px 0; color: #e74c3c;">System Lore</h4>';
    systemSection.appendChild(createLoreForm('system'));
    
    // Planet Lore Section
    const planetSection = document.createElement('div');
    planetSection.innerHTML = '<h4 style="margin: 16px 0 12px 0; color: #f39c12;">Planet Lore</h4>';
    planetSection.id = 'planetLoreSection';
    
    // Clone section
    const cloneSection = createCloneSection();

    section.appendChild(systemSection);
    section.appendChild(planetSection);
    section.appendChild(cloneSection);

    return section;
}

function createCloneSection() {
    const section = document.createElement('div');
    section.style.cssText = 'margin-top:16px;padding:12px;border:1px solid #555;border-radius:6px;background:#2c3e50';

    const heading = document.createElement('h5');
    heading.style.cssText = 'margin:0 0 10px 0;color:#9b59b6';
    heading.textContent = 'Clone Lore to Another Hex';
    section.appendChild(heading);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'cloneTargetInput';
    input.placeholder = 'Target hex (e.g. 042)';
    Object.assign(input.style, {
        width: '140px', padding: '5px 8px', border: '1px solid #666',
        borderRadius: '4px', background: '#34495e', color: '#fff', fontSize: '13px'
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doClone('all'); });

    const mkBtn = (text, color, onClick) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `padding:5px 12px;border:1px solid ${color};border-radius:4px;` +
            `background:${color};color:#fff;cursor:pointer;font-size:13px`;
        btn.onclick = onClick;
        return btn;
    };

    row.appendChild(input);
    row.appendChild(mkBtn('Clone System', '#8e44ad', () => doClone('system')));
    row.appendChild(mkBtn('Clone All',    '#6c3483', () => doClone('all')));

    const status = document.createElement('div');
    status.id = 'cloneStatus';
    status.style.cssText = 'margin-top:6px;font-size:0.85em;color:#aaa';

    section.appendChild(row);
    section.appendChild(status);
    return section;

    function doClone(type) {
        const targetLabel = input.value.trim();
        if (!targetLabel) { status.textContent = 'Enter a target hex label.'; return; }
        const result = cloneLore(targetLabel, type);
        status.textContent = result;
    }
}

function createLoreForm(type, planetIndex = null) {
    const form = document.createElement('div');
    form.className = 'lore-form';
    form.style.padding = '12px';
    form.style.border = '1px solid #555';
    form.style.borderRadius = '6px';
    form.style.backgroundColor = '#34495e';
    form.style.marginBottom = '12px';
    
    const prefix = planetIndex !== null ? `planet${planetIndex}` : 'system';
    
    // Lore Text
    const loreTextLabel = document.createElement('label');
    loreTextLabel.textContent = 'Lore Text:';
    loreTextLabel.style.display = 'block';
    loreTextLabel.style.marginBottom = '4px';
    loreTextLabel.style.color = '#fff';
    loreTextLabel.style.fontWeight = 'bold';
    
    const loreTextArea = document.createElement('textarea');
    loreTextArea.id = `${prefix}LoreText`;
    loreTextArea.rows = 3;
    loreTextArea.style.width = '100%';
    loreTextArea.style.padding = '6px';
    loreTextArea.style.border = '1px solid #666';
    loreTextArea.style.borderRadius = '4px';
    loreTextArea.style.backgroundColor = '#2c3e50';
    loreTextArea.style.color = '#fff';
    loreTextArea.style.resize = 'vertical';
    loreTextArea.style.marginBottom = '4px';
    
    // Character counter for lore text
    const loreTextCounter = document.createElement('div');
    loreTextCounter.id = `${prefix}LoreTextCounter`;
    loreTextCounter.style.fontSize = '12px';
    loreTextCounter.style.color = '#888';
    loreTextCounter.style.textAlign = 'right';
    loreTextCounter.style.marginBottom = '8px';
    loreTextCounter.textContent = '0/1000 characters';
    
    // Add input listener for real-time counting and semicolon validation
    loreTextArea.addEventListener('input', function() {
        // Remove semicolons from input
        if (this.value.includes(';')) {
            const cursorPosition = this.selectionStart;
            this.value = this.value.replace(/;/g, '');
            this.setSelectionRange(cursorPosition - 1, cursorPosition - 1);
            // Show warning
            loreTextCounter.textContent = 'Semicolons not allowed! - ' + loreTextCounter.textContent;
            loreTextCounter.style.color = '#e74c3c';
            setTimeout(() => {
                const length = this.value.length;
                loreTextCounter.textContent = `${length}/1000 characters`;
                if (length > 1000) {
                    loreTextCounter.style.color = '#e74c3c';
                } else if (length > 900) {
                    loreTextCounter.style.color = '#f39c12';
                } else {
                    loreTextCounter.style.color = '#888';
                }
            }, 2000);
            return;
        }
        
        const length = this.value.length;
        loreTextCounter.textContent = `${length}/1000 characters`;
        if (length > 1000) {
            loreTextCounter.style.color = '#e74c3c';
        } else if (length > 900) {
            loreTextCounter.style.color = '#f39c12';
        } else {
            loreTextCounter.style.color = '#888';
        }
    });
    
    // Footer Text
    const footerTextLabel = document.createElement('label');
    footerTextLabel.textContent = 'Footer Text:';
    footerTextLabel.style.display = 'block';
    footerTextLabel.style.marginBottom = '4px';
    footerTextLabel.style.color = '#fff';
    footerTextLabel.style.fontWeight = 'bold';
    
    const footerInput = document.createElement('textarea');
    footerInput.rows = 3;
    footerInput.id = `${prefix}FooterText`;
    footerInput.style.width = '100%';
    footerInput.style.resize = 'vertical';
    footerInput.style.fontFamily = 'inherit';
    footerInput.style.padding = '6px';
    footerInput.style.border = '1px solid #666';
    footerInput.style.borderRadius = '4px';
    footerInput.style.backgroundColor = '#2c3e50';
    footerInput.style.color = '#fff';
    footerInput.style.marginBottom = '4px';
    
    // Character counter for footer text
    const footerTextCounter = document.createElement('div');
    footerTextCounter.id = `${prefix}FooterTextCounter`;
    footerTextCounter.style.fontSize = '12px';
    footerTextCounter.style.color = '#888';
    footerTextCounter.style.textAlign = 'right';
    footerTextCounter.style.marginBottom = '8px';
    footerTextCounter.textContent = '0/200 characters';
    
    // Add input listener for real-time counting and semicolon validation
    footerInput.addEventListener('input', function() {
        // Remove semicolons from input
        if (this.value.includes(';')) {
            const cursorPosition = this.selectionStart;
            this.value = this.value.replace(/;/g, '');
            this.setSelectionRange(cursorPosition - 1, cursorPosition - 1);
            // Show warning
            footerTextCounter.textContent = 'Semicolons not allowed! - ' + footerTextCounter.textContent;
            footerTextCounter.style.color = '#e74c3c';
            setTimeout(() => {
                const length = this.value.length;
                footerTextCounter.textContent = `${length}/200 characters`;
                if (length > 200) {
                    footerTextCounter.style.color = '#e74c3c';
                } else if (length > 180) {
                    footerTextCounter.style.color = '#f39c12';
                } else {
                    footerTextCounter.style.color = '#888';
                }
            }, 2000);
            return;
        }
        
        const length = this.value.length;
        footerTextCounter.textContent = `${length}/200 characters`;
        if (length > 200) {
            footerTextCounter.style.color = '#e74c3c';
        } else if (length > 180) {
            footerTextCounter.style.color = '#f39c12';
        } else {
            footerTextCounter.style.color = '#888';
        }
        updateEffectsPreview(prefix);
    });

    // Effects builder (mirrors the bot's "!verb args" footer DSL)
    const effectsSection = createEffectsSection(prefix);

    // Options row
    const optionsRow = document.createElement('div');
    optionsRow.style.display = 'flex';
    optionsRow.style.gap = '12px';
    optionsRow.style.flexWrap = 'wrap';
    
    // Receiver
    optionsRow.appendChild(createSelectField(`${prefix}Receiver`, 'Receiver:', LORE_RECEIVERS, LORE_RECEIVER_LABELS));

    // Trigger
    optionsRow.appendChild(createSelectField(`${prefix}Trigger`, 'Trigger:', LORE_TRIGGERS, LORE_TRIGGER_LABELS));

    // Ping
    optionsRow.appendChild(createSelectField(`${prefix}Ping`, 'Ping:', LORE_PINGS));

    // Persistence
    optionsRow.appendChild(createSelectField(`${prefix}Persistance`, 'Persistence:', LORE_PERSISTANCE, LORE_PERSISTANCE_LABELS));
    
    // Action buttons
    const buttonRow = document.createElement('div');
    buttonRow.style.marginTop = '12px';
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '8px';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '6px 12px';
    saveBtn.style.border = '1px solid #27ae60';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.backgroundColor = '#27ae60';
    saveBtn.style.color = '#fff';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = () => saveLore(type, planetIndex);
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.padding = '6px 12px';
    clearBtn.style.border = '1px solid #e74c3c';
    clearBtn.style.borderRadius = '4px';
    clearBtn.style.backgroundColor = '#e74c3c';
    clearBtn.style.color = '#fff';
    clearBtn.style.cursor = 'pointer';
    clearBtn.onclick = () => clearLore(type, planetIndex);
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.padding = '6px 12px';
    copyBtn.style.border = '1px solid #3498db';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.backgroundColor = '#3498db';
    copyBtn.style.color = '#fff';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = () => copyLore(type, planetIndex);
    
    const pasteBtn = document.createElement('button');
    pasteBtn.textContent = 'Paste';
    pasteBtn.style.padding = '6px 12px';
    pasteBtn.style.border = '1px solid #3498db';
    pasteBtn.style.borderRadius = '4px';
    pasteBtn.style.backgroundColor = '#3498db';
    pasteBtn.style.color = '#fff';
    pasteBtn.style.cursor = 'pointer';
    pasteBtn.onclick = () => pasteLore(type, planetIndex);
    
    buttonRow.appendChild(saveBtn);
    buttonRow.appendChild(clearBtn);
    buttonRow.appendChild(copyBtn);
    buttonRow.appendChild(pasteBtn);
    
    form.appendChild(loreTextLabel);
    form.appendChild(loreTextArea);
    form.appendChild(loreTextCounter);
    form.appendChild(footerTextLabel);
    form.appendChild(footerInput);
    form.appendChild(footerTextCounter);
    form.appendChild(effectsSection);
    form.appendChild(optionsRow);
    form.appendChild(buttonRow);

    // Receiver affects which warnings apply (e.g. !choice is a no-op for WINNER/LOSER/GM)
    const receiverSelect = optionsRow.querySelector(`#${prefix}Receiver`);
    if (receiverSelect) {
        receiverSelect.addEventListener('change', () => updateEffectsPreview(prefix));
    }
    updateEffectsPreview(prefix);
    
    return form;
}

function createSelectField(id, label, options, labels = null) {
    const container = document.createElement('div');
    container.style.flex = '1';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.display = 'block';
    labelEl.style.marginBottom = '4px';
    labelEl.style.color = '#fff';
    labelEl.style.fontSize = '0.9em';

    const select = document.createElement('select');
    select.id = id;
    select.style.width = '100%';
    select.style.padding = '4px';
    select.style.border = '1px solid #666';
    select.style.borderRadius = '4px';
    select.style.backgroundColor = '#2c3e50';
    select.style.color = '#fff';

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

/**
 * Builds the "Effects" panel below a footer textarea: buttons that insert correctly-shaped
 * "!verb args" lines (matching the bot's LoreEffects engine), a Choice-gate checkbox that
 * manages the "!choice" marker line, a live validation list, and a player-facing preview.
 */
function createEffectsSection(prefix) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:10px;padding:10px;border:1px solid #555;border-radius:6px;background:#2c3e50';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px';

    const title = document.createElement('span');
    title.textContent = 'Effects (bot commands)';
    title.style.cssText = 'font-size:0.85em;font-weight:bold;color:#9b59b6';
    header.appendChild(title);

    const gateLabel = document.createElement('label');
    gateLabel.id = `${prefix}ChoiceGateLabel`;
    gateLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.85em;color:#ddd;cursor:pointer';
    gateLabel.title = 'Sends each recipient independent Accept/Reject buttons; effect lines tagged "accept:"/"reject:" fire only on that branch.';
    const gateCheckbox = document.createElement('input');
    gateCheckbox.type = 'checkbox';
    gateCheckbox.id = `${prefix}ChoiceGate`;
    gateCheckbox.addEventListener('change', () => toggleChoiceGate(prefix, gateCheckbox.checked));
    gateLabel.appendChild(gateCheckbox);
    gateLabel.appendChild(document.createTextNode('Gate behind Accept/Reject choice'));
    header.appendChild(gateLabel);

    const insertModeSelect = document.createElement('select');
    insertModeSelect.id = `${prefix}InsertMode`;
    insertModeSelect.style.cssText = 'padding:3px 6px;font-size:0.8em;border:1px solid #666;border-radius:4px;background:#34495e;color:#fff';
    [['always', 'Insert as: Always'], ['accept', 'Insert as: On Accept'], ['reject', 'Insert as: On Reject']]
        .forEach(([value, text]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = text;
            insertModeSelect.appendChild(opt);
        });
    header.appendChild(insertModeSelect);

    const targetBtn = document.createElement('button');
    targetBtn.type = 'button';
    targetBtn.id = `${prefix}TargetBtn`;
    targetBtn.textContent = '🎯 Target: none';
    targetBtn.title = 'Redirect Add/Remove Unit, Token, and Remove Token effects at a specific system or planet (@target). Leave as "none" to affect the lore\'s own system/planet.';
    targetBtn.style.cssText = 'padding:3px 8px;font-size:0.8em;border:1px solid #666;border-radius:4px;' +
        'background:#34495e;color:#ddd;cursor:pointer';
    targetBtn.onclick = async (e) => {
        e.preventDefault();
        const choice = await openTargetPicker(targetBtn, loreManager.editor);
        if (choice === null) return;
        effectTargetState.set(prefix, choice || null);
        targetBtn.textContent = choice ? `🎯 Target: ${choice}` : '🎯 Target: none';
    };
    header.appendChild(targetBtn);

    section.appendChild(header);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px';
    EFFECT_VERBS.forEach(({ verb, label, template }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.title = `!${template}`;
        btn.style.cssText = 'padding:3px 8px;font-size:0.78em;border:1px solid #666;border-radius:3px;' +
            'background:#3498db;color:#fff;cursor:pointer;transition:background-color 0.2s ease';
        btn.onmouseover = () => btn.style.backgroundColor = '#2980b9';
        btn.onmouseout = () => btn.style.backgroundColor = '#3498db';
        btn.onclick = async (e) => {
            e.preventDefault();

            let args = null;
            if (NUMERIC_PICKER_RANGES[verb]) {
                const n = await openNumberPicker(btn, NUMERIC_PICKER_RANGES[verb]);
                if (n == null) return;
                args = (verb === 'ac' || verb === 'so') ? `${n}` : (n > 0 ? `+${n}` : `${n}`);
            } else if (verb === 'unit' || verb === 'plastic' || verb === 'removeunit') {
                args = await openUnitPicker(btn, verb === 'removeunit' ? 'remove' : 'add');
                if (args == null) return;
            } else if (verb === 'token' || verb === 'removetoken') {
                args = await openTokenPicker(btn, resolveTokenScope(prefix));
                if (args == null) return;
            } else if (verb === 'swap') {
                const pair = await openSwapPicker(btn, loreManager.editor);
                if (!pair) return;
                args = `${pair[0]} ${pair[1]}`;
            }

            const target = TARGET_AWARE_VERBS.has(verb) ? effectTargetState.get(prefix) : null;
            const body = args !== null ? `${verb} ${args}` : template;
            insertEffectSnippet(prefix, target ? `${body} @${target}` : body);
        };
        buttonRow.appendChild(btn);
    });
    section.appendChild(buttonRow);

    const warningsDiv = document.createElement('div');
    warningsDiv.id = `${prefix}EffectWarnings`;
    warningsDiv.style.cssText = 'display:none;font-size:0.8em;color:#f39c12;margin-bottom:8px;line-height:1.5';
    section.appendChild(warningsDiv);

    const previewLabel = document.createElement('div');
    previewLabel.textContent = 'Preview — what players will see:';
    previewLabel.style.cssText = 'font-size:0.78em;color:#aaa;margin-bottom:3px';
    section.appendChild(previewLabel);

    const previewDiv = document.createElement('div');
    previewDiv.id = `${prefix}FooterPreview`;
    previewDiv.style.cssText = 'font-size:0.85em;font-style:italic;color:#ccc;padding:6px;' +
        'border:1px dashed #555;border-radius:4px;background:#1c2733;white-space:pre-wrap;min-height:1.4em';
    section.appendChild(previewDiv);

    return section;
}

function getInsertTag(prefix) {
    const select = document.getElementById(`${prefix}InsertMode`);
    if (!select) return '';
    return select.value === 'accept' ? 'accept:' : select.value === 'reject' ? 'reject:' : '';
}

function insertEffectSnippet(prefix, template) {
    const footerInput = document.getElementById(`${prefix}FooterText`);
    if (!footerInput) return;

    const line = `${getInsertTag(prefix)}!${template}`;
    const current = footerInput.value;
    footerInput.value = current + (current && !current.endsWith('\n') ? '\n' : '') + line;
    footerInput.dispatchEvent(new Event('input', { bubbles: true }));
    footerInput.focus();
}

function toggleChoiceGate(prefix, enabled) {
    const footerInput = document.getElementById(`${prefix}FooterText`);
    if (!footerInput) return;

    const lines = footerInput.value.split('\n');
    const hasMarker = lines.some(l => l.trim().toLowerCase() === '!choice');
    if (enabled && !hasMarker) {
        footerInput.value = footerInput.value ? `!choice\n${footerInput.value}` : '!choice';
    } else if (!enabled && hasMarker) {
        footerInput.value = lines.filter(l => l.trim().toLowerCase() !== '!choice').join('\n');
    }
    footerInput.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Refreshes the choice checkbox, validation warnings, and player-facing preview for one lore form. */
function updateEffectsPreview(prefix) {
    const footerInput = document.getElementById(`${prefix}FooterText`);
    if (!footerInput) return;

    const receiverSelect = document.getElementById(`${prefix}Receiver`);
    const gateCheckbox = document.getElementById(`${prefix}ChoiceGate`);
    const warningsDiv = document.getElementById(`${prefix}EffectWarnings`);
    const previewDiv = document.getElementById(`${prefix}FooterPreview`);

    const footerText = footerInput.value;
    const receiver = receiverSelect ? receiverSelect.value : 'CURRENT';
    const gateMeaningless = receiver === 'WINNER' || receiver === 'LOSER' || receiver === 'GM';

    if (gateCheckbox) {
        gateCheckbox.checked = isChoiceGated(footerText);
        gateCheckbox.disabled = gateMeaningless;
    }
    const gateLabel = document.getElementById(`${prefix}ChoiceGateLabel`);
    if (gateLabel) {
        gateLabel.style.opacity = gateMeaningless ? '0.5' : '1';
        gateLabel.style.cursor = gateMeaningless ? 'default' : 'pointer';
        gateLabel.title = gateMeaningless
            ? `"!choice" has no effect when the receiver is ${LORE_RECEIVER_LABELS[receiver] || receiver} — that receiver never gets offered the choice.`
            : 'Sends each recipient independent Accept/Reject buttons; effect lines tagged "accept:"/"reject:" fire only on that branch.';
    }

    if (warningsDiv) {
        const problems = validateLoreEffects({ footerText, receiver });
        if (problems.length === 0) {
            warningsDiv.style.display = 'none';
            warningsDiv.innerHTML = '';
        } else {
            warningsDiv.style.display = 'block';
            warningsDiv.innerHTML = problems.map(p => `⚠️ ${p}`).join('<br>');
        }
    }

    if (previewDiv) {
        const display = getDisplayFooter(footerText);
        previewDiv.textContent = display || '(nothing shown to players — only bot effects)';
    }
}

function createActionButtonsSection() {
    const section = document.createElement('div');
    section.style.borderTop = '1px solid #555';
    section.style.paddingTop = '16px';
    section.style.display = 'flex';
    section.style.gap = '8px';
    section.style.flexWrap = 'wrap';
    
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export Lore';
    exportBtn.style.padding = '8px 16px';
    exportBtn.style.border = '1px solid #27ae60';
    exportBtn.style.borderRadius = '4px';
    exportBtn.style.backgroundColor = '#27ae60';
    exportBtn.style.color = '#fff';
    exportBtn.style.cursor = 'pointer';
    exportBtn.onclick = () => exportLore();
    
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import Lore';
    importBtn.style.padding = '8px 16px';
    importBtn.style.border = '1px solid #f39c12';
    importBtn.style.borderRadius = '4px';
    importBtn.style.backgroundColor = '#f39c12';
    importBtn.style.color = '#fff';
    importBtn.style.cursor = 'pointer';
    importBtn.onclick = () => importLore();
    
    const exportBotBtn = document.createElement('button');
    exportBotBtn.textContent = 'Export Lore (Bot format)';
    exportBotBtn.title = 'Downloads the bot\'s wire format (target;loreText;footerText;receiver;trigger;ping;persistance|...) for pasting into the bot\'s GM Lore Import.';
    exportBotBtn.style.padding = '8px 16px';
    exportBotBtn.style.border = '1px solid #27ae60';
    exportBotBtn.style.borderRadius = '4px';
    exportBotBtn.style.backgroundColor = '#2c3e50';
    exportBotBtn.style.color = '#27ae60';
    exportBotBtn.style.cursor = 'pointer';
    exportBotBtn.onclick = () => exportLoreBotFormat();

    const importBotBtn = document.createElement('button');
    importBotBtn.textContent = 'Import Lore (Bot format)';
    importBotBtn.title = 'Loads lore from the bot\'s wire format text (e.g. exported from the bot\'s GM Lore Export button).';
    importBotBtn.style.padding = '8px 16px';
    importBotBtn.style.border = '1px solid #f39c12';
    importBotBtn.style.borderRadius = '4px';
    importBotBtn.style.backgroundColor = '#2c3e50';
    importBotBtn.style.color = '#f39c12';
    importBotBtn.style.cursor = 'pointer';
    importBotBtn.onclick = () => importLoreBotFormat();

    const clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = 'Clear All Lore';
    clearAllBtn.style.padding = '8px 16px';
    clearAllBtn.style.border = '1px solid #e74c3c';
    clearAllBtn.style.borderRadius = '4px';
    clearAllBtn.style.backgroundColor = '#e74c3c';
    clearAllBtn.style.color = '#fff';
    clearAllBtn.style.cursor = 'pointer';
    clearAllBtn.onclick = () => clearAllLore();

    section.appendChild(exportBtn);
    section.appendChild(importBtn);
    section.appendChild(exportBotBtn);
    section.appendChild(importBotBtn);
    section.appendChild(clearAllBtn);

    return section;
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
    
    // Show editor section
    const editorSection = document.getElementById('loreEditorSection');
    editorSection.style.display = 'block';
    
    // Load existing lore data
    loadLoreData(hexLabel);
    
    // Update system lore section with hex info
    updateSystemLoreSection(hex);
    
    // Update planet lore section based on available planets
    updatePlanetLoreSection(hex);
    
    // Sync effects panels (choice checkbox, warnings, preview) with the loaded lore data
    setTimeout(() => {
        updateEffectsPreview('system');
        for (let i = 0; i < (hex.planets?.length || 0); i++) {
            updateEffectsPreview(`planet${i}`);
        }
    }, 50);

    updateHexStatus(`Selected hex ${hexLabel} - ${hex.planets?.length || 0} planets`);
}

function updateHexStatus(message) {
    const statusDiv = document.getElementById('hexStatus');
    if (statusDiv) {
        statusDiv.textContent = message;
    }
}

function loadLoreData(hexLabel) {
    const systemLore = loreManager.getSystemLore(hexLabel);

    // Load system lore
    if (systemLore) {
        document.getElementById('systemLoreText').value = systemLore.loreText || '';
        document.getElementById('systemFooterText').value = systemLore.footerText || '';
        document.getElementById('systemReceiver').value = systemLore.receiver || 'CURRENT';
        document.getElementById('systemTrigger').value = systemLore.trigger || 'CONTROLLED';
        document.getElementById('systemPing').value = systemLore.ping || 'NO';
        document.getElementById('systemPersistance').value = systemLore.persistance || 'ONCE';
    } else {
        clearSystemForm();
    }
}

function updateSystemLoreSection(hex) {
    const systemSection = document.querySelector('#loreEditorSection h4');
    if (systemSection && systemSection.textContent.includes('System Lore')) {
        // Get system information
        const realId = hex.realId || hex.id || '';
        const systemName = hex.systemName || hex.name || '';
        
        // Create the updated header text
        let headerText = 'System Lore';
        if (realId || systemName) {
            const info = [];
            if (realId) info.push(`ID: ${realId}`);
            if (systemName) info.push(systemName);
            headerText += ` (${info.join(' - ')})`;
        }
        
        systemSection.textContent = headerText;
    }
}

function updatePlanetLoreSection(hex) {
    const planetSection = document.getElementById('planetLoreSection');
    
    // Clear all content except the main header, then re-add the header
    planetSection.innerHTML = '<h4 style="margin: 16px 0 12px 0; color: #f39c12;">Planet Lore</h4>';
    
    // Add forms for each planet
    const planetCount = hex.planets?.length || 0;
    for (let i = 0; i < planetCount; i++) {
        const planet = hex.planets[i];
        const planetHeader = document.createElement('h5');
        
        // Create planet header with name if available
        let headerText = `Planet ${i + 1}`;
        if (planet && planet.name) {
            headerText += ` (${planet.name})`;
        } else if (planet && (planet.planetID || planet.id)) {
            headerText += ` (${planet.planetID || planet.id})`;
        }
        
        planetHeader.textContent = headerText;
        planetHeader.style.margin = '12px 0 8px 0';
        planetHeader.style.color = '#f39c12';
        planetSection.appendChild(planetHeader);
        
        const form = createLoreForm('planet', i);
        planetSection.appendChild(form);
        
        // Load existing data if any
        const planetLore = loreManager.getPlanetLore(hex.label, i);
        if (planetLore) {
            document.getElementById(`planet${i}LoreText`).value = planetLore.loreText || '';
            document.getElementById(`planet${i}FooterText`).value = planetLore.footerText || '';
            document.getElementById(`planet${i}Receiver`).value = planetLore.receiver || 'CURRENT';
            document.getElementById(`planet${i}Trigger`).value = planetLore.trigger || 'CONTROLLED';
            document.getElementById(`planet${i}Ping`).value = planetLore.ping || 'NO';
            document.getElementById(`planet${i}Persistance`).value = planetLore.persistance || 'ONCE';
        }
    }
    
    if (planetCount === 0) {
        const noplanetsMsg = document.createElement('p');
        noplanetsMsg.textContent = 'No planets available in this system';
        noplanetsMsg.style.color = '#999';
        noplanetsMsg.style.fontStyle = 'italic';
        planetSection.appendChild(noplanetsMsg);
    }
}

function saveLore(type, planetIndex) {
    const hexLabel = document.getElementById('hexLabelInput').value.trim();
    if (!hexLabel) {
        alert('Please select a hex first');
        return;
    }
    
    const prefix = planetIndex !== null ? `planet${planetIndex}` : 'system';
    
    const loreData = {
        loreText: document.getElementById(`${prefix}LoreText`).value,
        footerText: document.getElementById(`${prefix}FooterText`).value,
        receiver: document.getElementById(`${prefix}Receiver`).value,
        trigger: document.getElementById(`${prefix}Trigger`).value,
        ping: document.getElementById(`${prefix}Ping`).value,
        persistance: document.getElementById(`${prefix}Persistance`).value
    };
    
    // Validate length constraints and prohibited characters before saving
    const loreTextLength = loreData.loreText.length;
    const footerTextLength = loreData.footerText.length;
    
    // Check for prohibited semicolon characters
    if (loreData.loreText.includes(';')) {
        alert('Lore text cannot contain semicolon (;) characters - they break export functionality');
        return;
    }
    
    if (loreData.footerText.includes(';')) {
        alert('Footer text cannot contain semicolon (;) characters - they break export functionality');
        return;
    }
    
    if (loreTextLength > 1000) {
        alert(`Lore text is too long: ${loreTextLength} characters (maximum 1000 allowed)`);
        return;
    }
    
    if (footerTextLength > 200) {
        alert(`Footer text is too long: ${footerTextLength} characters (maximum 200 allowed)`);
        return;
    }
    
    let success;
    if (type === 'system') {
        success = loreManager.setSystemLore(hexLabel, loreData);
    } else {
        success = loreManager.addPlanetLore(hexLabel, planetIndex, loreData);
    }
    
    if (success) {
        updateHexStatus(`Saved ${type} lore for hex ${hexLabel}${planetIndex !== null ? `, planet ${planetIndex + 1}` : ''}`);
        // Refresh lore overlay if it exists and is active
        if (loreManager.editor && loreManager.editor.loreOverlay) {
            loreManager.editor.loreOverlay.refresh();
        }
    } else {
        alert('Failed to save lore data');
    }
}

function clearLore(type, planetIndex) {
    const hexLabel = document.getElementById('hexLabelInput').value.trim();
    if (!hexLabel) {
        alert('Please select a hex first');
        return;
    }
    
    let success;
    if (type === 'system') {
        success = loreManager.removeSystemLore(hexLabel);
        clearSystemForm();
    } else {
        success = loreManager.removePlanetLore(hexLabel, planetIndex);
        clearPlanetForm(planetIndex);
    }
    
    if (success) {
        updateHexStatus(`Cleared ${type} lore for hex ${hexLabel}${planetIndex !== null ? `, planet ${planetIndex + 1}` : ''}`);
        // Refresh lore overlay if it exists and is active
        if (loreManager.editor && loreManager.editor.loreOverlay) {
            loreManager.editor.loreOverlay.refresh();
        }
    } else {
        alert('Failed to clear lore data');
    }
}

function cloneLore(targetHexLabel, type) {
    const sourceHexLabel = document.getElementById('hexLabelInput')?.value.trim();
    if (!sourceHexLabel) return 'No source hex selected.';
    if (sourceHexLabel === targetHexLabel) return 'Source and target are the same hex.';

    const sourceHex = loreManager.editor.hexes[sourceHexLabel];
    const targetHex = loreManager.editor.hexes[targetHexLabel];
    if (!sourceHex) return `Source hex ${sourceHexLabel} not found.`;
    if (!targetHex) return `Target hex ${targetHexLabel} not found.`;

    let clonedSystem = false;
    let clonedPlanets = 0;

    if ((type === 'system' || type === 'all') && sourceHex.systemLore) {
        const lore = _applyHexReplacements({ ...sourceHex.systemLore }, targetHex, null);
        loreManager.setSystemLore(targetHexLabel, lore);
        clonedSystem = true;
    }

    if (type === 'all' && sourceHex.planetLore) {
        Object.entries(sourceHex.planetLore).forEach(([idx, lore]) => {
            if (!lore) return;
            const i = parseInt(idx);
            const updated = _applyHexReplacements({ ...lore }, targetHex, i);
            loreManager.addPlanetLore(targetHexLabel, i, updated);
            clonedPlanets++;
        });
    }

    if (!clonedSystem && clonedPlanets === 0) return `No lore found on hex ${sourceHexLabel} to clone.`;

    if (loreManager.editor.loreOverlay) loreManager.editor.loreOverlay.refresh();

    const parts = [];
    if (clonedSystem) parts.push('system lore');
    if (clonedPlanets > 0) parts.push(`${clonedPlanets} planet lore entry${clonedPlanets > 1 ? 's' : ''}`);
    return `Cloned ${parts.join(' + ')} to hex ${targetHexLabel}.`;
}

function _applyHexReplacements(loreData, targetHex, planetIndex) {
    if (!loreData.footerText?.includes('tile_name:')) return loreData;
    loreData.footerText = loreData.footerText.replace(/tile_name:\w+/g, `tile_name:${targetHex.label}`);
    if (planetIndex !== null) {
        const planet = targetHex.planets?.[planetIndex];
        if (planet) {
            const pName = (planet.name || planet.planetID || planet.id || '').replace(/\s+/g, '');
            if (pName) loreData.footerText = loreData.footerText.replace(/planet:\w+/g, `planet:${pName}`);
        }
    }
    return loreData;
}

function clearSystemForm() {
    document.getElementById('systemLoreText').value = '';
    document.getElementById('systemFooterText').value = '';
    document.getElementById('systemReceiver').value = 'CURRENT';
    document.getElementById('systemTrigger').value = 'CONTROLLED';
    document.getElementById('systemPing').value = 'NO';
    document.getElementById('systemPersistance').value = 'ONCE';
}

function clearPlanetForm(planetIndex) {
    document.getElementById(`planet${planetIndex}LoreText`).value = '';
    document.getElementById(`planet${planetIndex}FooterText`).value = '';
    document.getElementById(`planet${planetIndex}Receiver`).value = 'CURRENT';
    document.getElementById(`planet${planetIndex}Trigger`).value = 'CONTROLLED';
    document.getElementById(`planet${planetIndex}Ping`).value = 'NO';
    document.getElementById(`planet${planetIndex}Persistance`).value = 'ONCE';
}

function copyLore(type, planetIndex) {
    const hexLabel = document.getElementById('hexLabelInput').value.trim();
    if (!hexLabel) {
        alert('Please select a hex first');
        return;
    }
    
    const prefix = planetIndex !== null ? `planet${planetIndex}` : 'system';
    
    const loreData = {
        loreText: document.getElementById(`${prefix}LoreText`).value,
        footerText: document.getElementById(`${prefix}FooterText`).value,
        receiver: document.getElementById(`${prefix}Receiver`).value,
        trigger: document.getElementById(`${prefix}Trigger`).value,
        ping: document.getElementById(`${prefix}Ping`).value,
        persistance: document.getElementById(`${prefix}Persistance`).value
    };
    
    if (type === 'system') {
        copiedSystemLore = { ...loreData };
        updateHexStatus(`Copied system lore from hex ${hexLabel}`);
    } else {
        copiedPlanetLore = { ...loreData };
        updateHexStatus(`Copied planet lore from hex ${hexLabel}, planet ${planetIndex + 1}`);
    }
}

function pasteLore(type, planetIndex) {
    const hexLabel = document.getElementById('hexLabelInput').value.trim();
    if (!hexLabel) {
        alert('Please select a hex first');
        return;
    }
    
    const sourceData = type === 'system' ? copiedSystemLore : copiedPlanetLore;
    if (!sourceData) {
        alert(`No ${type} lore data copied yet`);
        return;
    }
    
    const prefix = planetIndex !== null ? `planet${planetIndex}` : 'system';
    
    // Get current hex info for updating dynamic content
    const hex = loreManager.editor.hexes[hexLabel];
    if (!hex) {
        alert(`Hex ${hexLabel} not found`);
        return;
    }
    
    // Update footer text with current hex and planet info
    let updatedFooterText = sourceData.footerText;
    if (updatedFooterText && updatedFooterText.includes('tile_name:')) {
        // Replace tile_name:XXX with current hex label
        updatedFooterText = updatedFooterText.replace(/tile_name:\w+/g, `tile_name:${hex.label}`);
        
        // For planet lore, also update planet name
        if (type === 'planet' && planetIndex !== null && hex.planets && hex.planets[planetIndex]) {
            const planet = hex.planets[planetIndex];
            const planetName = (planet && (planet.name || planet.planetID || planet.id)) || `planet_${planetIndex+1}`;
            const cleanPlanetName = planetName.replace(/\s+/g, '');
            
            // Replace planet:XXX with current planet name
            updatedFooterText = updatedFooterText.replace(/planet:\w+/g, `planet:${cleanPlanetName}`);
        }
    }
    
    // Paste the data with updated footer text
    document.getElementById(`${prefix}LoreText`).value = sourceData.loreText;
    document.getElementById(`${prefix}FooterText`).value = updatedFooterText;
    document.getElementById(`${prefix}Receiver`).value = sourceData.receiver;
    document.getElementById(`${prefix}Trigger`).value = sourceData.trigger;
    document.getElementById(`${prefix}Ping`).value = sourceData.ping;
    document.getElementById(`${prefix}Persistance`).value = sourceData.persistance;
    updateEffectsPreview(prefix);

    if (type === 'system') {
        updateHexStatus(`Pasted system lore to hex ${hexLabel}`);
    } else {
        updateHexStatus(`Pasted planet lore to hex ${hexLabel}, planet ${planetIndex + 1}`);
    }
}

function exportLore() {
    const loreData = loreManager.exportLore();
    const jsonString = JSON.stringify(loreData, null, 2);
    
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lore_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
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
                updateHexStatus(`Imported lore data for ${importedCount} hexes`);
                
                // Refresh current view if hex is selected
                const currentHex = document.getElementById('hexLabelInput').value.trim();
                if (currentHex) {
                    selectHex(currentHex);
                }
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

    const blob = new Blob([wireString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'lore_data_bot.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateHexStatus('Lore data exported in bot format');
}

function importLoreBotFormat() {
    const wireString = prompt(
        'Paste the bot\'s lore wire format below.\n' +
        'Format: target;loreText;footerText;receiver;trigger;ping;persistance, entries separated by "|".\n' +
        'System lore targets are tile positions (e.g. "104"); planet lore targets are planet identifiers.'
    );
    if (wireString === null) return;

    const result = loreManager.importWireFormat(wireString);
    let message = `Imported ${result.systemCount} system + ${result.planetCount} planet lore entries`;
    if (result.skipped.length > 0) {
        message += ` (${result.skipped.length} skipped — target not found on this map)`;
    }
    updateHexStatus(message);

    const currentHex = document.getElementById('hexLabelInput').value.trim();
    if (currentHex) {
        selectHex(currentHex);
    }
}

function clearAllLore() {
    if (confirm('Are you sure you want to clear ALL lore data from the map? This cannot be undone.')) {
        const clearedCount = loreManager.clearAllLore();
        updateHexStatus(`Cleared lore from ${clearedCount} hexes`);
        
        // Clear current forms
        clearSystemForm();
        const planetSection = document.getElementById('planetLoreSection');
        const existingForms = planetSection.querySelectorAll('.lore-form');
        existingForms.forEach(form => form.remove());
    }
}

function showLoreHelp() {
    showPopup({
        id: 'loreHelpPopup',
        className: 'popup-ui popup-ui-info',
        title: 'Lore Module Help',
        content: `
            <div style="line-height:1.6;font-size:13px">

                <h4 style="color:#9b59b6;margin-top:0">Overview</h4>
                <p style="margin-top:0">
                    The Lore Module lets you attach narrative text and bot commands to systems and planets.
                    Lore entries are sent to players by the AsyncTI4 bot when a trigger condition is met
                    (e.g. a planet is controlled or a system is activated).
                </p>

                <h4 style="color:#9b59b6">Writing Lore — Step by Step</h4>
                <ol style="margin-top:0;padding-left:18px">
                    <li><strong>Select a hex</strong> — type the hex label (e.g. <code>042</code>) and click <em>Select</em>,
                        or click the <em>Add Lore</em> button in the toolbar and click a hex on the map.</li>
                    <li><strong>Fill in the lore text</strong> for the system and/or each planet.
                        The <em>Lore Text</em> field is the narrative shown to players.
                        The <em>Footer Text</em> field holds optional flavor text plus bot effect commands
                        (e.g. <code>!tg +2</code>) inserted via the Effects panel below it.</li>
                    <li><strong>Configure the options</strong> for each lore entry:
                        <ul style="margin-top:4px">
                            <li><strong>Receiver</strong> — who receives the message:
                                <code>CURRENT</code> (active player), <code>ADJACENT</code> (neighbours), <code>ALL</code> (everyone), <code>GM</code> (game master only)</li>
                            <li><strong>Trigger</strong> — when the lore fires:
                                <code>CONTROLLED</code> (planet controlled), <code>ACTIVATED</code> (system activated), <code>MOVED</code> (units moved in)</li>
                            <li><strong>Ping</strong> — whether to ping the receiver: <code>YES</code> or <code>NO</code></li>
                            <li><strong>Persistence</strong> — how many times it fires:
                                <code>ONCE</code> (first time only), <code>ALWAYS</code> (every trigger)</li>
                        </ul>
                    </li>
                    <li><strong>Save</strong> each entry with the <em>Save</em> button. Use <em>Clear</em> to remove lore from a slot.</li>
                </ol>

                <h4 style="color:#9b59b6">Effects (bot commands)</h4>
                <p style="margin-top:0">
                    Below each Footer Text field is an <em>Effects</em> panel with one button per bot effect
                    (Trade Goods, Fleet/Tactic/Strategy CC, Commodities, Action Cards, Add/Remove Units,
                    Add/Remove Token, Swap Systems, Grant VP, Draw Secret Objective). Clicking a button inserts
                    a correctly formatted <code>!verb args</code> line into the footer — these lines are read by
                    the bot and are never shown to players. Anything else you type in the footer <em>is</em> shown
                    to players as flavor text, so the <strong>Preview</strong> box under the Effects panel always
                    shows exactly what they'll see.
                </p>
                <p style="margin-top:0">
                    Most effect buttons open a small picker instead of inserting a fixed value:
                    Trade Goods/Fleet/Tactic/Strategy CC/Commodities/Action Cards/Secret Objective show a
                    quick amount picker; Add/Remove Units shows owner, count, and unit type (Space Dock and
                    PDS also require a planet); Add/Remove Token searches the same token list used by the
                    map's Token module — system lore only offers space tokens (anomalies, wormholes, frontier,
                    etc.), planet lore only offers planet tokens/attachments, since that's all the matching
                    holder can ever accept; Swap Systems asks for the two sectors in two clicks. Pickers close
                    as soon as you choose — nothing is inserted until then.
                </p>
                <p style="margin-top:0">
                    The <strong>🎯 Target</strong> button lets Add/Remove Units, Add Token, and Remove Token
                    redirect at a different system or planet (an <code>@target</code> reference) instead of the
                    one this lore entry is attached to — useful for lore on one planet that grants units
                    elsewhere. Leave it on "none" to affect the lore's own location.
                </p>
                <p style="margin-top:0">
                    Check <strong>Gate behind Accept/Reject choice</strong> to require the recipient to accept the
                    lore before any effects apply (adds a <code>!choice</code> marker line). Once gated, use the
                    <em>Insert as</em> dropdown before clicking an effect button to mark it <em>On Accept</em> or
                    <em>On Reject</em> instead of Always — rejecting then grants only the reject-tagged effects (if any).
                </p>
                <p style="margin-top:0">
                    Warnings below the effects buttons mirror what the bot itself will flag when this lore is
                    saved (e.g. unknown effect, missing/invalid arguments, an Accept/Reject tag with no
                    <code>!choice</code> marker) — fix them here rather than discovering it in a live game.
                </p>

                <h4 style="color:#9b59b6">Copy &amp; Paste Lore (within the popup)</h4>
                <p style="margin-top:0">
                    Each lore form has <em>Copy</em> and <em>Paste</em> buttons. Copying a system lore stores it to
                    a clipboard; pasting writes it to the currently selected hex and automatically replaces any
                    <code>tile_name:</code> and <code>planet:</code> references in the footer text with the target hex's values.
                </p>

                <h4 style="color:#9b59b6">Clone Lore to Another Hex</h4>
                <p style="margin-top:0">
                    At the bottom of the editor section, the <em>Clone Lore to Another Hex</em> panel lets you
                    copy lore to a different hex in one step — no need to navigate to it first.
                    Type the target hex label, then click:
                </p>
                <ul style="margin-top:0;padding-left:18px">
                    <li><strong>Clone System</strong> — copies only the system lore to the target hex.</li>
                    <li><strong>Clone All</strong> — copies system lore and all planet lore entries to the target hex.</li>
                </ul>
                <p>You can clone to multiple hexes in a row by changing the target label and clicking again.</p>

                <h4 style="color:#9b59b6">Map Overlay &amp; Hover Tooltips</h4>
                <p style="margin-top:0">
                    Toggle <em>Lore Indicators</em> in the Overlays panel to show icons on hexes that have lore:
                </p>
                <ul style="margin-top:0;padding-left:18px">
                    <li>🟢 <strong>Book</strong> — system lore only</li>
                    <li>🟠 <strong>Scroll</strong> — planet lore only</li>
                    <li>🟣 <strong>Star</strong> — both system and planet lore</li>
                </ul>
                <p>
                    <strong>Hover</strong> any icon to read the full lore text and settings in a tooltip.
                    The tooltip also shows <em>Copy</em> buttons — move your mouse onto the tooltip to click them.
                </p>

                <h4 style="color:#9b59b6">Ctrl+Click to Paste (map-driven)</h4>
                <p style="margin-top:0">
                    Once you have copied lore (via the tooltip copy buttons), a clipboard badge appears at the
                    bottom of the screen. While the overlay is active, <strong>Ctrl+click any hex</strong> to paste:
                </p>
                <ul style="margin-top:0;padding-left:18px">
                    <li><strong>System lore</strong> — pastes immediately to the clicked hex.</li>
                    <li><strong>Planet lore, single planet</strong> — pastes immediately to planet 1.</li>
                    <li><strong>Planet lore, multiple planets</strong> — a small picker appears; click the planet to paste to.</li>
                </ul>
                <p>The clipboard stays set so you can Ctrl+click many hexes in a row.
                   Footer text <code>tile_name:</code> and <code>planet:</code> references are updated automatically for each target.</p>

                <h4 style="color:#9b59b6">Export / Import</h4>
                <p style="margin-top:0">
                    Use <em>Export Lore</em> to download all lore data as a JSON file.
                    Use <em>Import Lore</em> to load it back — useful for sharing lore between maps or restoring a backup.
                    Lore is also saved as part of the full map state when you export the map normally.
                </p>
                <p style="margin-top:0">
                    <em>Export Lore (Bot format)</em> / <em>Import Lore (Bot format)</em> convert to and from the
                    bot's own wire format (<code>target;loreText;footerText;receiver;trigger;ping;persistance</code>,
                    entries separated by <code>|</code>) so you can move lore directly between this editor and the
                    bot's GM Lore import/export. System lore targets are tile positions; planet lore targets are
                    planet identifiers — entries whose target isn't found on the current map are skipped and counted.
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