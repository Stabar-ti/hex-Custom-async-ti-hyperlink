/**
 * Lore Module UI - User interface for managing system and planet lore
 */

import { showPopup, hidePopup } from '../../ui/popupUI.js';
import { LoreManager, LORE_RECEIVERS, LORE_TRIGGERS, LORE_PINGS, LORE_PERSISTANCE } from './loreCore.js';

let loreManager = null;

// Memory storage for copy/paste functionality
let copiedSystemLore = null;
let copiedPlanetLore = null;

export function installLoreUI(editor) {
    console.log('installLoreUI called with editor:', editor);
    loreManager = new LoreManager(editor);
    console.log('LoreManager created:', loreManager);
    
    // Add to global window for console access
    window.loreManager = loreManager;
    window.showLorePopup = showLorePopup;
    console.log('Lore UI installed successfully, window.showLorePopup available:', typeof window.showLorePopup);
}

/**
 * Show the main lore management popup
 */
export function showLorePopup() {
    console.log('showLorePopup called');
    if (document.getElementById('lorePopup')) {
        console.log('Lore popup already exists, returning');
        return;
    }
    
    console.log('Creating new lore popup...');
    
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
            border: '2px solid #9b59b6',
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
    selectBtn.style.border = '1px solid #9b59b6';
    selectBtn.style.borderRadius = '4px';
    selectBtn.style.backgroundColor = '#9b59b6';
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
    
    section.appendChild(systemSection);
    section.appendChild(planetSection);
    
    return section;
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
    
    // Add input listener for real-time counting
    loreTextArea.addEventListener('input', function() {
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
    
    // Quick insert buttons
    const loreType = planetIndex !== null ? 'planet' : 'system';
    const quickInsertButtons = createQuickInsertButtons(`${prefix}FooterText`, loreType, '', null);
    
    const footerInput = document.createElement('input');
    footerInput.type = 'text';
    footerInput.id = `${prefix}FooterText`;
    footerInput.style.width = '100%';
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
    
    // Add input listener for real-time counting
    footerInput.addEventListener('input', function() {
        const length = this.value.length;
        footerTextCounter.textContent = `${length}/200 characters`;
        if (length > 200) {
            footerTextCounter.style.color = '#e74c3c';
        } else if (length > 180) {
            footerTextCounter.style.color = '#f39c12';
        } else {
            footerTextCounter.style.color = '#888';
        }
    });
    
    // Options row
    const optionsRow = document.createElement('div');
    optionsRow.style.display = 'flex';
    optionsRow.style.gap = '12px';
    optionsRow.style.flexWrap = 'wrap';
    
    // Receiver
    optionsRow.appendChild(createSelectField(`${prefix}Receiver`, 'Receiver:', LORE_RECEIVERS));
    
    // Trigger
    optionsRow.appendChild(createSelectField(`${prefix}Trigger`, 'Trigger:', LORE_TRIGGERS));
    
    // Ping
    optionsRow.appendChild(createSelectField(`${prefix}Ping`, 'Ping:', LORE_PINGS));
    
    // Persistence
    optionsRow.appendChild(createSelectField(`${prefix}Persistance`, 'Persistence:', LORE_PERSISTANCE));
    
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
    copyBtn.style.border = '1px solid #f39c12';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.backgroundColor = '#f39c12';
    copyBtn.style.color = '#fff';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = () => copyLore(type, planetIndex);
    
    const pasteBtn = document.createElement('button');
    pasteBtn.textContent = 'Paste';
    pasteBtn.style.padding = '6px 12px';
    pasteBtn.style.border = '1px solid #9b59b6';
    pasteBtn.style.borderRadius = '4px';
    pasteBtn.style.backgroundColor = '#9b59b6';
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
    form.appendChild(quickInsertButtons);
    form.appendChild(footerInput);
    form.appendChild(footerTextCounter);
    form.appendChild(optionsRow);
    form.appendChild(buttonRow);
    
    return form;
}

function createSelectField(id, label, options) {
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
        optionEl.textContent = option;
        select.appendChild(optionEl);
    });
    
    container.appendChild(labelEl);
    container.appendChild(select);
    
    return container;
}

function createQuickInsertButtons(targetInputId, type = 'system', hexLabel = '', planetData = null) {
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '4px';
    buttonContainer.style.marginBottom = '4px';
    
    // Define different button sets for system vs planet lore
    const systemButtons = [
        { name: 'token', text: `/add_token tile_name:${hexLabel} token:` },
        { name: 'plastic', text: `/add_units tile_name:${hexLabel} unit_names:` },
        { name: 'tg', text: '/player stats trade_goods:' },
        { name: 'commodities', text: '/player stats commodities:' }
    ];
    
    const planetName = planetData && (planetData.name || planetData.planetID || planetData.id) || 'planet_name';
    const cleanPlanetName = planetName.replace(/\s+/g, ''); // Remove spaces for command format
    const planetButtons = [
        { name: 'token', text: `/add_token tile_name:${hexLabel} planet:${cleanPlanetName} token:` },
        { name: 'plastic', text: `/add_units tile_name:${hexLabel} unit_names:` },
        { name: 'tg', text: '/player stats trade_goods:' },
        { name: 'commodities', text: '/player stats commodities:' }
    ];
    
    const buttons = type === 'planet' ? planetButtons : systemButtons;
    
    buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = button.name;
        btn.style.cssText = `
            padding: 2px 6px;
            font-size: 0.8em;
            border: 1px solid #666;
            border-radius: 3px;
            background: #3498db;
            color: white;
            cursor: pointer;
            transition: background-color 0.2s ease;
        `;
        
        btn.onmouseover = () => btn.style.backgroundColor = '#2980b9';
        btn.onmouseout = () => btn.style.backgroundColor = '#3498db';
        
        btn.onclick = (e) => {
            e.preventDefault();
            const targetInput = document.getElementById(targetInputId);
            if (targetInput) {
                // Add the text to the input
                const currentValue = targetInput.value;
                const newValue = currentValue + (currentValue ? ' ' : '') + button.text;
                targetInput.value = newValue;
                
                // Focus the input and set cursor at the end
                targetInput.focus();
                targetInput.setSelectionRange(newValue.length, newValue.length);
            }
        };
        
        buttonContainer.appendChild(btn);
    });
    
    return buttonContainer;
}

function updateQuickInsertButtons(hex) {
    console.log('updateQuickInsertButtons called with hex:', hex);
    console.log('Hex label:', hex.label);
    console.log('Hex planets:', hex.planets);
    
    // Update system buttons
    const systemFooterInput = document.querySelector('#systemFooterText');
    console.log('System footer input found:', !!systemFooterInput);
    
    let systemButtons = [];
    if (systemFooterInput) {
        // The button container is the previous sibling of the footer input
        const buttonContainer = systemFooterInput.previousElementSibling;
        console.log('System button container found:', !!buttonContainer);
        console.log('System button container style:', buttonContainer?.style?.display);
        if (buttonContainer && buttonContainer.style.display === 'flex') {
            systemButtons = buttonContainer.children;
        }
    }
    
    console.log('Found system buttons:', systemButtons.length);
    
    if (systemButtons.length > 0) {
        const buttonTexts = [
            `/add_token tile_name:${hex.label} token:`,
            `/add_units tile_name:${hex.label} unit_names:`,
            '/player stats trade_goods:',
            '/player stats commodities:'
        ];
        
        console.log('System button texts:', buttonTexts);
        
        Array.from(systemButtons).forEach((btn, index) => {
            if (index < buttonTexts.length) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    const targetInput = document.getElementById('systemFooterText');
                    if (targetInput) {
                        const currentValue = targetInput.value;
                        const newValue = currentValue + (currentValue ? ' ' : '') + buttonTexts[index];
                        targetInput.value = newValue;
                        targetInput.focus();
                        targetInput.setSelectionRange(newValue.length, newValue.length);
                    }
                };
            }
        });
    }
    
    // Update planet buttons
    const planetCount = hex.planets?.length || 0;
    console.log('Planet count:', planetCount);
    
    for (let i = 0; i < planetCount; i++) {
        const planet = hex.planets[i];
        console.log(`Planet ${i}:`, planet);
        
        const planetName = (planet && (planet.name || planet.planetID || planet.id)) || `planet_${i+1}`;
        const cleanPlanetName = planetName.replace(/\s+/g, ''); // Remove spaces for command format
        console.log(`Planet ${i} name: "${planetName}" -> "${cleanPlanetName}"`);
        
        const planetFooterInput = document.querySelector(`#planet${i}FooterText`);
        console.log(`Planet ${i} footer input found:`, !!planetFooterInput);
        
        let planetButtons = [];
        if (planetFooterInput) {
            // The button container is the previous sibling of the footer input
            const buttonContainer = planetFooterInput.previousElementSibling;
            console.log(`Planet ${i} button container found:`, !!buttonContainer);
            console.log(`Planet ${i} button container style:`, buttonContainer?.style?.display);
            if (buttonContainer && buttonContainer.style.display === 'flex') {
                planetButtons = buttonContainer.children;
            }
        }
        
        console.log(`Found planet ${i} buttons:`, planetButtons.length);
        
        if (planetButtons.length > 0) {
            const buttonTexts = [
                `/add_token tile_name:${hex.label} planet:${cleanPlanetName} token:`,
                `/add_units tile_name:${hex.label} unit_names:`,
                '/player stats trade_goods:',
                '/player stats commodities:'
            ];
            
            console.log(`Planet ${i} button texts:`, buttonTexts);
            
            Array.from(planetButtons).forEach((btn, index) => {
                if (index < buttonTexts.length) {
                    btn.onclick = (e) => {
                        e.preventDefault();
                        const targetInput = document.getElementById(`planet${i}FooterText`);
                        if (targetInput) {
                            const currentValue = targetInput.value;
                            const newValue = currentValue + (currentValue ? ' ' : '') + buttonTexts[index];
                            targetInput.value = newValue;
                            targetInput.focus();
                            targetInput.setSelectionRange(newValue.length, newValue.length);
                        }
                    };
                }
            });
        }
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
    exportBtn.style.border = '1px solid #3498db';
    exportBtn.style.borderRadius = '4px';
    exportBtn.style.backgroundColor = '#3498db';
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
    
    // Update quick insert buttons with hex and planet data (with slight delay to ensure DOM is ready)
    setTimeout(() => {
        updateQuickInsertButtons(hex);
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
    const planetLore = loreManager.getAllPlanetLore(hexLabel);
    
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
    
    // Validate length constraints before saving
    const loreTextLength = loreData.loreText.length;
    const footerTextLength = loreData.footerText.length;
    
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
            <div style="line-height: 1.6;">
                <h4>Overview</h4>
                <p>The Lore Module allows you to add narrative text and triggers to systems and planets.</p>
                
                <h4>Usage</h4>
                <ol>
                    <li><strong>Select a Hex:</strong> Enter the hex label (e.g., 001, 201) and click Select</li>
                    <li><strong>System Lore:</strong> Add lore that applies to the entire system</li>
                    <li><strong>Planet Lore:</strong> Add lore for individual planets (if the system has planets)</li>
                    <li><strong>Configure Options:</strong>
                        <ul>
                            <li><strong>Receiver:</strong> Who sees the lore (CURRENT, ADJACENT, ALL)</li>
                            <li><strong>Trigger:</strong> When it activates (CONTROLLED, ACTIVATED, EXPLORED)</li>
                            <li><strong>Ping:</strong> Whether to notify players (YES, NO)</li>
                            <li><strong>Persistence:</strong> How often it triggers (ONCE, ALWAYS, CONDITIONAL)</li>
                        </ul>
                    </li>
                </ol>
                
                <h4>Export/Import</h4>
                <p>Use Export Lore to save your lore data to a JSON file, and Import Lore to load it back.</p>
                
                <h4>Data Structure</h4>
                <p>Lore data is stored in the hex properties as <code>systemLore</code> and <code>planetLore</code> objects.</p>
            </div>
        `,
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        style: {
            minWidth: '400px',
            maxWidth: '600px',
            border: '2px solid #9b59b6'
        }
    });
}