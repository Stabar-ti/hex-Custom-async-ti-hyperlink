// src/modules/Milty/miltyRandomToolUI.js
// User interface functions for Milty Random Tool
// Extracted from miltyBuilderRandomTool.js for better separation of concerns

import { showPopup } from '../../ui/popupUI.js';

// Shared module instance to maintain state
let sharedModuleInstance = null;

// Function to get or import the shared module instance
async function getSharedModule(forceReload = false) {
    console.log('🔄 getSharedModule called with forceReload:', forceReload);
    console.log('🔄 Current sharedModuleInstance exists:', !!sharedModuleInstance);

    if (!sharedModuleInstance || forceReload) {
        const cacheBuster = forceReload ? '?v=' + Date.now() : '';
        console.log('🔄 Loading module with cacheBuster:', cacheBuster);
        sharedModuleInstance = await import('./miltyBuilderRandomTool.js' + cacheBuster);
        console.log('📦 Loaded shared module instance (forceReload:', forceReload, ')');
    } else {
        console.log('📦 Reusing existing shared module instance');
    }
    return sharedModuleInstance;
}

/**
 * Show the main Milty Draft Generator popup
 */
/**
 * Generate slices with UI handling
 */
async function generateSlicesWithUI() {
    try {
        hideSliceScores();
        showGenerationProgress('Initializing generation...', 0);

        console.log('Starting Milty slice generation...');

        // Import and call the core generation function with force reload
        console.log('Attempting to import core module...');
        const module = await getSharedModule(true); // Force reload for generation

        // Update settings from UI first using the same module instance
        console.log('🔧 Updating settings from UI...');
        await updateSettingsFromUI(module);
        console.log('🔧 Settings update complete');

        // Update progress for loading systems
        showGenerationProgress('Loading available systems...', 10);
        console.log('Module imported:', module);
        console.log('Available exports:', Object.keys(module));
        console.log('generateMiltySlices type:', typeof module.generateMiltySlices);

        if (typeof module.generateMiltySlices !== 'function') {
            throw new Error(`generateMiltySlices is not a function. Available exports: ${Object.keys(module).join(', ')}`);
        }

        showGenerationProgress('Generating slices...', 20);

        // Call the core function and get the slices
        const slices = await module.generateMiltySlices();

        showGenerationProgress('Generation complete!', 100);
        console.log('Slice generation complete!', slices.length, 'slices generated');

        // Show slice scores
        showSliceScores(slices);

        // Hide progress after a moment
        setTimeout(() => {
            hideGenerationProgress();
        }, 2000);

    } catch (error) {
        console.error('Slice generation error:', error);
        showGenerationProgress(`Error: ${error.message}`, 0);
        setTimeout(() => {
            hideGenerationProgress();
        }, 5000);
        alert(`Generation failed: ${error.message}`);
    }
}

/**
 * Show the main Milty Draft Generator popup
 */
export function showMiltyDraftGeneratorPopup() {
    showPopup({
        content: createGeneratorPopupContent(),
        actions: [
            { label: 'Generate Slices', action: generateSlicesWithUI },
            { label: 'Weighting Settings', action: () => showWeightingSettingsPopup() },
            { label: 'Debug Info', action: () => showDebugInfo() }
        ],
        title: 'Milty Draft Generator',
        id: 'milty-generator-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: true,
        onHelp: () => showMiltyGeneratorHelp(),
        style: {
            width: '600px',
            maxWidth: '95vw',
            maxHeight: '85vh'
        }
    });

    // Initialize the popup after DOM is ready
    const cacheBuster = '?v=' + Date.now();
    import('./miltyBuilderRandomTool.js' + cacheBuster).then(module => {
        setTimeout(() => {
            module.initializeGeneratorPopup();
        }, 0);
    });
}

/**
 * Create the main generator popup content
 */
export function createGeneratorPopupContent() {
    return `
        <div style="padding: 15px;">
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Number of Slices:</label>
                <input type="number" id="sliceCount" min="3" max="12" value="6" style="width: 100px; padding: 4px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
            </div>

            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; color: #4CAF50;">Wormholes</h4>
                <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                    <input type="checkbox" id="includeAlphaBeta" style="margin-right: 8px;"> Include at least 2 of any 2 wormhole types
                </label>
                <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                    <input type="checkbox" id="maxOneWormhole" style="margin-right: 8px;"> Maximum 1 wormhole per slice
                </label>
                <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                    <input type="checkbox" id="forceGamma" style="margin-right: 8px;"> Force one Gamma wormhole in slices
                </label>
                <div style="margin-top: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <span style="min-width: 160px;">Abundance Weight:</span>
                        <input type="number" id="wormholeAbundanceWeight" min="0.1" max="3.0" step="0.1" value="1.0" 
                               style="width: 80px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                        <span style="font-size: 12px; color: #aaa; margin-left: 8px;">
                            (1.0 = equal chance, >1.0 = favor common types, <1.0 = favor rare types)
                        </span>
                    </label>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; color: #2196F3;">Legendary Planets</h4>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <label style="display: flex; align-items: center; gap: 5px;">
                        Minimum: <input type="number" id="minLegendaries" min="0" max="6" value="0" style="width: 60px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px;">
                        Maximum: <input type="number" id="maxLegendaries" min="0" max="6" value="6" style="width: 60px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                    </label>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; color: #FF9800;">Sources</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <label style="display: block; cursor: pointer;">
                        <input type="checkbox" id="sourceBase" style="margin-right: 8px;" checked> Base Game
                    </label>
                    <label style="display: block; cursor: pointer;">
                        <input type="checkbox" id="sourcePokCodex" style="margin-right: 8px;" checked> PoK + Codex
                    </label>
                    <label style="display: block; cursor: pointer;">
                        <input type="checkbox" id="sourceDSUncharted" style="margin-right: 8px;"> Discordant Stars / Uncharted Space
                    </label>
                    <label style="display: block; cursor: pointer;">
                        <input type="checkbox" id="sourceEronous" style="margin-right: 8px;"> Eronous / Lost Star Charts
                    </label>
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <button id="toggleAdvanced" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Show Advanced Settings</button>
            </div>

            <div id="advancedSettings" style="display: none; border-top: 1px solid #555; padding-top: 15px;">
                <h4 style="margin: 0 0 15px 0; color: #9C27B0;">Advanced Settings</h4>
                
                <div style="margin-bottom: 20px;">
                    <h5 style="margin: 0 0 10px 0; color: #E91E63;">Optimal Values (Milty calculation)</h5>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            Min Resources: <input type="number" id="minOptimalResources" min="0" max="10" step="0.5" value="2.5" style="width: 60px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            Min Influence: <input type="number" id="minOptimalInfluence" min="0" max="10" step="0.5" value="4" style="width: 60px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            Min Total: <input type="number" id="minOptimalTotal" min="0" max="20" step="0.5" value="9" style="width: 60px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            Max Total: <input type="number" id="maxOptimalTotal" min="0" max="20" step="0.5" value="13" style="width: 60px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                        </label>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <h5 style="margin: 0 0 10px 0; color: #673AB7;">Planet System Count</h5>
                    <div style="display: flex; gap: 15px; align-items: center;">
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            Min: <input type="number" id="minPlanetSystems" min="0" max="5" value="3" style="width: 50px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            Max: <input type="number" id="maxPlanetSystems" min="0" max="5" value="4" style="width: 50px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
                        </label>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <h5 style="margin: 0 0 10px 0; color: #3F51B5;">Score Balancing</h5>
                    <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                        <input type="checkbox" id="enableScoreBalancing" style="margin-right: 8px;" checked> Enable score balancing
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
                        Target ratio: <input type="number" id="targetRatioPercent" min="50" max="100" value="75" style="width: 60px; padding: 2px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">%
                        <span style="color: #888; font-size: 11px;">(weakest/strongest)</span>
                    </label>
                </div>

                <div style="margin-bottom: 10px;">
                    <label style="display: block; cursor: pointer;">
                        <input type="checkbox" id="enableDebugMode" style="margin-right: 8px;"> Debug mode (verbose console output)
                    </label>
                </div>
            </div>

            <!-- Generation Status -->
            <div id="generationStatus" style="display: none; margin-top: 20px; padding: 10px; background: #1a1a1a; border-radius: 4px;">
                <div id="statusText" style="margin-bottom: 8px; color: #ccc;"></div>
                <div style="background: #333; height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="progressBar" style="background: #4CAF50; height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>

            <!-- Slice Scores Display -->
            <div id="sliceScores" style="display: none; margin-top: 20px; padding: 10px; background: #1a1a1a; border-radius: 4px;">
                <h4 style="margin: 0 0 10px 0; color: #4CAF50;">Generated Slice Scores</h4>
                <div id="scoresContent" style="max-height: 200px; overflow-y: auto; font-size: 13px;"></div>
            </div>
        </div>
    `;
}

/**
 * Show the weighting settings popup
 */
export function showWeightingSettingsPopup() {
    const cacheBuster = '?v=' + Date.now();
    import('./miltyBuilderRandomTool.js' + cacheBuster).then(module => {
        const { saveWeightingSettings, resetWeightingSettings } = module;

        showPopup({
            content: createWeightingPopupContent(),
            actions: [
                { label: 'Save Settings', action: saveWeightingSettings },
                { label: 'Reset to Defaults', action: resetWeightingSettings }
            ],
            title: 'Weighting Settings',
            id: 'milty-weighting-popup',
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            showHelp: true,
            onHelp: () => showWeightingHelp(),
            style: {
                width: '600px',
                maxWidth: '95vw',
                maxHeight: '85vh'
            }
        });
    });
}

/**
 * Create the weighting settings popup content
 */
export function createWeightingPopupContent() {
    // Get current weights from the main module
    let currentWeights = {};

    // Fallback default weights if module not loaded yet
    const DEFAULT_WEIGHTS = {
        resourceValue: 1.0,
        influenceValue: 1.0,
        resourceInfluenceImbalance: -0.5,
        legendaryPlanet: 5.0,
        techSpecialty: 2.0,
        wormhole: 1.0,
        industrial: 0.5,
        cultural: 0.5,
        hazardous: 0.5,
        supernova: -5.0,
        asteroidField: -1.0,
        nebula: 0.0,
        gravityRift: 0.5,
        lowPlanetCount: -3.0,
        highPlanetCount: -2.0
    };

    // Try to get current weights from the main module
    try {
        const cacheBuster = '?v=' + Date.now();
        import('./miltyBuilderRandomTool.js' + cacheBuster).then(module => {
            currentWeights = module.getCurrentWeights?.() || DEFAULT_WEIGHTS;
            // Update the UI with current weights
            Object.keys(currentWeights).forEach(key => {
                const input = document.getElementById(`weight_${key}`);
                if (input) {
                    input.value = currentWeights[key];
                }
            });
        });
    } catch (e) {
        currentWeights = DEFAULT_WEIGHTS;
    }

    const weightCategories = {
        'Basic Values': {
            resourceValue: 'Resource Value',
            influenceValue: 'Influence Value',
            resourceInfluenceImbalance: 'Resource/Influence Imbalance (penalty)'
        },
        'Special Features': {
            legendaryPlanet: 'Legendary Planet',
            techSpecialty: 'Tech Specialty',
            wormhole: 'Wormhole'
        },
        'Planet Types': {
            industrial: 'Industrial Planet',
            cultural: 'Cultural Planet',
            hazardous: 'Hazardous Planet'
        },
        'Anomalies': {
            supernova: 'Supernova',
            asteroidField: 'Asteroid Field',
            nebula: 'Nebula',
            gravityRift: 'Gravity Rift'
        },
        'Planet Count': {
            lowPlanetCount: 'Low Planet Count (< 3, penalty)',
            highPlanetCount: 'High Planet Count (> 5, penalty)'
        }
    };

    let content = '<div style="padding: 15px; max-height: 60vh; overflow-y: auto;">';
    content += '<p style="color: #ccc; margin-bottom: 20px; font-size: 14px;">Adjust the weighting values to customize slice evaluation. Positive values are bonuses, negative values are penalties.</p>';

    Object.entries(weightCategories).forEach(([category, weights]) => {
        content += `<div style="margin-bottom: 20px;">`;
        content += `<h4 style="color: #4CAF50; margin: 0 0 10px 0;">${category}</h4>`;
        content += `<div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px; align-items: center;">`;

        Object.entries(weights).forEach(([key, label]) => {
            const value = currentWeights[key] || DEFAULT_WEIGHTS[key] || 0;
            content += `
                <label style="color: #ccc;">${label}:</label>
                <input type="number" id="weight_${key}" value="${value}" step="0.1" 
                       style="padding: 4px; border: 1px solid #555; background: #2a2a2a; color: #fff; border-radius: 3px;">
            `;
        });

        content += `</div></div>`;
    });

    content += '</div>';
    return content;
}

/**
 * Show slice scores
 */
export function showSliceScores(slices) {
    // Use the same shared module instance
    getSharedModule().then(module => {
        console.log('📊 Importing calculateSliceScore function...');
        console.log('Available exports in scores function:', Object.keys(module));
        console.log('calculateSliceScore type:', typeof module.calculateSliceScore);

        const scoresDiv = document.getElementById('sliceScores');
        const contentDiv = document.getElementById('scoresContent');

        if (!scoresDiv || !contentDiv) return;

        // Calculate scores and sort slices by score (best to worst)
        const scoredSlices = slices.map((slice, index) => ({
            index,
            slice,
            score: module.calculateSliceScore(slice)
        })).sort((a, b) => b.score - a.score);

        // Create content
        let content = '';
        content += '<div style="color: #ccc; margin-bottom: 10px; font-size: 12px;">Higher scores indicate better slice quality based on current weighting settings.</div>';

        scoredSlices.forEach(({ index, slice, score }, rank) => {
            const planetSystems = slice.systems.filter(s => s.planets && s.planets.length > 0);
            const emptySystems = slice.systems.filter(s => !s.planets || s.planets.length === 0);

            // Color coding based on rank
            let color = '#4CAF50'; // Green for top slices
            if (rank >= slices.length * 0.67) color = '#f44336'; // Red for bottom third
            else if (rank >= slices.length * 0.33) color = '#FF9800'; // Orange for middle third

            content += `<div style="color: ${color}; margin-bottom: 8px;">`;
            content += `<strong>Slice ${index}</strong>: `;
            content += `Score <strong>${score.toFixed(1)}</strong> `;
            content += `(${slice.systems.length} systems: ${planetSystems.length} planet + ${emptySystems.length} empty/anomaly)`;
            content += `<br><span style="color: #aaa; font-size: 11px; margin-left: 10px;">`;
            content += `${slice.totalResources}R/${slice.totalInfluence}I, `;
            content += `${slice.optimalResources.toFixed(1)}/${slice.optimalInfluence.toFixed(1)} optimal`;
            if (slice.legendaries > 0) content += `, ${slice.legendaries} legendary`;
            if (slice.wormholes.length > 0) content += `, ${slice.wormholes.length} wormhole`;
            if (slice.anomalies.length > 0) content += `, ${slice.anomalies.length} anomaly`;
            content += `</span></div>`;
        });

        contentDiv.innerHTML = content;
        scoresDiv.style.display = 'block';
    });
}

/**
 * Hide slice scores
 */
export function hideSliceScores() {
    const scoresDiv = document.getElementById('sliceScores');
    if (scoresDiv) scoresDiv.style.display = 'none';
}

/**
 * Show generation progress
 */
export function showGenerationProgress(message, progress) {
    const statusDiv = document.getElementById('generationStatus');
    const statusText = document.getElementById('statusText');
    const progressBar = document.getElementById('progressBar');

    if (statusDiv) statusDiv.style.display = 'block';
    if (statusText) statusText.textContent = message;
    if (progressBar) progressBar.style.width = `${progress}%`;
}

/**
 * Hide generation progress
 */
export function hideGenerationProgress() {
    const statusDiv = document.getElementById('generationStatus');
    if (statusDiv) statusDiv.style.display = 'none';
}

/**
 * Show generator help
 */
export function showMiltyGeneratorHelp() {
    const helpContent = `
        <div style="max-height: 60vh; overflow-y: auto; padding: 15px; line-height: 1.6;">
            <h3 style="color: #ffe066; margin-top: 0;">Milty Draft Generator Help</h3>
            
            <h4 style="color: #4CAF50;">Overview</h4>
            <p>This tool generates balanced slice sets for Milty Draft format tournaments. It uses configurable constraints and weighting to create fair, competitive slices.</p>
            
            <h4 style="color: #4CAF50;">Settings</h4>
            <ul>
                <li><strong>Slice Count:</strong> Number of slices to generate (3-12)</li>
                <li><strong>Wormholes:</strong> Control wormhole distribution across slices</li>
                <li><strong>Legendaries:</strong> Minimum legendary planets in the entire set</li>
                <li><strong>Sources:</strong> Which tile sets to include</li>
            </ul>
            
            <h4 style="color: #4CAF50;">Advanced Settings</h4>
            <p><strong>Optimal Values:</strong> Based on Milty's calculation where the higher of resource/influence is used, with equal values split in half.</p>
            <p><strong>Score Balancing:</strong> When enabled, the generator attempts to balance slice scores by swapping systems between slices to ensure the weakest slice has at least 75% of the strongest slice's score.</p>
            
            <h4 style="color: #4CAF50;">Weighting System</h4>
            <p>The weighting system evaluates slice quality by assigning point values to different features. Higher weights are better, negative weights are penalties.</p>
        </div>
    `;

    showPopup({
        content: helpContent,
        actions: [],
        title: 'Generator Help',
        id: 'milty-generator-help',
        style: { width: '500px', maxWidth: '95vw' }
    });
}

/**
 * Show weighting help
 */
export function showWeightingHelp() {
    const helpContent = `
        <div style="max-height: 60vh; overflow-y: auto; padding: 15px; line-height: 1.6;">
            <h3 style="color: #ffe066; margin-top: 0;">Weighting System Help</h3>
            
            <p>The weighting system assigns numerical values to different slice features to evaluate overall slice quality.</p>
            
            <h4 style="color: #4CAF50;">How It Works</h4>
            <ul>
                <li><strong>Positive weights:</strong> Add to slice score (better)</li>
                <li><strong>Negative weights:</strong> Subtract from slice score (penalties)</li>
                <li><strong>Zero weights:</strong> No effect on score</li>
            </ul>
            
            <h4 style="color: #4CAF50;">Recommended Values</h4>
            <ul>
                <li><strong>Supernovas:</strong> -5 (major penalty)</li>
                <li><strong>Asteroids:</strong> -1 (minor penalty)</li>
                <li><strong>Nebulas:</strong> 0 (neutral)</li>
                <li><strong>Tech Specialties:</strong> +2 (valuable)</li>
                <li><strong>Legendaries:</strong> +5 (very valuable)</li>
            </ul>
            
            <p>Adjust weights based on your tournament's meta and player preferences.</p>
        </div>
    `;

    showPopup({
        content: helpContent,
        actions: [],
        title: 'Weighting Help',
        id: 'milty-weighting-help',
        style: { width: '500px', maxWidth: '95vw' }
    });
}

/**
 * Show debug information popup
 */
export function showDebugInfo() {
    // Check current checkbox state in real time
    const debugCheckbox = document.getElementById('enableDebugMode');
    const balancingCheckbox = document.getElementById('enableScoreBalancing');

    console.log('🔍 Real-time checkbox states:');
    console.log('  Debug checkbox element:', debugCheckbox);
    console.log('  Debug checkbox checked:', debugCheckbox?.checked);
    console.log('  Balancing checkbox element:', balancingCheckbox);
    console.log('  Balancing checkbox checked:', balancingCheckbox?.checked);

    // Use the same shared module instance to get debug data
    getSharedModule().then(module => {
        console.log('🐛 Loading debug information...');
        console.log('getDebugDetails type:', typeof module.getDebugDetails);
        const debugDetails = module.getDebugDetails?.() || { swapAttempts: 0 };
        console.log('Debug details:', debugDetails);

        let content = `
            <div style="padding: 20px; line-height: 1.5; max-height: 60vh; overflow-y: auto; font-family: monospace;">
                <h3 style="color: #ffe066; margin-top: 0;">Debug Information</h3>
        `;

        if (debugDetails.swapAttempts === 0) {
            // Sync current checkbox states to get real-time status
            const currentDebugMode = debugCheckbox?.checked || false;
            const currentBalancingMode = balancingCheckbox?.checked || false;

            // Try to get settings from module, but use real-time checkbox states as fallback
            const currentSettings = module.getCurrentSettings?.() || {};
            const debugModeInSettings = currentSettings.debugMode;
            const balancingInSettings = currentSettings.scoreBalancing?.enabled;

            content += `
                <p style="color: #aaa;">No balancing data available yet.</p>
                <div style="margin-top: 15px; padding: 10px; background: #2a2a2a; border-radius: 4px; color: #ccc;">
                    <h4 style="color: #FF9800; margin: 0 0 10px 0;">Current Status</h4>
                    <strong>Checkbox States (Real-time):</strong><br>
                    Debug mode checkbox: <strong style="color: ${currentDebugMode ? '#4CAF50' : '#f44336'}">${currentDebugMode ? 'CHECKED' : 'UNCHECKED'}</strong><br>
                    Score balancing checkbox: <strong style="color: ${currentBalancingMode ? '#4CAF50' : '#f44336'}">${currentBalancingMode ? 'CHECKED' : 'UNCHECKED'}</strong><br>
                    <br>
                    <strong>Module Settings (Last Applied):</strong><br>
                    Debug mode in settings: <strong style="color: ${debugModeInSettings ? '#4CAF50' : '#f44336'}">${debugModeInSettings ? 'ENABLED' : 'DISABLED'}</strong><br>
                    Score balancing enabled: <strong style="color: ${balancingInSettings ? '#4CAF50' : '#f44336'}">${balancingInSettings ? 'ENABLED' : 'DISABLED'}</strong><br>
                    <br>
                    <em style="color: #999;">Settings are applied to the module when you click "Generate Slices".<br>
                    If checkboxes are checked but settings show disabled, generate slices to sync them.</em>
                </div>
            `;
        } else {
            content += `
                <div style="margin-bottom: 20px; padding: 10px; background: #3a3a3a; border-radius: 4px;">
                    <h4 style="color: #4CAF50; margin: 0 0 10px 0;">Balancing Statistics</h4>
                    <div style="color: #ccc;">
                        Total swap attempts: <strong>${debugDetails.swapAttempts}</strong><br>
                        Successful swaps: <strong>${debugDetails.successfulSwaps}</strong><br>
                        Constraint failures: <strong>${debugDetails.constraintFailures}</strong><br>
                        Success rate: <strong>${debugDetails.swapAttempts > 0 ? ((debugDetails.successfulSwaps / debugDetails.swapAttempts) * 100).toFixed(1) : 0}%</strong>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px; padding: 10px; background: #3a3a3a; border-radius: 4px;">
                    <h4 style="color: #2196F3; margin: 0 0 10px 0;">Swap Types</h4>
                    <div style="color: #ccc;">
                        Direct swaps: <strong>${debugDetails.swapTypes.direct}</strong><br>
                        Broader swaps: <strong>${debugDetails.swapTypes.broader}</strong><br>
                        Unused tile swaps: <strong>${debugDetails.swapTypes.unused}</strong><br>
                        Random swaps: <strong>${debugDetails.swapTypes.random}</strong>
                    </div>
                </div>
            `;

            if (debugDetails.scoreImprovements && debugDetails.scoreImprovements.length > 0) {
                const totalImprovement = debugDetails.scoreImprovements.reduce((sum, imp) => sum + imp.improvement, 0);
                content += `
                    <div style="margin-bottom: 20px; padding: 10px; background: #3a3a3a; border-radius: 4px;">
                        <h4 style="color: #FF9800; margin: 0 0 10px 0;">Score Improvements</h4>
                        <div style="color: #ccc;">
                            Total improvement: <strong>${totalImprovement.toFixed(1)}</strong><br>
                            Average per swap: <strong>${(totalImprovement / debugDetails.scoreImprovements.length).toFixed(1)}</strong><br>
                            Number of improvements: <strong>${debugDetails.scoreImprovements.length}</strong>
                        </div>
                    </div>
                `;
            }
        }

        content += `
                <div style="margin-top: 20px; padding: 10px; background: #444; border-radius: 4px;">
                    <h4 style="color: #9C27B0; margin: 0 0 10px 0;">Debug Tips</h4>
                    <ul style="color: #ccc; margin: 0; padding-left: 20px;">
                        <li>Enable "Debug Mode" in Advanced Settings for verbose console output</li>
                        <li>Check browser console (F12) for detailed balancing logs</li>
                        <li>High constraint failures suggest tight generation settings</li>
                        <li>Low success rates may indicate limited improvement opportunities</li>
                        <li>Unused tile swaps help when regular swaps aren't enough</li>
                    </ul>
                </div>
            </div>
        `;

        showPopup({
            content: content,
            actions: [],
            title: 'Debug Information',
            id: 'milty-debug-info',
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            scalable: true,
            rememberPosition: true,
            showHelp: true,
            onHelp: () => {
                showPopup({
                    content: `
                        <div style="padding: 20px; line-height: 1.5; max-width: 500px;">
                            <h3 style="color: #ffe066; margin-top: 0;">Debug Info Help</h3>
                            <p style="color: #ccc;">This popup displays detailed statistics about the slice balancing process, including swap attempts, success rates, constraint failures, and improvement tracking. Use this information to diagnose balancing issues and tune your settings for better results.</p>
                            <ul style="color: #aaa; font-size: 13px;">
                                <li><b>Swap Attempts:</b> Number of swap tests performed during balancing.</li>
                                <li><b>Successful Swaps:</b> Swaps that improved balance and were applied.</li>
                                <li><b>Constraint Failures:</b> Swaps that were rejected due to slice constraints.</li>
                                <li><b>Swap Types:</b> Direct, broader, unused tile, and random swaps.</li>
                                <li><b>Score Improvements:</b> Total and average improvement from swaps.</li>
                            </ul>
                        </div>
                    `,
                    actions: [],
                    title: 'Debug Info Help',
                    id: 'milty-debug-info-help',
                    draggable: true,
                    dragHandleSelector: '.popup-ui-titlebar',
                    scalable: true,
                    rememberPosition: true,
                    style: {
                        width: '500px',
                        maxWidth: '95vw',
                        maxHeight: '85vh'
                    }
                });
            },
            style: {
                width: '500px',
                maxWidth: '95vw',
                maxHeight: '85vh'
            }
        });
    });
}

/**
 * Update settings from UI inputs and apply them to the core module
 */
export async function updateSettingsFromUI(moduleInstance = null) {
    const settings = {
        sliceCount: parseInt(document.getElementById('sliceCount')?.value) || 6,
        wormholes: {
            includeAlphaBeta: document.getElementById('includeAlphaBeta')?.checked || false,
            maxPerSlice: document.getElementById('maxOneWormhole')?.checked ? 1 : 2,
            abundanceWeight: parseFloat(document.getElementById('wormholeAbundanceWeight')?.value) || 1.0,
            forceGamma: document.getElementById('forceGamma')?.checked || false
        },
        legendaries: {
            minimum: parseInt(document.getElementById('minLegendaries')?.value) || 0,
            maximum: parseInt(document.getElementById('maxLegendaries')?.value) || 6
        },
        sources: {
            base: document.getElementById('sourceBase')?.checked || false,
            pokCodex: document.getElementById('sourcePokCodex')?.checked || false,
            dsUncharted: document.getElementById('sourceDSUncharted')?.checked || false,
            eronous: document.getElementById('sourceEronous')?.checked || false
        },
        sliceGeneration: {
            minOptimalInfluence: parseFloat(document.getElementById('minOptimalInfluence')?.value) || 4,
            minOptimalResources: parseFloat(document.getElementById('minOptimalResources')?.value) || 2.5,
            minOptimalTotal: parseFloat(document.getElementById('minOptimalTotal')?.value) || 9,
            maxOptimalTotal: parseFloat(document.getElementById('maxOptimalTotal')?.value) || 13,
            minPlanetSystems: parseInt(document.getElementById('minPlanetSystems')?.value) || 3,
            maxPlanetSystems: parseInt(document.getElementById('maxPlanetSystems')?.value) || 4
        },
        scoreBalancing: {
            enabled: document.getElementById('enableScoreBalancing')?.checked || false,
            targetRatio: (() => {
                const ratioInput = document.getElementById('targetRatioPercent');
                let ratioValue = parseFloat(ratioInput?.value);
                if (isNaN(ratioValue) || ratioValue < 50 || ratioValue > 100) ratioValue = 75;
                return ratioValue / 100;
            })()
        },
        debugMode: document.getElementById('enableDebugMode')?.checked || false
    };

    console.log('🎛️ UI Debug mode checkbox checked:', document.getElementById('enableDebugMode')?.checked);
    console.log('🎛️ Final debugMode setting:', settings.debugMode);

    // Apply settings to the core module and wait for completion
    console.log('Attempting to apply settings to core module...');
    try {
        // Use provided module instance or get a fresh one
        const module = moduleInstance || await getSharedModule();
        console.log('Settings module available:', module);
        console.log('Available exports for settings:', Object.keys(module));
        console.log('setCurrentSettings type:', typeof module.setCurrentSettings);

        if (typeof module.setCurrentSettings === 'function') {
            module.setCurrentSettings(settings);
            console.log('✅ Settings successfully applied to core module');
        } else {
            console.error('setCurrentSettings is not available. Available exports:', Object.keys(module));
            throw new Error('setCurrentSettings function not available');
        }
    } catch (error) {
        console.error('Failed to apply settings to module:', error);
        throw error;
    }

    console.log('Updated settings:', settings);
    console.log('Debug mode:', settings.debugMode ? 'ENABLED' : 'DISABLED');

    return settings;
}

/**
 * Save weighting settings
 */
export function saveWeightingSettings() {
    const cacheBuster = '?v=' + Date.now();
    import('./miltyBuilderRandomTool.js' + cacheBuster).then(module => {
        const { getCurrentWeights, setCurrentWeights } = module;
        const currentWeights = getCurrentWeights();

        // Update weights from UI
        Object.keys(currentWeights).forEach(key => {
            const input = document.getElementById(`weight_${key}`);
            if (input) {
                currentWeights[key] = parseFloat(input.value) || 0;
            }
        });

        setCurrentWeights(currentWeights);

        // Close popup
        const popup = document.getElementById('milty-weighting-popup');
        if (popup) {
            popup.remove();
        }

        alert('Weighting settings saved!');
    });
}

/**
 * Reset weighting settings to defaults
 */
export function resetWeightingSettings() {
    const cacheBuster = '?v=' + Date.now();
    import('./miltyBuilderRandomTool.js' + cacheBuster).then(module => {
        const { resetWeightsToDefault, getCurrentWeights } = module;
        resetWeightsToDefault();
        const currentWeights = getCurrentWeights();

        // Update UI
        Object.keys(currentWeights).forEach(key => {
            const input = document.getElementById(`weight_${key}`);
            if (input) {
                input.value = currentWeights[key];
            }
        });
    });
}

/**
 * Initialize event handlers for the generator popup
 */
export function initializeGeneratorPopup() {
    // Advanced settings toggle
    const toggleBtn = document.getElementById('toggleAdvanced');
    const advancedDiv = document.getElementById('advancedSettings');

    if (toggleBtn && advancedDiv) {
        toggleBtn.addEventListener('click', function () {
            const isHidden = advancedDiv.style.display === 'none';
            advancedDiv.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? 'Hide Advanced Settings' : 'Show Advanced Settings';
        });
    }
}
