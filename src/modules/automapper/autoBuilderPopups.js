/**
 * AutoMapper Popups - Popup management for AutoMapper
 * Handles help, settings, presets, and other popup dialogs
 */

import { showPopup, hidePopup } from '../../ui/popupUI.js';
import { createStyledButton, createStyledInput, createCard, createToggle, UI_THEME } from './autoBuilderUI.js';

/**
 * Show AutoMapper help popup
 */
export function showAutoBuilderHelp() {
    const helpContent = document.createElement('div');
    helpContent.style.cssText = `
        max-width: 600px;
        color: ${UI_THEME.colors.text};
        line-height: 1.6;
    `;

    helpContent.innerHTML = `
        <div style="margin-bottom: 24px;">
            <h3 style="color: ${UI_THEME.colors.primary}; margin-bottom: 16px; font-size: 20px;">
                🤖 AutoMapper - Intelligent Map Builder
            </h3>
            <p style="color: ${UI_THEME.colors.textSecondary}; font-size: 14px;">
                AutoMapper uses advanced algorithms to generate balanced, competitive TI4 maps automatically. 
                Save time while ensuring fair and engaging gameplay for all players.
            </p>
        </div>

        <div style="margin-bottom: 24px;">
            <h4 style="color: ${UI_THEME.colors.primary}; margin-bottom: 12px; font-size: 16px;">🎯 Key Features</h4>
            <ul style="color: ${UI_THEME.colors.textSecondary}; font-size: 14px; padding-left: 20px;">
                <li><strong>Balanced Generation:</strong> Ensures fair resource and influence distribution</li>
                <li><strong>Multiple Styles:</strong> Choose from Balanced, Aggressive, Exploration, or Economic focus</li>
                <li><strong>Player Optimization:</strong> Supports 3-8 players with optimized starting positions</li>
                <li><strong>Smart Analysis:</strong> Evaluate existing maps for balance and fairness</li>
                <li><strong>Custom Presets:</strong> Save and load your preferred generation settings</li>
            </ul>
        </div>

        <div style="margin-bottom: 24px;">
            <h4 style="color: ${UI_THEME.colors.primary}; margin-bottom: 12px; font-size: 16px;">⚙️ Generation Modes</h4>
            <div style="display: grid; gap: 12px;">
                <div style="background: rgba(0,212,255,0.1); padding: 12px; border-radius: 6px; border: 1px solid rgba(0,212,255,0.2);">
                    <strong style="color: ${UI_THEME.colors.primary};">Optimal Mode:</strong>
                    <span style="color: ${UI_THEME.colors.textSecondary}; font-size: 13px;">
                        Uses complex algorithms for the best possible balance (slower but recommended)
                    </span>
                </div>
                <div style="background: rgba(108,92,231,0.1); padding: 12px; border-radius: 6px; border: 1px solid rgba(108,92,231,0.2);">
                    <strong style="color: ${UI_THEME.colors.secondary};">Fast Mode:</strong>
                    <span style="color: ${UI_THEME.colors.textSecondary}; font-size: 13px;">
                        Quick generation with good results for casual games
                    </span>
                </div>
                <div style="background: rgba(0,184,148,0.1); padding: 12px; border-radius: 6px; border: 1px solid rgba(0,184,148,0.2);">
                    <strong style="color: ${UI_THEME.colors.success};">Iterative Mode:</strong>
                    <span style="color: ${UI_THEME.colors.textSecondary}; font-size: 13px;">
                        Generates multiple maps and selects the best one
                    </span>
                </div>
            </div>
        </div>

        <div style="margin-bottom: 24px;">
            <h4 style="color: ${UI_THEME.colors.primary}; margin-bottom: 12px; font-size: 16px;">📊 Map Styles</h4>
            <div style="display: grid; gap: 8px; font-size: 13px;">
                <div><strong style="color: #00b894;">Balanced:</strong> <span style="color: ${UI_THEME.colors.textSecondary};">Well-rounded maps with fair resource distribution (Recommended)</span></div>
                <div><strong style="color: #e17055;">Aggressive:</strong> <span style="color: ${UI_THEME.colors.textSecondary};">Higher conflict potential with contested areas</span></div>
                <div><strong style="color: #a29bfe;">Exploration:</strong> <span style="color: ${UI_THEME.colors.textSecondary};">More anomalies and exploration opportunities</span></div>
                <div><strong style="color: #fdcb6e;">Economic:</strong> <span style="color: ${UI_THEME.colors.textSecondary};">Resource-focused with high economic potential</span></div>
            </div>
        </div>

        <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <h4 style="color: ${UI_THEME.colors.warning}; margin-bottom: 8px; font-size: 14px;">💡 Tips for Best Results</h4>
            <ul style="color: ${UI_THEME.colors.textSecondary}; font-size: 13px; margin: 0; padding-left: 16px;">
                <li>Use Optimal mode for competitive tournaments</li>
                <li>Analyze your current map to identify balance issues</li>
                <li>Try different styles to match your group's playstyle</li>
                <li>Save good maps using the Export feature</li>
            </ul>
        </div>
    `;

    showPopup({
        id: 'automapper-help',
        title: '🤖 AutoMapper Help',
        content: helpContent,
        draggable: true,
        scalable: false,
        modal: false,
        actions: [
            {
                label: 'Got it!',
                onClick: () => hidePopup('automapper-help'),
                style: {
                    background: UI_THEME.gradients.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    cursor: 'pointer'
                }
            }
        ],
        style: {
            maxWidth: '680px',
            maxHeight: '80vh',
            background: UI_THEME.colors.background,
            border: `2px solid ${UI_THEME.colors.primary}`,
            borderRadius: '10px',
            boxShadow: UI_THEME.shadows.large
        }
    });
}

/**
 * Show presets selection popup
 * @param {Object} presets - Available presets
 */
export function showPresetsPopup(presets) {
    const presetsContent = document.createElement('div');
    presetsContent.style.cssText = `
        max-width: 500px;
        color: ${UI_THEME.colors.text};
    `;

    let presetsHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="color: ${UI_THEME.colors.primary}; margin-bottom: 12px;">⚙️ Map Generation Presets</h3>
            <p style="color: ${UI_THEME.colors.textSecondary}; font-size: 14px; margin-bottom: 20px;">
                Choose from predefined settings or create your own custom preset.
            </p>
        </div>
        <div style="display: grid; gap: 12px; margin-bottom: 20px;">
    `;

    Object.entries(presets).forEach(([key, preset]) => {
        const colors = {
            balanced: '#00b894',
            aggressive: '#e17055',
            exploration: '#a29bfe',
            economic: '#fdcb6e'
        };

        presetsHTML += `
            <div class="preset-option" data-preset="${key}" style="
                background: rgba(255,255,255,0.05);
                border: 2px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
            ">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <div style="
                        width: 12px; 
                        height: 12px; 
                        background: ${colors[key] || UI_THEME.colors.primary}; 
                        border-radius: 50%;
                    "></div>
                    <h4 style="margin: 0; color: ${colors[key] || UI_THEME.colors.primary}; font-size: 16px;">
                        ${preset.name}
                    </h4>
                </div>
                <p style="margin: 0 0 12px 24px; color: ${UI_THEME.colors.textSecondary}; font-size: 13px;">
                    ${preset.description}
                </p>
                <div style="margin-left: 24px; font-size: 12px; color: ${UI_THEME.colors.textSecondary};">
                    <span>Conflict: ${Math.round(preset.conflictLevel * 100)}%</span> • 
                    <span>Anomalies: ${Math.round(preset.anomalyDensity * 100)}%</span> • 
                    <span>Exploration: ${Math.round(preset.explorationFactor * 100)}%</span>
                </div>
            </div>
        `;
    });

    presetsHTML += `
        </div>
        <div style="text-align: center; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
            <button id="createCustomPreset" style="
                background: ${UI_THEME.gradients.secondary};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 16px;
                cursor: pointer;
                font-size: 14px;
                margin-right: 8px;
            ">
                ✨ Create Custom Preset
            </button>
            <button id="importPreset" style="
                background: transparent;
                color: ${UI_THEME.colors.primary};
                border: 1px solid ${UI_THEME.colors.primary};
                border-radius: 4px;
                padding: 8px 16px;
                cursor: pointer;
                font-size: 14px;
            ">
                📥 Import Preset
            </button>
        </div>
    `;

    presetsContent.innerHTML = presetsHTML;

    showPopup({
        id: 'automapper-presets',
        title: '⚙️ Generation Presets',
        content: presetsContent,
        draggable: true,
        modal: false,
        actions: [
            {
                label: 'Close',
                onClick: () => hidePopup('automapper-presets'),
                style: {
                    background: '#444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    cursor: 'pointer'
                }
            }
        ],
        style: {
            maxWidth: '540px',
            background: UI_THEME.colors.background,
            border: `2px solid ${UI_THEME.colors.primary}`,
            borderRadius: '10px',
            boxShadow: UI_THEME.shadows.large
        }
    });

    // Add event listeners after popup is shown
    setTimeout(() => {
        // Preset selection
        document.querySelectorAll('.preset-option').forEach(option => {
            option.addEventListener('click', () => {
                const presetKey = option.getAttribute('data-preset');
                applyPreset(presetKey, presets[presetKey]);
                hidePopup('automapper-presets');
            });

            option.addEventListener('mouseenter', () => {
                option.style.borderColor = UI_THEME.colors.primary;
                option.style.background = 'rgba(0,212,255,0.1)';
            });

            option.addEventListener('mouseleave', () => {
                option.style.borderColor = 'rgba(255,255,255,0.1)';
                option.style.background = 'rgba(255,255,255,0.05)';
            });
        });

        // Custom preset button
        const customBtn = document.getElementById('createCustomPreset');
        if (customBtn) {
            customBtn.addEventListener('click', () => {
                hidePopup('automapper-presets');
                showCustomSettingsPopup();
            });
        }

        // Import preset button
        const importBtn = document.getElementById('importPreset');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                showImportPresetDialog();
            });
        }
    }, 100);
}

/**
 * Show custom settings popup
 */
export function showCustomSettingsPopup() {
    const settingsContent = document.createElement('div');
    settingsContent.style.cssText = `
        max-width: 480px;
        color: ${UI_THEME.colors.text};
    `;

    settingsContent.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="color: ${UI_THEME.colors.primary}; margin-bottom: 12px;">✨ Custom Generation Settings</h3>
            <p style="color: ${UI_THEME.colors.textSecondary}; font-size: 14px;">
                Fine-tune the map generation parameters to create your perfect game experience.
            </p>
        </div>

        <div style="display: grid; gap: 20px; margin-bottom: 24px;">
            <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${UI_THEME.colors.primary};">
                    Resource Variance: <span id="resourceVarianceValue">15%</span>
                </label>
                <input type="range" id="resourceVariance" min="5" max="30" value="15" style="
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    background: #444;
                    outline: none;
                    -webkit-appearance: none;
                ">
                <div style="font-size: 12px; color: ${UI_THEME.colors.textSecondary}; margin-top: 4px;">
                    Lower values create more balanced resource distribution
                </div>
            </div>

            <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${UI_THEME.colors.primary};">
                    Anomaly Density: <span id="anomalyDensityValue">12%</span>
                </label>
                <input type="range" id="anomalyDensity" min="0" max="40" value="12" style="
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    background: #444;
                    outline: none;
                    -webkit-appearance: none;
                ">
                <div style="font-size: 12px; color: ${UI_THEME.colors.textSecondary}; margin-top: 4px;">
                    Percentage of systems with anomalies (nebulae, asteroid fields, etc.)
                </div>
            </div>

            <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${UI_THEME.colors.primary};">
                    Conflict Level: <span id="conflictLevelValue">50%</span>
                </label>
                <input type="range" id="conflictLevel" min="10" max="90" value="50" style="
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    background: #444;
                    outline: none;
                    -webkit-appearance: none;
                ">
                <div style="font-size: 12px; color: ${UI_THEME.colors.textSecondary}; margin-top: 4px;">
                    How likely players are to compete for the same strategic areas
                </div>
            </div>

            <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${UI_THEME.colors.primary};">
                    Exploration Factor: <span id="explorationFactorValue">30%</span>
                </label>
                <input type="range" id="explorationFactor" min="10" max="80" value="30" style="
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    background: #444;
                    outline: none;
                    -webkit-appearance: none;
                ">
                <div style="font-size: 12px; color: ${UI_THEME.colors.textSecondary}; margin-top: 4px;">
                    Emphasis on exploration rewards and frontier systems
                </div>
            </div>
        </div>

        <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 12px 0; color: ${UI_THEME.colors.primary}; font-size: 14px;">Advanced Options</h4>
            <div id="advancedToggles" style="display: grid; gap: 12px;"></div>
        </div>

        <div style="display: flex; gap: 12px;">
            <input type="text" id="presetName" placeholder="Preset Name (optional)" style="
                flex: 1;
                padding: 8px 12px;
                border: 1px solid #444;
                border-radius: 4px;
                background: #2a2a3e;
                color: #fff;
                font-size: 14px;
            ">
            <button id="savePreset" style="
                background: ${UI_THEME.gradients.success};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 16px;
                cursor: pointer;
                font-size: 14px;
                white-space: nowrap;
            ">
                💾 Save Preset
            </button>
        </div>
    `;

    showPopup({
        id: 'automapper-custom-settings',
        title: '✨ Custom Settings',
        content: settingsContent,
        draggable: true,
        modal: false,
        actions: [
            {
                label: 'Apply Settings',
                onClick: () => {
                    applyCustomSettings();
                    hidePopup('automapper-custom-settings');
                },
                style: {
                    background: UI_THEME.gradients.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    cursor: 'pointer'
                }
            },
            {
                label: 'Cancel',
                onClick: () => hidePopup('automapper-custom-settings'),
                style: {
                    background: '#444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    cursor: 'pointer'
                }
            }
        ],
        style: {
            maxWidth: '520px',
            background: UI_THEME.colors.background,
            border: `2px solid ${UI_THEME.colors.primary}`,
            borderRadius: '10px',
            boxShadow: UI_THEME.shadows.large
        }
    });

    // Add event listeners after popup is shown
    setTimeout(() => {
        // Range slider updates
        ['resourceVariance', 'anomalyDensity', 'conflictLevel', 'explorationFactor'].forEach(id => {
            const slider = document.getElementById(id);
            const valueSpan = document.getElementById(id + 'Value');

            if (slider && valueSpan) {
                slider.addEventListener('input', () => {
                    valueSpan.textContent = slider.value + '%';
                });
            }
        });

        // Advanced toggles
        const togglesContainer = document.getElementById('advancedToggles');
        if (togglesContainer) {
            const toggles = [
                { id: 'balanceTech', label: 'Balance Tech Planets', checked: true },
                { id: 'ensureWormholes', label: 'Ensure Wormhole Access', checked: true },
                { id: 'avoidDeadlocks', label: 'Avoid Strategic Deadlocks', checked: true },
                { id: 'legendaryBalance', label: 'Balance Legendary Planets', checked: false }
            ];

            toggles.forEach(toggle => {
                const toggleElement = createToggle(toggle.label, toggle.checked, (checked) => {
                    console.log(`${toggle.id}: ${checked}`);
                });
                toggleElement.setAttribute('data-setting', toggle.id);
                togglesContainer.appendChild(toggleElement);
            });
        }

        // Save preset button
        const saveBtn = document.getElementById('savePreset');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                saveCustomPreset();
            });
        }
    }, 100);
}

/**
 * Show import preset dialog
 */
function showImportPresetDialog() {
    const importContent = document.createElement('div');
    importContent.innerHTML = `
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: ${UI_THEME.colors.primary}; font-weight: 500;">
                Paste Preset JSON:
            </label>
            <textarea id="presetJson" placeholder="Paste your preset configuration here..." style="
                width: 100%;
                height: 120px;
                padding: 12px;
                border: 1px solid #444;
                border-radius: 4px;
                background: #2a2a3e;
                color: #fff;
                font-size: 13px;
                font-family: monospace;
                resize: vertical;
            "></textarea>
        </div>
        <div style="font-size: 12px; color: ${UI_THEME.colors.textSecondary};">
            Import a preset configuration from a JSON file or shared preset code.
        </div>
    `;

    showPopup({
        id: 'import-preset-dialog',
        title: '📥 Import Preset',
        content: importContent,
        draggable: true,
        modal: true,
        actions: [
            {
                label: 'Import',
                onClick: () => {
                    const json = document.getElementById('presetJson')?.value;
                    if (json) {
                        try {
                            const preset = JSON.parse(json);
                            console.log('Imported preset:', preset);
                            hidePopup('import-preset-dialog');
                            // Apply imported preset
                        } catch (e) {
                            alert('Invalid JSON format');
                        }
                    }
                },
                style: {
                    background: UI_THEME.gradients.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    cursor: 'pointer'
                }
            },
            {
                label: 'Cancel',
                onClick: () => hidePopup('import-preset-dialog'),
                style: {
                    background: '#444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    cursor: 'pointer'
                }
            }
        ],
        style: {
            maxWidth: '400px',
            background: UI_THEME.colors.background,
            border: `2px solid ${UI_THEME.colors.primary}`,
            borderRadius: '10px'
        }
    });
}

/**
 * Apply a preset to the UI
 */
function applyPreset(presetKey, preset) {
    console.log(`Applying preset: ${presetKey}`, preset);

    // Update the map style selector
    const mapStyleSelect = document.getElementById('autoMapStyle');
    if (mapStyleSelect) {
        mapStyleSelect.value = presetKey;
    }

    // Show confirmation
    const message = `Applied "${preset.name}" preset. ${preset.description}`;
    if (typeof window !== 'undefined' && window.showToast) {
        window.showToast(message, 'success');
    } else {
        console.log(message);
    }
}

/**
 * Apply custom settings
 */
function applyCustomSettings() {
    const settings = {
        resourceVariance: document.getElementById('resourceVariance')?.value || 15,
        anomalyDensity: document.getElementById('anomalyDensity')?.value || 12,
        conflictLevel: document.getElementById('conflictLevel')?.value || 50,
        explorationFactor: document.getElementById('explorationFactor')?.value || 30
    };

    console.log('Applying custom settings:', settings);

    // Update the map style to custom
    const mapStyleSelect = document.getElementById('autoMapStyle');
    if (mapStyleSelect) {
        mapStyleSelect.value = 'custom';
    }

    // Store settings for later use
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('automapper_custom_settings', JSON.stringify(settings));
    }
}

/**
 * Save custom preset
 */
function saveCustomPreset() {
    const name = document.getElementById('presetName')?.value || 'Custom Preset';
    const settings = {
        name,
        resourceVariance: parseInt(document.getElementById('resourceVariance')?.value || 15) / 100,
        anomalyDensity: parseInt(document.getElementById('anomalyDensity')?.value || 12) / 100,
        conflictLevel: parseInt(document.getElementById('conflictLevel')?.value || 50) / 100,
        explorationFactor: parseInt(document.getElementById('explorationFactor')?.value || 30) / 100,
        description: 'Custom user-defined preset'
    };

    console.log('Saving custom preset:', settings);

    // Save to localStorage
    if (typeof localStorage !== 'undefined') {
        const saved = JSON.parse(localStorage.getItem('automapper_custom_presets') || '{}');
        saved[name.toLowerCase().replace(/\s+/g, '_')] = settings;
        localStorage.setItem('automapper_custom_presets', JSON.stringify(saved));
    }

    // Show success message
    if (typeof window !== 'undefined' && window.showToast) {
        window.showToast(`Preset "${name}" saved successfully!`, 'success');
    }
}