/**
 * AutoMapper - Automatic Map Builder Module
 * Main entry point for the automatic map generation system
 */

import { generateBalancedMap, calculateMapBalance, getMapGenerationPresets } from './autoBuilderCore.js';

/**
 * Main function to show the AutoMapper UI
 * @param {HTMLElement} container - The container element to render the UI into
 */
export function showAutoBuilderUI(container) {
    if (!container) {
        console.error('AutoMapper: No container provided for UI');
        return;
    }

    // Clear container and set up base structure
    container.innerHTML = '';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
        font-family: 'Segoe UI', Arial, sans-serif;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #ffffff;
    `;

    // Header section
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 16px 20px;
        background: linear-gradient(90deg, #0f3460 0%, #16537e 100%);
        border-bottom: 2px solid #00d4ff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

    header.innerHTML = `
        <h2 style="margin: 0 0 8px 0; color: #00d4ff; font-size: 24px; font-weight: 600;">
            🤖 AutoMapper - Intelligent Map Builder
        </h2>
        <p style="margin: 0; color: #b8c6db; font-size: 14px;">
            Generate balanced, competitive TI4 maps using advanced algorithms
        </p>
    `;

    // Control panel
    const controlPanel = document.createElement('div');
    controlPanel.style.cssText = `
        padding: 20px;
        background: rgba(22, 83, 126, 0.1);
        border-bottom: 1px solid rgba(255,255,255,0.1);
        flex-shrink: 0;
    `;

    controlPanel.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #00d4ff;">Player Count:</label>
                <select id="autoPlayerCount" style="width: 100%; padding: 8px 12px; border: 1px solid #444; border-radius: 4px; background: #2a2a3e; color: #fff; font-size: 14px;">
                    <option value="3">3 Players</option>
                    <option value="4">4 Players</option>
                    <option value="5">5 Players</option>
                    <option value="6" selected>6 Players</option>
                    <option value="7">7 Players</option>
                    <option value="8">8 Players</option>
                </select>
            </div>
            <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #00d4ff;">Map Style:</label>
                <select id="autoMapStyle" style="width: 100%; padding: 8px 12px; border: 1px solid #444; border-radius: 4px; background: #2a2a3e; color: #fff; font-size: 14px;">
                    <option value="balanced" selected>Balanced (Recommended)</option>
                    <option value="aggressive">Aggressive (More conflict)</option>
                    <option value="exploration">Exploration (More anomalies)</option>
                    <option value="economic">Economic (Resource focus)</option>
                    <option value="custom">Custom Settings</option>
                </select>
            </div>
            <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #00d4ff;">Generation Mode:</label>
                <select id="autoGenMode" style="width: 100%; padding: 8px 12px; border: 1px solid #444; border-radius: 4px; background: #2a2a3e; color: #fff; font-size: 14px;">
                    <option value="optimal" selected>Optimal (Slower, better)</option>
                    <option value="fast">Fast (Quick generation)</option>
                    <option value="iterative">Iterative (Multiple attempts)</option>
                </select>
            </div>
        </div>

        <div style="display: flex; gap: 12px; align-items: center; justify-content: center;">
            <button id="autoGenerateBtn" style="
                padding: 12px 24px; 
                background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
                color: #fff; 
                border: none; 
                border-radius: 6px; 
                font-size: 16px; 
                font-weight: 600;
                cursor: pointer; 
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
            ">
                🎲 Generate Map
            </button>
            <button id="autoAnalyzeBtn" style="
                padding: 12px 24px; 
                background: linear-gradient(135deg, #6c5ce7 0%, #5a4fcf 100%);
                color: #fff; 
                border: none; 
                border-radius: 6px; 
                font-size: 16px; 
                font-weight: 600;
                cursor: pointer; 
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(108, 92, 231, 0.3);
            ">
                📊 Analyze Current Map
            </button>
            <button id="autoPresetBtn" style="
                padding: 12px 24px; 
                background: linear-gradient(135deg, #00b894 0%, #00a085 100%);
                color: #fff; 
                border: none; 
                border-radius: 6px; 
                font-size: 16px; 
                font-weight: 600;
                cursor: pointer; 
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 184, 148, 0.3);
            ">
                ⚙️ Presets
            </button>
        </div>
    `;

    // Results area
    const resultsArea = document.createElement('div');
    resultsArea.id = 'autoBuilderResults';
    resultsArea.style.cssText = `
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        background: rgba(0,0,0,0.1);
    `;

    resultsArea.innerHTML = `
        <div style="text-align: center; color: #888; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🗺️</div>
            <p style="font-size: 18px; margin-bottom: 8px;">Ready to Generate</p>
            <p style="font-size: 14px;">Configure your settings above and click "Generate Map" to begin</p>
        </div>
    `;

    // Assemble UI
    container.appendChild(header);
    container.appendChild(controlPanel);
    container.appendChild(resultsArea);

    // Add event listeners after DOM is ready
    setTimeout(() => {
        setupEventListeners();
    }, 100);
}

/**
 * Set up event listeners for the AutoMapper UI
 */
function setupEventListeners() {
    console.log('AutoMapper: Setting up event listeners');

    // Generate button
    const generateBtn = document.getElementById('autoGenerateBtn');
    if (generateBtn) {
        console.log('AutoMapper: Found generate button, adding listeners');
        generateBtn.addEventListener('click', handleGenerateMap);
        generateBtn.addEventListener('mouseenter', () => {
            generateBtn.style.transform = 'translateY(-2px)';
            generateBtn.style.boxShadow = '0 6px 16px rgba(0, 212, 255, 0.4)';
        });
        generateBtn.addEventListener('mouseleave', () => {
            generateBtn.style.transform = 'translateY(0)';
            generateBtn.style.boxShadow = '0 4px 12px rgba(0, 212, 255, 0.3)';
        });
    } else {
        console.error('AutoMapper: Generate button not found');
    }

    // Analyze button
    const analyzeBtn = document.getElementById('autoAnalyzeBtn');
    if (analyzeBtn) {
        console.log('AutoMapper: Found analyze button, adding listeners');
        analyzeBtn.addEventListener('click', handleAnalyzeMap);
        analyzeBtn.addEventListener('mouseenter', () => {
            analyzeBtn.style.transform = 'translateY(-2px)';
            analyzeBtn.style.boxShadow = '0 6px 16px rgba(108, 92, 231, 0.4)';
        });
        analyzeBtn.addEventListener('mouseleave', () => {
            analyzeBtn.style.transform = 'translateY(0)';
            analyzeBtn.style.boxShadow = '0 4px 12px rgba(108, 92, 231, 0.3)';
        });
    } else {
        console.error('AutoMapper: Analyze button not found');
    }

    // Preset button
    const presetBtn = document.getElementById('autoPresetBtn');
    if (presetBtn) {
        console.log('AutoMapper: Found preset button, adding listeners');
        presetBtn.addEventListener('click', handleShowPresets);
        presetBtn.addEventListener('mouseenter', () => {
            presetBtn.style.transform = 'translateY(-2px)';
            presetBtn.style.boxShadow = '0 6px 16px rgba(0, 184, 148, 0.4)';
        });
        presetBtn.addEventListener('mouseleave', () => {
            presetBtn.style.transform = 'translateY(0)';
            presetBtn.style.boxShadow = '0 4px 12px rgba(0, 184, 148, 0.3)';
        });
    } else {
        console.error('AutoMapper: Preset button not found');
    }

    // Map style change handler
    const mapStyleSelect = document.getElementById('autoMapStyle');
    if (mapStyleSelect) {
        console.log('AutoMapper: Found map style select, adding listeners');
        mapStyleSelect.addEventListener('change', handleMapStyleChange);
    } else {
        console.error('AutoMapper: Map style select not found');
    }
}

/**
 * Handle map generation
 */
async function handleGenerateMap() {
    console.log('AutoMapper: Generate map button clicked!');

    const resultsArea = document.getElementById('autoBuilderResults');
    const generateBtn = document.getElementById('autoGenerateBtn');

    if (!resultsArea || !generateBtn) {
        console.error('AutoMapper: Missing UI elements', { resultsArea: !!resultsArea, generateBtn: !!generateBtn });
        return;
    }

    // Get settings
    const playerCount = parseInt(document.getElementById('autoPlayerCount')?.value || '6');
    const mapStyle = document.getElementById('autoMapStyle')?.value || 'balanced';
    const genMode = document.getElementById('autoGenMode')?.value || 'optimal';

    console.log('AutoMapper: Generation settings:', { playerCount, mapStyle, genMode });

    // Disable button and show loading
    generateBtn.disabled = true;
    generateBtn.textContent = '🔄 Generating...';
    generateBtn.style.opacity = '0.7';

    // Progress tracking
    let currentStep = '';
    let currentProgress = 0;

    const updateProgress = (step, progress) => {
        currentStep = step;
        currentProgress = progress;

        resultsArea.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px; animation: spin 2s linear infinite;">⚙️</div>
                <p style="font-size: 18px; margin-bottom: 8px; color: #00d4ff;">Generating Map...</p>
                <p style="font-size: 14px; color: #888; margin-bottom: 20px;">${step}</p>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin: 20px auto; max-width: 300px; overflow: hidden;">
                    <div style="height: 100%; background: linear-gradient(90deg, #00d4ff, #0099cc); border-radius: 3px; width: ${progress}%; transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 12px; color: #666;">${progress}% complete</div>
            </div>
            <style>
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            </style>
        `;
    };

    // Initial progress
    updateProgress('Initializing...', 0);

    try {
        // Generate the map with progress callback
        const mapResult = await generateBalancedMap(playerCount, mapStyle, genMode, updateProgress);

        // Store the generated map data for application
        lastGeneratedMapData = mapResult;

        // Show results
        displayMapResults(mapResult);

    } catch (error) {
        console.error('AutoMapper: Map generation failed:', error);
        resultsArea.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px; color: #ff6b6b;">❌</div>
                <p style="font-size: 18px; margin-bottom: 8px; color: #ff6b6b;">Generation Failed</p>
                <p style="font-size: 14px; color: #888; margin-bottom: 8px;">Last step: ${currentStep}</p>
                <p style="font-size: 14px; color: #888;">${error.message || 'Unknown error occurred'}</p>
                <button onclick="handleGenerateMap()" style="margin-top: 16px; padding: 8px 16px; background: #00d4ff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Try Again
                </button>
            </div>
        `;
    } finally {
        // Re-enable button
        generateBtn.disabled = false;
        generateBtn.textContent = '🎲 Generate Map';
        generateBtn.style.opacity = '1';
    }
}

/**
 * Handle map analysis
 */
async function handleAnalyzeMap() {
    console.log('AutoMapper: Analyze map button clicked!');

    const resultsArea = document.getElementById('autoBuilderResults');
    if (!resultsArea) {
        console.error('AutoMapper: Results area not found');
        return;
    }

    resultsArea.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
            <p style="font-size: 18px; margin-bottom: 8px; color: #6c5ce7;">Analyzing Current Map...</p>
            <p style="font-size: 14px; color: #888;">Evaluating balance and strategic positions</p>
        </div>
    `;

    try {
        const analysis = await calculateMapBalance();
        displayAnalysisResults(analysis);
    } catch (error) {
        console.error('AutoMapper: Analysis failed:', error);
        resultsArea.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px; color: #ff6b6b;">❌</div>
                <p style="font-size: 18px; color: #ff6b6b;">Analysis Failed</p>
                <p style="font-size: 14px; color: #888;">${error.message || 'Could not analyze current map'}</p>
            </div>
        `;
    }
}

/**
 * Handle showing presets
 */
function handleShowPresets() {
    console.log('AutoMapper: Presets button clicked!');

    const presets = getMapGenerationPresets();

    // This will be implemented to show a preset selection popup
    import('./autoBuilderPopups.js').then(mod => {
        if (mod.showPresetsPopup) {
            console.log('AutoMapper: Showing presets popup');
            mod.showPresetsPopup(presets);
        } else {
            console.error('AutoMapper: showPresetsPopup function not found');
        }
    }).catch(err => {
        console.error('AutoMapper: Failed to load autoBuilderPopups.js', err);
    });
}

/**
 * Handle map style changes
 */
function handleMapStyleChange() {
    console.log('AutoMapper: Map style changed!');

    const mapStyle = document.getElementById('autoMapStyle')?.value;
    console.log('AutoMapper: New map style:', mapStyle);

    if (mapStyle === 'custom') {
        // Show custom settings
        import('./autoBuilderPopups.js').then(mod => {
            if (mod.showCustomSettingsPopup) {
                console.log('AutoMapper: Showing custom settings popup');
                mod.showCustomSettingsPopup();
            } else {
                console.error('AutoMapper: showCustomSettingsPopup function not found');
            }
        }).catch(err => {
            console.error('AutoMapper: Failed to load autoBuilderPopups.js', err);
        });
    }
}

/**
 * Display map generation results
 */
function displayMapResults(mapResult) {
    const resultsArea = document.getElementById('autoBuilderResults');
    if (!resultsArea || !mapResult) return;

    resultsArea.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="color: #00d4ff; margin-bottom: 16px; font-size: 20px;">✅ Map Generated Successfully</h3>
            
            <div style="background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 12px 0; color: #00d4ff;">Map Statistics</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; font-size: 14px;">
                    <div>
                        <strong style="color: #fff;">Balance Score:</strong><br>
                        <span style="color: ${mapResult.balanceScore >= 85 ? '#00b894' : mapResult.balanceScore >= 70 ? '#fdcb6e' : '#ff6b6b'};">
                            ${mapResult.balanceScore}/100
                        </span>
                    </div>
                    <div>
                        <strong style="color: #fff;">Player Positions:</strong><br>
                        <span style="color: #b8c6db;">${mapResult.playerCount} optimized</span>
                    </div>
                    <div>
                        <strong style="color: #fff;">Generation Time:</strong><br>
                        <span style="color: #b8c6db;">${mapResult.generationTime}ms</span>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 12px; margin-bottom: 20px;">
                <button onclick="applyGeneratedMap()" style="
                    padding: 10px 20px; 
                    background: #00b894; 
                    color: white; 
                    border: none; 
                    border-radius: 4px; 
                    cursor: pointer;
                    font-weight: 500;
                ">
                    ✅ Apply to Map
                </button>
                <button onclick="handleGenerateMap()" style="
                    padding: 10px 20px; 
                    background: #0099cc; 
                    color: white; 
                    border: none; 
                    border-radius: 4px; 
                    cursor: pointer;
                    font-weight: 500;
                ">
                    🔄 Generate Another
                </button>
                <button onclick="exportMapData()" style="
                    padding: 10px 20px; 
                    background: #6c5ce7; 
                    color: white; 
                    border: none; 
                    border-radius: 4px; 
                    cursor: pointer;
                    font-weight: 500;
                ">
                    💾 Export Data
                </button>
            </div>

            <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;">
                <h4 style="margin: 0 0 12px 0; color: #fff;">Detailed Analysis</h4>
                <div style="font-size: 14px; line-height: 1.5; color: #b8c6db;">
                    ${formatMapAnalysis(mapResult.analysis)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Display analysis results
 */
function displayAnalysisResults(analysis) {
    const resultsArea = document.getElementById('autoBuilderResults');
    if (!resultsArea || !analysis) return;

    resultsArea.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="color: #6c5ce7; margin-bottom: 16px; font-size: 20px;">📊 Map Analysis Complete</h3>
            
            <div style="background: rgba(108,92,231,0.1); border: 1px solid rgba(108,92,231,0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 12px 0; color: #6c5ce7;">Overall Assessment</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; font-size: 14px;">
                    <div>
                        <strong style="color: #fff;">Balance Rating:</strong><br>
                        <span style="color: ${analysis.balanceRating >= 85 ? '#00b894' : analysis.balanceRating >= 70 ? '#fdcb6e' : '#ff6b6b'};">
                            ${analysis.balanceRating}/100
                        </span>
                    </div>
                    <div>
                        <strong style="color: #fff;">Fairness Index:</strong><br>
                        <span style="color: #b8c6db;">${analysis.fairnessIndex.toFixed(2)}</span>
                    </div>
                    <div>
                        <strong style="color: #fff;">Competitive Level:</strong><br>
                        <span style="color: #b8c6db;">${analysis.competitiveLevel}</span>
                    </div>
                </div>
            </div>

            <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;">
                <h4 style="margin: 0 0 12px 0; color: #fff;">Detailed Breakdown</h4>
                <div style="font-size: 14px; line-height: 1.5; color: #b8c6db;">
                    ${formatAnalysisDetails(analysis)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Format map analysis for display
 */
function formatMapAnalysis(analysis) {
    if (!analysis) return 'No analysis data available.';

    let html = '';
    if (analysis.resourceBalance) {
        html += `<p><strong>Resource Balance:</strong> ${analysis.resourceBalance}</p>`;
    }
    if (analysis.strategicPositions) {
        html += `<p><strong>Strategic Positions:</strong> ${analysis.strategicPositions}</p>`;
    }
    if (analysis.recommendations && analysis.recommendations.length > 0) {
        html += `<p><strong>Recommendations:</strong></p><ul>`;
        analysis.recommendations.forEach(rec => {
            html += `<li>${rec}</li>`;
        });
        html += `</ul>`;
    }
    return html || 'Analysis completed successfully.';
}

/**
 * Format analysis details
 */
function formatAnalysisDetails(analysis) {
    if (!analysis) return 'No analysis data available.';

    let html = '';
    if (analysis.playerAnalysis) {
        html += `<h5 style="color: #00d4ff; margin: 16px 0 8px 0;">Player Position Analysis:</h5>`;
        analysis.playerAnalysis.forEach((player, index) => {
            html += `<p><strong>Player ${index + 1}:</strong> ${player.summary}</p>`;
        });
    }
    if (analysis.mapFeatures) {
        html += `<h5 style="color: #00d4ff; margin: 16px 0 8px 0;">Map Features:</h5>`;
        html += `<p>${analysis.mapFeatures}</p>`;
    }
    return html || 'Analysis completed successfully.';
}

// Store the last generated map data
let lastGeneratedMapData = null;

/**
 * Apply the generated map to the actual hex editor
 */
async function applyGeneratedMap() {
    console.log('AutoMapper: Apply map function called');

    if (!lastGeneratedMapData) {
        alert('No generated map to apply. Please generate a map first.');
        console.log('AutoMapper: No map data available');
        return;
    }

    if (!window.editor) {
        console.error('AutoMapper: Editor instance not found');
        alert('Editor not available. Please refresh the page and try again.');
        return;
    }

    console.log('AutoMapper: Map data to apply:', lastGeneratedMapData);
    console.log('AutoMapper: Available editor hexes:', Object.keys(window.editor.hexes).sort());

    const confirmApply = confirm(
        `This will replace your current map with the generated one. ` +
        `This action cannot be undone. Do you want to continue?`
    );

    if (!confirmApply) {
        console.log('AutoMapper: Apply cancelled by user');
        return;
    }

    try {
        console.log('AutoMapper: Applying generated map to editor', lastGeneratedMapData);

        // Begin undo group for the entire operation
        window.editor.beginUndoGroup();
        window.editor._historyLocked = true;

        // Clear the current map
        console.log('AutoMapper: Clearing current map...');
        await clearCurrentMap();

        // Apply the generated map data
        console.log('AutoMapper: Applying new map data...');
        await applyMapData(lastGeneratedMapData.mapData);

        // Commit the undo group
        window.editor._historyLocked = false;
        window.editor.commitUndoGroup();

        // Update all overlays and visibility
        console.log('AutoMapper: Updating overlays...');
        await updateAllOverlays();

        // Show success message
        if (typeof window.showToast === 'function') {
            window.showToast('Map applied successfully!', 'success');
        } else {
            alert('Map applied successfully!');
        }

        console.log('AutoMapper: Map application completed successfully');

    } catch (error) {
        console.error('AutoMapper: Failed to apply map:', error);

        // Reset history lock if there was an error
        window.editor._historyLocked = false;

        alert(`Failed to apply map: ${error.message || 'Unknown error'}`);
    }
}

/**
 * Clear the current map completely
 */
async function clearCurrentMap() {
    const editor = window.editor;

    // Clear all hexes except corner hexes
    for (const [hexId, hex] of Object.entries(editor.hexes)) {
        if (!['TL', 'TR', 'BL', 'BR'].includes(hexId)) {
            // Save state for this hex before clearing
            editor.saveState(hexId);
            editor.clearAll(hexId);
        }
    }

    console.log('AutoMapper: Current map cleared');
}

/**
 * Apply the generated map data to the editor
 */
async function applyMapData(mapData) {
    const editor = window.editor;

    console.log('AutoMapper: Applying map data:', mapData);

    // Apply center system (Mecatol Rex) first
    if (mapData.centerSystem) {
        console.log('AutoMapper: Placing center system (Mecatol Rex)...');
        await applySystemToHex(mapData.centerSystem.hexId, mapData.centerSystem);
    }

    // Apply home systems
    if (mapData.homePositions && mapData.homePositions.length > 0) {
        console.log('AutoMapper: Placing home systems...');
        for (const homePos of mapData.homePositions) {
            if (homePos.systemData) {
                console.log('AutoMapper: Applying home system to hex', homePos.hexId);
                await applySystemToHex(homePos.hexId, homePos.systemData);
            }
        }
    }

    // Apply regular systems
    if (mapData.systems && mapData.systems.length > 0) {
        console.log('AutoMapper: Placing regular systems...');
        for (const systemData of mapData.systems) {
            if (systemData.hexId) {
                console.log('AutoMapper: Applying system to hex', systemData.hexId);
                await applySystemToHex(systemData.hexId, systemData);
            }
        }
    }

    // Apply any special features or anomalies
    if (mapData.specialFeatures) {
        console.log('AutoMapper: Applying special features...');
        for (const feature of mapData.specialFeatures) {
            await applySpecialFeature(feature);
        }
    }

    console.log('AutoMapper: Map data applied');
}

/**
 * Apply a system to a specific hex
 */
async function applySystemToHex(hexId, systemData) {
    const editor = window.editor;

    console.log(`AutoMapper: Attempting to apply system to hex ${hexId}`, systemData);

    if (!editor.hexes[hexId]) {
        console.warn(`AutoMapper: Hex ${hexId} not found in editor.hexes. Available hexes:`, Object.keys(editor.hexes).sort());
        return;
    }

    try {
        // Convert our generated system data to the format expected by assignSystem
        const systemInfo = convertToSystemFormat(systemData);

        console.log(`AutoMapper: Converted system info for hex ${hexId}:`, systemInfo);

        if (systemInfo) {
            // Save state before assignment
            editor.saveState(hexId);

            // Import assignSystem function and apply
            const { assignSystem } = await import('../../features/assignSystem.js');
            await assignSystem(editor, systemInfo, hexId);

            console.log(`AutoMapper: Successfully applied system to hex ${hexId}:`, systemInfo.id || 'custom');
        } else {
            console.warn(`AutoMapper: Could not convert system data for hex ${hexId}`);
        }
    } catch (error) {
        console.error(`AutoMapper: Failed to apply system to hex ${hexId}:`, error);
    }
}

/**
 * Convert generated system data to the format expected by assignSystem
 */
function convertToSystemFormat(systemData) {
    if (!systemData) {
        console.warn('AutoMapper: No system data provided to convert');
        return null;
    }

    console.log('AutoMapper: Converting system data:', systemData);

    // If it's already a proper system (from sectorIDLookup), use it directly
    if (systemData.id && window.editor.sectorIDLookup && window.editor.sectorIDLookup[systemData.id.toString().toUpperCase()]) {
        const realSystem = window.editor.sectorIDLookup[systemData.id.toString().toUpperCase()];
        console.log('AutoMapper: Found real system:', realSystem);
        return realSystem;
    }

    // For Mecatol Rex, try to find it in the system lookup
    if (systemData.id === 'mecatol_rex' || systemData.name === 'Mecatol Rex') {
        const mecatolKey = Object.keys(window.editor.sectorIDLookup || {}).find(key =>
            key.toLowerCase().includes('mecatol') ||
            window.editor.sectorIDLookup[key]?.name?.toLowerCase().includes('mecatol')
        );
        if (mecatolKey) {
            const mecatol = window.editor.sectorIDLookup[mecatolKey];
            console.log('AutoMapper: Found Mecatol Rex system:', mecatol);
            return mecatol;
        }
    }

    // Otherwise, create a mock system object
    const system = {
        id: systemData.id || `gen_${Math.random().toString(36).substr(2, 9)}`,
        name: systemData.name || `Generated System`,
        planets: systemData.planets || [],
        wormholes: systemData.wormholes || [],
        isNebula: systemData.anomalies?.includes('nebula') || false,
        isAsteroidField: systemData.anomalies?.includes('asteroid') || false,
        isSupernova: systemData.anomalies?.includes('supernova') || false,
        isGravityRift: systemData.anomalies?.includes('rift') || false,
        isHyperlane: systemData.type === 'hyperlane' || false
    };

    // Add some mock planets if the system should have them
    if (systemData.type === 'normal' && system.planets.length === 0) {
        const planetCount = Math.floor(Math.random() * 3) + 1; // 1-3 planets
        for (let i = 0; i < planetCount; i++) {
            system.planets.push({
                name: `Planet ${i + 1}`,
                resources: Math.floor(Math.random() * 4) + 1,
                influence: Math.floor(Math.random() * 4) + 1,
                planetType: Math.random() > 0.7 ? (Math.random() > 0.5 ? 'INDUSTRIAL' : 'CULTURAL') : 'HAZARDOUS'
            });
        }
    }

    console.log('AutoMapper: Created mock system:', system);
    return system;
}

/**
 * Apply special features like wormholes, anomalies, etc.
 */
async function applySpecialFeature(feature) {
    const editor = window.editor;

    try {
        if (feature.type === 'wormhole' && feature.hexId && feature.wormholeType) {
            editor.saveState(feature.hexId);
            editor.toggleWormhole(feature.hexId, feature.wormholeType);
        } else if (feature.type === 'anomaly' && feature.hexId && feature.anomalyType) {
            editor.saveState(feature.hexId);
            editor.applyEffect(feature.hexId, feature.anomalyType);
        }
    } catch (error) {
        console.warn('AutoMapper: Failed to apply special feature:', feature, error);
    }
}

/**
 * Update all overlays and visibility after applying the map
 */
async function updateAllOverlays() {
    const editor = window.editor;

    try {
        // Import required functions
        const { redrawAllRealIDOverlays } = await import('../../features/realIDsOverlays.js');
        const { updateEffectsVisibility, updateWormholeVisibility } = await import('../../features/baseOverlays.js');
        const { updateTileImageLayer } = await import('../../features/imageSystemsOverlay.js');
        const { enforceSvgLayerOrder } = await import('../../draw/enforceSvgLayerOrder.js');

        // Update all overlay systems
        redrawAllRealIDOverlays(editor);
        updateEffectsVisibility(editor);
        updateWormholeVisibility(editor);
        updateTileImageLayer(editor);
        enforceSvgLayerOrder(editor.svg);

        console.log('AutoMapper: All overlays updated');
    } catch (error) {
        console.warn('AutoMapper: Failed to update some overlays:', error);
    }
}

/**
 * Export the generated map data
 */
function exportMapData() {
    if (!lastGeneratedMapData) {
        alert('No generated map to export. Please generate a map first.');
        return;
    }

    try {
        const jsonData = JSON.stringify(lastGeneratedMapData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `automapper_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (typeof window.showToast === 'function') {
            window.showToast('Map data exported successfully!', 'success');
        } else {
            alert('Map data exported successfully!');
        }
    } catch (error) {
        console.error('AutoMapper: Export failed:', error);
        alert(`Export failed: ${error.message || 'Unknown error'}`);
    }
}

// Make functions available globally for button clicks
if (typeof window !== 'undefined') {
    window.handleGenerateMap = handleGenerateMap;
    window.handleAnalyzeMap = handleAnalyzeMap;
    window.applyGeneratedMap = applyGeneratedMap;
    window.exportMapData = exportMapData;
    window.debugHexes = function () {
        console.log('Available hex IDs:', Object.keys(window.editor.hexes).sort());
        console.log('Editor current rings:', window.editor.currentRings);
        console.log('Last generated map data:', lastGeneratedMapData);

        // Test hex ID format by checking the first few hexes
        const hexIds = Object.keys(window.editor.hexes).sort();
        console.log('Sample hex IDs:', hexIds.slice(0, 10));

        // Test if specific hex IDs exist
        const testHexes = ['000', '101', '102', '103', '104', '105', '106', '201', '202'];
        testHexes.forEach(hexId => {
            const exists = window.editor.hexes[hexId] ? 'EXISTS' : 'MISSING';
            console.log(`Hex ${hexId}: ${exists}`);
        });

        // Check available systems
        if (window.editor.sectorIDLookup) {
            const systemIds = Object.keys(window.editor.sectorIDLookup);
            console.log('Total systems available:', systemIds.length);
            console.log('Sample system IDs:', systemIds.slice(0, 10));

            // Look for Mecatol Rex
            const mecatolKey = systemIds.find(key =>
                key.toLowerCase().includes('mecatol') ||
                window.editor.sectorIDLookup[key]?.name?.toLowerCase().includes('mecatol')
            );
            if (mecatolKey) {
                console.log('Found Mecatol Rex:', mecatolKey, window.editor.sectorIDLookup[mecatolKey]);
            }
        }
    };
    window.testApply = function () {
        console.log('Testing apply with minimal data...');
        // Create minimal test data with only center hex
        const testData = {
            systems: [{
                hexId: '000',
                id: 'test_system',
                name: 'Test System',
                resources: 2,
                influence: 1,
                planets: []
            }],
            homePositions: [],
            centerSystem: {
                hexId: '000',
                id: 'mecatol_rex',
                name: 'Mecatol Rex'
            }
        };
        lastGeneratedMapData = testData;
        applyGeneratedMap();
    };
    window.testRealSystem = async function () {
        // Test applying a real system directly
        console.log('Testing real system assignment...');
        if (window.editor.sectorIDLookup) {
            const systemIds = Object.keys(window.editor.sectorIDLookup);
            const testSystemId = systemIds[0]; // Get first available system
            const testSystem = window.editor.sectorIDLookup[testSystemId];
            console.log('Testing with real system:', testSystemId, testSystem);

            try {
                const { assignSystem } = await import('../../features/assignSystem.js');
                window.editor.saveState('101');
                await assignSystem(window.editor, testSystem, '101');
                console.log('Real system assignment successful!');
            } catch (error) {
                console.error('Real system assignment failed:', error);
            }
        }
    };
}