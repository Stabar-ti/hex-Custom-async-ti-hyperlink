// src/modules/Milty/miltyBuilderRandomTool.js
// Milty Draft Slice Generation Tool with advanced settings and weighting

import { showPopup } from '../../ui/popupUI.js';
import { assignSystem } from '../../features/assignSystem.js';
import { markRealIDUsed, unmarkRealIDUsed } from '../../ui/uiFilters.js';
import { slotPositions } from './miltyBuilderCore.js';

// Default generation settings
const DEFAULT_SETTINGS = {
    sliceCount: 6,
    wormholes: {
        includeAlphaBeta: true,
        maxPerSlice: 1
    },
    legendaries: {
        minimum: 0
    },
    draftOrder: {
        useSpecifiedOrder: false
    },
    sliceGeneration: {
        minOptimalInfluence: 4,
        minOptimalResources: 2.5,
        minOptimalTotal: 9,
        maxOptimalTotal: 13,
        minPlanetSystems: 3,
        maxPlanetSystems: 4
    },
    scoreBalancing: {
        enabled: false,
        targetRatio: 0.75
    },
    sources: {
        baseGame: true,
        prophecyOfKings: true,
        codex: false,
        uncharted: false
    }
};

// Default feature weights for slice evaluation
const DEFAULT_WEIGHTS = {
    // Anomalies
    supernova: -5,
    asteroidField: -1,
    nebula: 0,
    gravityRift: -2,
    
    // Resources/Influence
    resourceValue: 1,
    influenceValue: 1,
    
    // Special features
    techSpecialty: 2,
    legendaryPlanet: 5,
    wormhole: 1,
    
    // Planet types
    industrial: 0.5,
    cultural: 0.5,
    hazardous: 0.5,
    
    // Balance penalties
    resourceInfluenceImbalance: -0.5,
    lowPlanetCount: -3,
    highPlanetCount: -1
};

let currentSettings = { ...DEFAULT_SETTINGS };
let currentWeights = { ...DEFAULT_WEIGHTS };

/**
 * Shows the main Milty Draft Generation popup
 */
export function showMiltyDraftGeneratorPopup() {
    const content = createGeneratorPopupContent();
    
    showPopup({
        content: content,
        actions: [
            {
                label: 'Generate Slices',
                action: () => generateMiltySlices()
            },
            {
                label: 'Weighting Settings',
                action: () => showWeightingSettingsPopup()
            }
        ],
        title: 'Milty Draft Slice Generator',
        id: 'milty-draft-generator-popup',
        draggable: true,
        dragHandleSelector: '.popup-ui-titlebar',
        scalable: true,
        rememberPosition: true,
        showHelp: true,
        onHelp: () => showMiltyGeneratorHelp(),
        style: {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '85vh'
        }
    });
}

/**
 * Creates the main generator popup content
 */
function createGeneratorPopupContent() {
    return `
        <div style="padding: 20px; line-height: 1.5;">
            <h3 style="color: #ffe066; margin-top: 0;">Slice Generation</h3>
            
            <!-- Basic Settings -->
            <div style="margin-bottom: 25px;">
                <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #4CAF50;">
                    Number of Slices to Generate:
                </label>
                <input type="number" id="sliceCount" value="${currentSettings.sliceCount}" 
                       min="3" max="12" step="1"
                       style="width: 80px; padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
            </div>
            
            <!-- Wormhole Settings -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #2196F3; margin: 0 0 12px 0;">Wormholes</h4>
                
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="includeAlphaBeta" ${currentSettings.wormholes.includeAlphaBeta ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Include at least 2 alpha and beta wormholes</span>
                    </label>
                    <p style="margin: 5px 0 0 26px; font-size: 12px; color: #aaa; font-style: italic;">
                        So at least 4 in total, divided over the slices. A slice will never have two of the same wormholes.
                    </p>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="maxOneWormhole" ${currentSettings.wormholes.maxPerSlice === 1 ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Max. 1 wormhole per slice</span>
                    </label>
                </div>
            </div>
            
            <!-- Legendaries Settings -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #FF9800; margin: 0 0 12px 0;">Legendaries</h4>
                
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label style="font-weight: bold;">Minimum amount of legendary planets:</label>
                    <input type="number" id="minLegendaries" value="${currentSettings.legendaries.minimum}" 
                           min="0" max="6" step="1"
                           style="width: 60px; padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                </div>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #aaa; font-style: italic;">
                    PoK includes 2 draftable legendary planets (and 2 more that are spawned by player action).
                    Discordant Stars has 6 more.
                </p>
            </div>
            
            <!-- Source Settings -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #9C27B0; margin: 0 0 12px 0;">Tile Sources</h4>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="sourceBaseGame" ${currentSettings.sources.baseGame ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Base Game</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="sourcePok" ${currentSettings.sources.prophecyOfKings ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Prophecy of Kings</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="sourceCodex" ${currentSettings.sources.codex ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Codex</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="sourceUncharted" ${currentSettings.sources.uncharted ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Uncharted</span>
                    </label>
                </div>
            </div>
            
            <!-- Advanced Settings -->
            <div style="margin-bottom: 20px;">
                <button id="toggleAdvanced" 
                        style="background: #555; color: #fff; border: 1px solid #777; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Advanced Settings
                </button>
            </div>
            
            <div id="advancedSettings" style="display: none; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #607D8B; margin: 0 0 15px 0;">Draft Order</h4>
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="useSpecifiedOrder" ${currentSettings.draftOrder.useSpecifiedOrder ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Use specified player order (don't randomise)</span>
                    </label>
                </div>
                
                <h4 style="color: #607D8B; margin: 15px 0 12px 0;">Slice Generation</h4>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #ccc;">
                    The "Optimal Value" of a planet is calculated by using the higher of its resource value and influence value
                    as that value, and the other value as zero. If both the planet's resource value and influence value are
                    equal, half that value is used for both of its optimal values. For example, Starpoint, a 3/1, is treated as 3/0.
                    Coorneeq, a 1/2, is treated as 0/2, and Rigel III, a 1/1, is treated as 1/2/1/2.
                </p>
                
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px; align-items: center;">
                    <label style="font-weight: bold;">Minimum Planet Systems per Slice</label>
                    <input type="number" id="minPlanetSystems" value="${currentSettings.sliceGeneration.minPlanetSystems}" 
                           min="1" max="5" step="1"
                           style="padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label style="font-weight: bold;">Maximum Planet Systems per Slice</label>
                    <input type="number" id="maxPlanetSystems" value="${currentSettings.sliceGeneration.maxPlanetSystems}" 
                           min="1" max="5" step="1"
                           style="padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label style="font-weight: bold;">Minimum Optimal Influence</label>
                    <input type="number" id="minOptimalInfluence" value="${currentSettings.sliceGeneration.minOptimalInfluence}" 
                           min="0" max="10" step="0.5"
                           style="padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label style="font-weight: bold;">Minimum Optimal Resources</label>
                    <input type="number" id="minOptimalResources" value="${currentSettings.sliceGeneration.minOptimalResources}" 
                           min="0" max="10" step="0.5"
                           style="padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label style="font-weight: bold;">Minimum Optimal Total</label>
                    <input type="number" id="minOptimalTotal" value="${currentSettings.sliceGeneration.minOptimalTotal}" 
                           min="0" max="20" step="0.5"
                           style="padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label style="font-weight: bold;">Maximum Optimal Total</label>
                    <input type="number" id="maxOptimalTotal" value="${currentSettings.sliceGeneration.maxOptimalTotal}" 
                           min="0" max="30" step="0.5"
                           style="padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                </div>
                
                <p style="margin: 15px 0 0 0; font-size: 12px; color: #aaa; font-style: italic;">
                    Planet systems contain planets with resources/influence. Non-planet systems include anomalies, empty space, and wormhole-only systems.
                </p>
                
                <h4 style="color: #607D8B; margin: 15px 0 12px 0;">Score Balancing</h4>
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="enableScoreBalancing" ${currentSettings.scoreBalancing.enabled ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Enable score balancing (weakest slice ≥ 75% of strongest)</span>
                    </label>
                    <p style="margin: 5px 0 0 26px; font-size: 12px; color: #aaa; font-style: italic;">
                        Attempts to balance slice scores by swapping systems between slices to reduce score variance.
                    </p>
                </div>
            </div>
            
            <!-- Generation Status -->
            <div id="generationStatus" style="margin-top: 20px; padding: 10px; background: rgba(76,175,80,0.1); border-radius: 4px; border: 1px solid rgba(76,175,80,0.3); display: none;">
                <div style="color: #4CAF50; font-weight: bold;" id="statusText">Ready to generate slices...</div>
                <div style="margin-top: 5px;">
                    <div style="background: #555; height: 6px; border-radius: 3px; overflow: hidden;">
                        <div id="progressBar" style="background: #4CAF50; height: 100%; width: 0%; transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>
            
            <!-- Slice Scores -->
            <div id="sliceScores" style="margin-top: 20px; padding: 15px; background: rgba(33,150,243,0.1); border-radius: 4px; border: 1px solid rgba(33,150,243,0.3); display: none;">
                <h4 style="color: #2196F3; margin: 0 0 12px 0;">Generated Slice Scores</h4>
                <div id="scoresContent" style="font-family: monospace; font-size: 13px; line-height: 1.4;">
                    <!-- Scores will be populated here -->
                </div>
            </div>
        </div>
    `;
}

/**
 * Shows the weighting settings popup
 */
function showWeightingSettingsPopup() {
    const content = createWeightingPopupContent();
    
    showPopup({
        content: content,
        actions: [
            {
                label: 'Save Weights',
                action: () => saveWeightingSettings()
            },
            {
                label: 'Reset to Defaults',
                action: () => resetWeightingSettings()
            }
        ],
        title: 'Slice Evaluation Weights',
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
}

/**
 * Creates the weighting settings popup content
 */
function createWeightingPopupContent() {
    return `
        <div style="padding: 20px; line-height: 1.5; max-height: 60vh; overflow-y: auto;">
            <p style="color: #ccc; margin-bottom: 20px;">
                Adjust the weights used to evaluate slice quality. Higher values are better, negative values are penalties.
            </p>
            
            <!-- Anomalies -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #f44336; margin: 0 0 15px 0;">Anomalies</h4>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; align-items: center;">
                    <label>Supernova</label>
                    <input type="number" id="weight_supernova" value="${currentWeights.supernova}" step="0.5" 
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Asteroid Field</label>
                    <input type="number" id="weight_asteroidField" value="${currentWeights.asteroidField}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Nebula</label>
                    <input type="number" id="weight_nebula" value="${currentWeights.nebula}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Gravity Rift</label>
                    <input type="number" id="weight_gravityRift" value="${currentWeights.gravityRift}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                </div>
            </div>
            
            <!-- Resources & Influence -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #4CAF50; margin: 0 0 15px 0;">Resources & Influence</h4>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; align-items: center;">
                    <label>Resource Value</label>
                    <input type="number" id="weight_resourceValue" value="${currentWeights.resourceValue}" step="0.1"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Influence Value</label>
                    <input type="number" id="weight_influenceValue" value="${currentWeights.influenceValue}" step="0.1"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Resource/Influence Imbalance Penalty</label>
                    <input type="number" id="weight_resourceInfluenceImbalance" value="${currentWeights.resourceInfluenceImbalance}" step="0.1"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                </div>
            </div>
            
            <!-- Special Features -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #FF9800; margin: 0 0 15px 0;">Special Features</h4>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; align-items: center;">
                    <label>Tech Specialty</label>
                    <input type="number" id="weight_techSpecialty" value="${currentWeights.techSpecialty}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Legendary Planet</label>
                    <input type="number" id="weight_legendaryPlanet" value="${currentWeights.legendaryPlanet}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Wormhole</label>
                    <input type="number" id="weight_wormhole" value="${currentWeights.wormhole}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                </div>
            </div>
            
            <!-- Planet Types -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #2196F3; margin: 0 0 15px 0;">Planet Types</h4>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; align-items: center;">
                    <label>Industrial</label>
                    <input type="number" id="weight_industrial" value="${currentWeights.industrial}" step="0.1"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Cultural</label>
                    <input type="number" id="weight_cultural" value="${currentWeights.cultural}" step="0.1"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>Hazardous</label>
                    <input type="number" id="weight_hazardous" value="${currentWeights.hazardous}" step="0.1"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                </div>
            </div>
            
            <!-- Balance Penalties -->
            <div style="margin-bottom: 20px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #9E9E9E; margin: 0 0 15px 0;">Balance Penalties</h4>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; align-items: center;">
                    <label>Low Planet Count (< 3)</label>
                    <input type="number" id="weight_lowPlanetCount" value="${currentWeights.lowPlanetCount}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    
                    <label>High Planet Count (> 5)</label>
                    <input type="number" id="weight_highPlanetCount" value="${currentWeights.highPlanetCount}" step="0.5"
                           style="padding: 4px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize event handlers for the generator popup
 */
export function initializeGeneratorPopup() {
    // Advanced settings toggle
    const toggleBtn = document.getElementById('toggleAdvanced');
    const advancedDiv = document.getElementById('advancedSettings');
    
    if (toggleBtn && advancedDiv) {
        toggleBtn.onclick = () => {
            const isHidden = advancedDiv.style.display === 'none';
            advancedDiv.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? 'Hide Advanced Settings' : 'Advanced Settings';
        };
    }
}

/**
 * Generate Milty slices based on current settings
 */
async function generateMiltySlices() {
    try {
        // Update settings from UI
        updateSettingsFromUI();
        
        // Hide previous scores and show progress
        hideSliceScores();
        showGenerationProgress('Initializing generation...', 0);
        
        // Get available systems
        const availableSystems = getAvailableSystems();
        console.log('Available systems:', availableSystems.length);
        console.log('First 10 systems:', availableSystems.slice(0, 10).map(s => `${s.id}:${s.name || 'Unknown'}`));
        
        showGenerationProgress('Loading available systems...', 10);
        
        if (availableSystems.length === 0) {
            throw new Error('No systems available with current source settings');
        }
        
        // Generate slices
        const slices = await generateSlicesWithConstraints(availableSystems);
        console.log('Generated slices:', slices);
        console.log('Number of slices generated:', slices.length);
        
        // Apply score balancing if enabled
        if (currentSettings.scoreBalancing.enabled) {
            showGenerationProgress('Balancing slice scores...', 70);
            await balanceSliceScores(slices);
        }
        
        // Log detailed slice information
        slices.forEach((slice, i) => {
            const planetSystems = slice.systems.filter(s => s.planets && s.planets.length > 0);
            const emptySystems = slice.systems.filter(s => !s.planets || s.planets.length === 0);
            
            console.log(`Slice ${i}: ${slice.systems.length} systems (${planetSystems.length} planet + ${emptySystems.length} empty/anomaly) - ${slice.totalResources}R/${slice.totalInfluence}I, ${slice.optimalResources}/${slice.optimalInfluence} optimal`);
            console.log(`  Systems:`, slice.systems.map(s => `${s.id}:${s.name || 'Unknown'}`));
        });
        
        showGenerationProgress('Placing slices on map...', currentSettings.scoreBalancing.enabled ? 85 : 80);
        
        // Place slices on the map
        await placeSlicesOnMap(slices);
        showGenerationProgress('Generation complete!', 100);
        
        // Show slice scores
        showSliceScores(slices);
        
        // Hide progress after a moment
        setTimeout(() => {
            hideGenerationProgress();
        }, 2000);
        
    } catch (error) {
        console.error('Slice generation failed:', error);
        showGenerationProgress(`Error: ${error.message}`, 0);
        setTimeout(() => {
            hideGenerationProgress();
        }, 3000);
    }
}

/**
 * Update current settings from UI inputs
 */
function updateSettingsFromUI() {
    currentSettings.sliceCount = parseInt(document.getElementById('sliceCount')?.value) || 6;
    currentSettings.wormholes.includeAlphaBeta = document.getElementById('includeAlphaBeta')?.checked || false;
    currentSettings.wormholes.maxPerSlice = document.getElementById('maxOneWormhole')?.checked ? 1 : 2;
    currentSettings.legendaries.minimum = parseInt(document.getElementById('minLegendaries')?.value) || 0;
    
    currentSettings.sources.baseGame = document.getElementById('sourceBaseGame')?.checked || false;
    currentSettings.sources.prophecyOfKings = document.getElementById('sourcePok')?.checked || false;
    currentSettings.sources.codex = document.getElementById('sourceCodex')?.checked || false;
    currentSettings.sources.uncharted = document.getElementById('sourceUncharted')?.checked || false;
    
    currentSettings.draftOrder.useSpecifiedOrder = document.getElementById('useSpecifiedOrder')?.checked || false;
    
    currentSettings.sliceGeneration.minOptimalInfluence = parseFloat(document.getElementById('minOptimalInfluence')?.value) || 4;
    currentSettings.sliceGeneration.minOptimalResources = parseFloat(document.getElementById('minOptimalResources')?.value) || 2.5;
    currentSettings.sliceGeneration.minOptimalTotal = parseFloat(document.getElementById('minOptimalTotal')?.value) || 9;
    currentSettings.sliceGeneration.maxOptimalTotal = parseFloat(document.getElementById('maxOptimalTotal')?.value) || 13;
    currentSettings.sliceGeneration.minPlanetSystems = parseInt(document.getElementById('minPlanetSystems')?.value) || 3;
    currentSettings.sliceGeneration.maxPlanetSystems = parseInt(document.getElementById('maxPlanetSystems')?.value) || 4;
    
    currentSettings.scoreBalancing.enabled = document.getElementById('enableScoreBalancing')?.checked || false;
    
    console.log('Updated settings:', currentSettings);
}

/**
 * Get available systems based on source settings
 */
function getAvailableSystems() {
    const editor = window.editor;
    if (!editor) {
        console.warn('Editor not available');
        return [];
    }
    
    // Use allSystems if available, otherwise fallback to sectorIDLookup values
    let systems = [];
    if (editor.allSystems && Array.isArray(editor.allSystems)) {
        systems = editor.allSystems;
        console.log('Using editor.allSystems:', systems.length, 'systems');
    } else if (editor.sectorIDLookup) {
        // Get unique systems from lookup (avoid aliases)
        const seen = new Set();
        systems = Object.values(editor.sectorIDLookup).filter(system => {
            if (seen.has(system.id)) return false;
            seen.add(system.id);
            return true;
        });
        console.log('Using editor.sectorIDLookup:', systems.length, 'unique systems');
    } else {
        console.error('No system data available');
        return [];
    }
    
    // Check if any sources are selected, if not, default to base game and PoK
    const hasAnySource = currentSettings.sources.baseGame || 
                        currentSettings.sources.prophecyOfKings || 
                        currentSettings.sources.codex || 
                        currentSettings.sources.uncharted;
    
    if (!hasAnySource) {
        console.warn('No sources selected, defaulting to base game and PoK');
        currentSettings.sources.baseGame = true;
        currentSettings.sources.prophecyOfKings = true;
    }
    
    const filtered = systems.filter(system => {
        if (!system.id) {
            return false;
        }
        
        // Filter by source
        const source = getSystemSource(system);
        if (source === 'base' && !currentSettings.sources.baseGame) return false;
        if (source === 'pok' && !currentSettings.sources.prophecyOfKings) return false;
        if (source === 'codex' && !currentSettings.sources.codex) return false;
        if (source === 'uncharted' && !currentSettings.sources.uncharted) return false;
        
        // Exclude home systems and special tiles that shouldn't be in slices
        const numId = parseInt(system.id);
        if (numId <= 18 || numId === 51) return false; // Exclude home systems (1-18) and Mecatol Rex (51)
        
        // Exclude systems with baseType === "homesystem"
        if (system.baseType === "homesystem") return false;
        
        // Exclude systems that are already placed on the map (have baseType set)
        if (editor && editor.hexes && editor.hexes[system.id] && editor.hexes[system.id].baseType) return false;
        
        // If system has planets, check for faction restrictions
        if (system.planets && Array.isArray(system.planets) && system.planets.length > 0) {
            // Exclude systems with faction homeworld planets
            if (system.planets.some(p => p && p.factionHomeworld)) return false;
            
            // Exclude systems with faction planets (planetType === 'FACTION')
            if (system.planets.some(p => p && p.planetType === 'FACTION')) return false;
        }
        
        // Allow systems with or without planets (anomalies, empty systems, etc.)
        return true;
    });
    
    console.log('Filtered systems:', filtered.length);
    console.log('Sources enabled:', currentSettings.sources);
    
    if (filtered.length < 50) {
        console.log('Sample of filtered systems:', filtered.slice(0, 15).map(s => ({
            id: s.id,
            name: s.name || 'Unknown',
            planets: s.planets ? s.planets.length : 0,
            planetNames: s.planets ? s.planets.map(p => p.name || 'Unnamed') : [],
            hasSupernova: !!s.isSupernova,
            hasAsteroidField: !!s.isAsteroidField,
            hasNebula: !!s.isNebula,
            hasGravityRift: !!s.isGravityRift,
            wormholes: s.wormholes || []
        })));
    }
    
    // Also show breakdown by type
    const withPlanets = filtered.filter(s => s.planets && s.planets.length > 0).length;
    const withoutPlanets = filtered.filter(s => !s.planets || s.planets.length === 0).length;
    console.log(`System breakdown: ${withPlanets} with planets, ${withoutPlanets} without planets`);
    
    return filtered;
}

/**
 * Determine the source of a system
 */
function getSystemSource(system) {
    if (system.id <= 50) return 'base';
    if (system.id <= 82) return 'pok';
    if (system.id <= 90) return 'codex';
    return 'uncharted';
}

/**
 * Generate slices with all constraints
 */
async function generateSlicesWithConstraints(availableSystems) {
    const maxAttempts = 1000;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        attempts++;
        
        if (attempts % 50 === 0) {
            showGenerationProgress(`Attempting generation... (${attempts}/${maxAttempts})`, 20 + (attempts / maxAttempts) * 60);
            await new Promise(resolve => setTimeout(resolve, 10)); // Allow UI update
        }
        
        try {
            const slices = generateSliceSet(availableSystems);
            if (validateSliceSet(slices)) {
                return slices;
            }
        } catch (error) {
            // Continue trying
        }
    }
    
    throw new Error(`Could not generate valid slice set after ${maxAttempts} attempts. Try relaxing constraints.`);
}

/**
 * Generate a single set of slices
 */
function generateSliceSet(availableSystems) {
    const slices = [];
    const usedSystems = new Set();
    const wormholeTracker = { alpha: 0, beta: 0, gamma: 0, delta: 0 };
    let legendaryCount = 0;
    
    for (let i = 0; i < currentSettings.sliceCount; i++) {
        const slice = generateSingleSlice(availableSystems, usedSystems, wormholeTracker, legendaryCount);
        if (!slice) throw new Error('Could not generate slice');
        
        slices.push(slice);
        slice.systems.forEach(sys => usedSystems.add(sys.id));
        
        // Update trackers
        slice.systems.forEach(sys => {
            if (sys.wormholes) {
                sys.wormholes.forEach(wh => {
                    if (wormholeTracker[wh] !== undefined) {
                        wormholeTracker[wh]++;
                    }
                });
            }
            if (sys.planets) {
                sys.planets.forEach(planet => {
                    if (planet.legendaryAbilityName) {
                        legendaryCount++;
                    }
                });
            }
        });
    }
    
    return slices;
}

/**
 * Generate a single slice
 */
function generateSingleSlice(availableSystems, usedSystems, wormholeTracker, currentLegendaryCount) {
    const maxSliceAttempts = 100;
    
    for (let attempt = 0; attempt < maxSliceAttempts; attempt++) {
        const slice = {
            systems: [],
            totalResources: 0,
            totalInfluence: 0,
            optimalResources: 0,
            optimalInfluence: 0,
            wormholes: [],
            legendaries: 0,
            techSpecialties: [],
            anomalies: [],
            score: 0
        };
        
        // Each slice should have exactly 5 systems for Milty Draft
        const systemCount = 5;
        const candidateSystems = availableSystems.filter(sys => !usedSystems.has(sys.id));
        
        if (candidateSystems.length < systemCount) continue;
        
        // Separate systems with and without planets for better balancing
        const systemsWithPlanets = candidateSystems.filter(sys => sys.planets && sys.planets.length > 0);
        const systemsWithoutPlanets = candidateSystems.filter(sys => !sys.planets || sys.planets.length === 0);
        
        // Use the configured min/max planet systems settings
        const minPlanetSystems = Math.min(
            currentSettings.sliceGeneration.minPlanetSystems, 
            systemsWithPlanets.length, 
            systemCount
        );
        const maxPlanetSystems = Math.min(
            currentSettings.sliceGeneration.maxPlanetSystems, 
            systemsWithPlanets.length, 
            systemCount
        );
        
        // Ensure min doesn't exceed max
        const actualMinPlanetSystems = Math.min(minPlanetSystems, maxPlanetSystems);
        const actualMaxPlanetSystems = maxPlanetSystems;
        
        // Randomly choose how many planet systems to include within the range
        const targetPlanetSystems = actualMinPlanetSystems + 
            Math.floor(Math.random() * (actualMaxPlanetSystems - actualMinPlanetSystems + 1));
        
        const maxEmptySystems = systemCount - targetPlanetSystems;
        
        let selectedSystems = [];
        
        // Pick required planet systems first
        if (systemsWithPlanets.length >= targetPlanetSystems) {
            const shuffledPlanetSystems = systemsWithPlanets.sort(() => Math.random() - 0.5);
            selectedSystems = shuffledPlanetSystems.slice(0, targetPlanetSystems);
        }
        
        // Fill remaining slots with empty/anomaly systems
        const remainingSlots = systemCount - selectedSystems.length;
        if (remainingSlots > 0 && systemsWithoutPlanets.length > 0) {
            const shuffledEmptySystems = systemsWithoutPlanets.sort(() => Math.random() - 0.5);
            selectedSystems.push(...shuffledEmptySystems.slice(0, Math.min(remainingSlots, systemsWithoutPlanets.length)));
        }
        
        // If we still need more systems and couldn't fill with empty systems, 
        // fill remaining with any available systems
        const stillRemainingSlots = systemCount - selectedSystems.length;
        if (stillRemainingSlots > 0) {
            const remainingCandidates = candidateSystems.filter(sys => !selectedSystems.includes(sys));
            const shuffledRemaining = remainingCandidates.sort(() => Math.random() - 0.5);
            selectedSystems.push(...shuffledRemaining.slice(0, stillRemainingSlots));
        }
        
        // Calculate slice properties
        slice.systems = selectedSystems;
        calculateSliceProperties(slice);
        
        // Check constraints
        if (validateSliceConstraints(slice, wormholeTracker, currentLegendaryCount)) {
            slice.score = calculateSliceScore(slice);
            const planetCount = slice.systems.filter(s => s.planets && s.planets.length > 0).length;
            const emptyCount = slice.systems.filter(s => !s.planets || s.planets.length === 0).length;
            console.log(`Generated slice: ${slice.systems.length} total systems (${planetCount} planet + ${emptyCount} empty/anomaly) - target was ${targetPlanetSystems} planet systems`);
            return slice;
        }
    }
    
    return null;
}

/**
 * Calculate slice properties
 */
function calculateSliceProperties(slice) {
    slice.totalResources = 0;
    slice.totalInfluence = 0;
    slice.optimalResources = 0;
    slice.optimalInfluence = 0;
    slice.wormholes = [];
    slice.legendaries = 0;
    slice.techSpecialties = [];
    slice.anomalies = [];
    
    slice.systems.forEach(system => {
        // Only process planets if they exist
        if (system.planets && Array.isArray(system.planets)) {
            system.planets.forEach(planet => {
                slice.totalResources += planet.resources || 0;
                slice.totalInfluence += planet.influence || 0;
                
                // Calculate optimal values
                const res = planet.resources || 0;
                const inf = planet.influence || 0;
                
                if (res === inf && res > 0) {
                    slice.optimalResources += res / 2;
                    slice.optimalInfluence += inf / 2;
                } else if (res > inf) {
                    slice.optimalResources += res;
                } else if (inf > res) {
                    slice.optimalInfluence += inf;
                }
                
                // Count legendaries
                if (planet.legendaryAbilityName) {
                    slice.legendaries++;
                }
                
                // Collect tech specialties
                if (planet.techSpecialty) {
                    slice.techSpecialties.push(planet.techSpecialty);
                }
            });
        }
        
        // Collect wormholes (can exist on systems without planets)
        if (system.wormholes && Array.isArray(system.wormholes)) {
            slice.wormholes.push(...system.wormholes);
        }
        
        // Collect anomalies (can exist on systems without planets)
        if (system.isSupernova) slice.anomalies.push('supernova');
        if (system.isAsteroidField) slice.anomalies.push('asteroidField');
        if (system.isNebula) slice.anomalies.push('nebula');
        if (system.isGravityRift) slice.anomalies.push('gravityRift');
    });
}

/**
 * Validate slice constraints
 */
function validateSliceConstraints(slice, wormholeTracker, currentLegendaryCount) {
    // Check that slice has the right number of planet systems
    const planetSystemCount = slice.systems.filter(sys => sys.planets && sys.planets.length > 0).length;
    if (planetSystemCount < currentSettings.sliceGeneration.minPlanetSystems || 
        planetSystemCount > currentSettings.sliceGeneration.maxPlanetSystems) {
        return false;
    }
    
    // Only check optimal values if the slice has planets that can provide them
    const hasPlanets = slice.systems.some(sys => sys.planets && sys.planets.length > 0);
    
    if (hasPlanets) {
        // Check optimal values only if there are planets in the slice
        if (slice.optimalResources < currentSettings.sliceGeneration.minOptimalResources) return false;
        if (slice.optimalInfluence < currentSettings.sliceGeneration.minOptimalInfluence) return false;
        
        const optimalTotal = slice.optimalResources + slice.optimalInfluence;
        if (optimalTotal < currentSettings.sliceGeneration.minOptimalTotal) return false;
        if (optimalTotal > currentSettings.sliceGeneration.maxOptimalTotal) return false;
    } else {
        // For slices with no planets (all anomalies/empty systems), allow them but log it
        console.log('Generated slice with no planets (all anomalies/empty systems):', slice.systems.map(s => s.id));
    }
    
    // Check wormhole constraints
    if (currentSettings.wormholes.maxPerSlice === 1 && slice.wormholes.length > 1) return false;
    
    // Check for duplicate wormholes in slice
    const wormholeSet = new Set(slice.wormholes);
    if (wormholeSet.size !== slice.wormholes.length) return false;
    
    return true;
}

/**
 * Validate the entire slice set
 */
function validateSliceSet(slices) {
    // Check legendary minimum
    const totalLegendaries = slices.reduce((sum, slice) => sum + slice.legendaries, 0);
    if (totalLegendaries < currentSettings.legendaries.minimum) return false;
    
    // Check alpha/beta wormhole requirement
    if (currentSettings.wormholes.includeAlphaBeta) {
        const alphaCount = slices.reduce((sum, slice) => sum + slice.wormholes.filter(wh => wh === 'alpha').length, 0);
        const betaCount = slices.reduce((sum, slice) => sum + slice.wormholes.filter(wh => wh === 'beta').length, 0);
        
        if (alphaCount < 2 || betaCount < 2) return false;
    }
    
    return true;
}

/**
 * Calculate slice score based on weights
 */
function calculateSliceScore(slice) {
    let score = 0;
    
    // Resource/influence values
    score += slice.totalResources * currentWeights.resourceValue;
    score += slice.totalInfluence * currentWeights.influenceValue;
    
    // Resource/influence imbalance penalty
    const imbalance = Math.abs(slice.totalResources - slice.totalInfluence);
    score += imbalance * currentWeights.resourceInfluenceImbalance;
    
    // Special features
    score += slice.legendaries * currentWeights.legendaryPlanet;
    score += slice.techSpecialties.length * currentWeights.techSpecialty;
    score += slice.wormholes.length * currentWeights.wormhole;
    
    // Anomalies
    slice.anomalies.forEach(anomaly => {
        score += currentWeights[anomaly] || 0;
    });
    
    // Planet count penalties
    const planetCount = slice.systems.reduce((sum, sys) => {
        return sum + (sys.planets && Array.isArray(sys.planets) ? sys.planets.length : 0);
    }, 0);
    if (planetCount < 3) score += currentWeights.lowPlanetCount;
    if (planetCount > 5) score += currentWeights.highPlanetCount;
    
    return score;
}

/**
 * Balance slice scores by swapping systems between slices
 */
async function balanceSliceScores(slices) {
    if (slices.length < 2) return; // Can't balance with less than 2 slices
    
    const maxBalancingAttempts = 1000;
    const targetRatio = currentSettings.scoreBalancing.targetRatio;
    
    console.log('Starting score balancing...');
    
    // Calculate initial scores and show the starting state
    slices.forEach(slice => {
        slice.score = calculateSliceScore(slice);
    });
    
    let initialScores = slices.map(s => s.score);
    let initialMinScore = Math.min(...initialScores);
    let initialMaxScore = Math.max(...initialScores);
    let initialRatio = initialMinScore / initialMaxScore;
    
    console.log(`Initial balance ratio: ${initialRatio.toFixed(3)} (target: ${targetRatio})`);
    console.log(`Initial score range: ${initialMinScore.toFixed(1)} - ${initialMaxScore.toFixed(1)}`);
    
    let improvementsMade = 0;
    let lastRatio = initialRatio;
    
    for (let attempt = 0; attempt < maxBalancingAttempts; attempt++) {
        // Calculate current scores
        slices.forEach(slice => {
            slice.score = calculateSliceScore(slice);
        });
        
        // Find min and max scores
        const scores = slices.map(s => s.score);
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const currentRatio = minScore / maxScore;
        
        if (currentRatio >= targetRatio) {
            console.log(`Score balancing complete after ${attempt} attempts. Ratio: ${currentRatio.toFixed(3)}`);
            break;
        }
        
        // Find weakest and strongest slices
        const weakestSliceIndex = scores.indexOf(minScore);
        const strongestSliceIndex = scores.indexOf(maxScore);
        
        const weakestSlice = slices[weakestSliceIndex];
        const strongestSlice = slices[strongestSliceIndex];
        
        // Try to find a beneficial swap between weakest and strongest
        let swapMade = false;
        
        for (let i = 0; i < weakestSlice.systems.length && !swapMade; i++) {
            for (let j = 0; j < strongestSlice.systems.length && !swapMade; j++) {
                const weakSystem = weakestSlice.systems[i];
                const strongSystem = strongestSlice.systems[j];
                
                // Skip if systems are the same
                if (weakSystem.id === strongSystem.id) continue;
                
                // Calculate scores if we swap these systems
                const weakSliceCopy = JSON.parse(JSON.stringify(weakestSlice));
                const strongSliceCopy = JSON.parse(JSON.stringify(strongestSlice));
                
                // Perform the swap on copies
                weakSliceCopy.systems[i] = strongSystem;
                strongSliceCopy.systems[j] = weakSystem;
                
                // Recalculate properties
                calculateSliceProperties(weakSliceCopy);
                calculateSliceProperties(strongSliceCopy);
                
                // Check if both slices still meet constraints
                if (validateSliceConstraints(weakSliceCopy, {}, 0) && 
                    validateSliceConstraints(strongSliceCopy, {}, 0)) {
                    
                    const newWeakScore = calculateSliceScore(weakSliceCopy);
                    const newStrongScore = calculateSliceScore(strongSliceCopy);
                    
                    // Check if this swap improves the balance
                    const newMinScore = Math.min(newWeakScore, newStrongScore);
                    const newMaxScore = Math.max(newWeakScore, newStrongScore);
                    const newRatio = newMinScore / newMaxScore;
                    
                    // Accept swaps that improve balance OR reduce overall variance
                    const oldVariance = Math.abs(weakestSlice.score - strongestSlice.score);
                    const newVariance = Math.abs(newWeakScore - newStrongScore);
                    
                    if (newRatio > currentRatio || (newRatio >= currentRatio * 0.99 && newVariance < oldVariance)) {
                        // Make the swap
                        weakestSlice.systems[i] = strongSystem;
                        strongestSlice.systems[j] = weakSystem;
                        
                        // Recalculate properties for real slices
                        calculateSliceProperties(weakestSlice);
                        calculateSliceProperties(strongestSlice);
                        
                        swapMade = true;
                        improvementsMade++;
                        
                        // Calculate actual improvement
                        weakestSlice.score = calculateSliceScore(weakestSlice);
                        strongestSlice.score = calculateSliceScore(strongestSlice);
                        
                        console.log(`Targeted swap ${improvementsMade}: System ${weakSystem.id} <-> ${strongSystem.id}`);
                        console.log(`  Weak slice: ${weakestSlice.score.toFixed(1)} -> ${newWeakScore.toFixed(1)}`);
                        console.log(`  Strong slice: ${strongestSlice.score.toFixed(1)} -> ${newStrongScore.toFixed(1)}`);
                        console.log(`  New ratio: ${newRatio.toFixed(3)}`);
                    }
                }
            }
        }
        
        // If no beneficial swap found, try more aggressive approaches
        if (!swapMade && attempt % 25 === 0) {
            // Strategy 1: Focus on improving bottom 3 slices
            if (attempt % 50 === 0) {
                const sortedSlices = slices.map((slice, index) => ({ slice, index, score: slice.score }))
                                          .sort((a, b) => a.score - b.score);
                
                const bottomSlices = sortedSlices.slice(0, Math.min(3, sortedSlices.length));
                const otherSlices = sortedSlices.slice(3);
                
                for (let bottomSlice of bottomSlices) {
                    if (swapMade) break;
                    
                    for (let otherSlice of otherSlices) {
                        if (swapMade) break;
                        
                        // Only try if there's a significant score difference
                        if (otherSlice.score - bottomSlice.score < 2.0) continue;
                        
                        for (let i = 0; i < bottomSlice.slice.systems.length && !swapMade; i++) {
                            for (let j = 0; j < otherSlice.slice.systems.length && !swapMade; j++) {
                                const bottomSystem = bottomSlice.slice.systems[i];
                                const otherSystem = otherSlice.slice.systems[j];
                                
                                if (bottomSystem.id === otherSystem.id) continue;
                                
                                // Test the swap
                                const bottomCopy = JSON.parse(JSON.stringify(bottomSlice.slice));
                                const otherCopy = JSON.parse(JSON.stringify(otherSlice.slice));
                                
                                bottomCopy.systems[i] = otherSystem;
                                otherCopy.systems[j] = bottomSystem;
                                
                                calculateSliceProperties(bottomCopy);
                                calculateSliceProperties(otherCopy);
                                
                                if (validateSliceConstraints(bottomCopy, {}, 0) && 
                                    validateSliceConstraints(otherCopy, {}, 0)) {
                                    
                                    const newBottomScore = calculateSliceScore(bottomCopy);
                                    const newOtherScore = calculateSliceScore(otherCopy);
                                    
                                    // Accept if bottom slice improves significantly
                                    if (newBottomScore > bottomSlice.score + 1.0) {
                                        // Make the swap
                                        bottomSlice.slice.systems[i] = otherSystem;
                                        otherSlice.slice.systems[j] = bottomSystem;
                                        
                                        calculateSliceProperties(bottomSlice.slice);
                                        calculateSliceProperties(otherSlice.slice);
                                        
                                        swapMade = true;
                                        improvementsMade++;
                                        
                                        console.log(`Bottom-focused swap ${improvementsMade}: Improved slice ${bottomSlice.index} from ${bottomSlice.score.toFixed(1)} to ${newBottomScore.toFixed(1)}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Strategy 2: Adjacent pair optimization
            if (!swapMade && attempt % 75 === 0) {
                const sortedSlices = slices.map((slice, index) => ({ slice, index, score: slice.score }))
                                          .sort((a, b) => a.score - b.score);
                
                for (let i = 0; i < sortedSlices.length - 1 && !swapMade; i++) {
                    const lowerSlice = sortedSlices[i];
                    const higherSlice = sortedSlices[i + 1];
                    
                    // Skip if gap is too small
                    if (higherSlice.score - lowerSlice.score < 1.5) continue;
                    
                    for (let sysIdx1 = 0; sysIdx1 < lowerSlice.slice.systems.length && !swapMade; sysIdx1++) {
                        for (let sysIdx2 = 0; sysIdx2 < higherSlice.slice.systems.length && !swapMade; sysIdx2++) {
                            const system1 = lowerSlice.slice.systems[sysIdx1];
                            const system2 = higherSlice.slice.systems[sysIdx2];
                            
                            if (system1.id === system2.id) continue;
                            
                            // Test the swap
                            const lowerCopy = JSON.parse(JSON.stringify(lowerSlice.slice));
                            const higherCopy = JSON.parse(JSON.stringify(higherSlice.slice));
                            
                            lowerCopy.systems[sysIdx1] = system2;
                            higherCopy.systems[sysIdx2] = system1;
                            
                            calculateSliceProperties(lowerCopy);
                            calculateSliceProperties(higherCopy);
                            
                            if (validateSliceConstraints(lowerCopy, {}, 0) && 
                                validateSliceConstraints(higherCopy, {}, 0)) {
                                
                                const newScore1 = calculateSliceScore(lowerCopy);
                                const newScore2 = calculateSliceScore(higherCopy);
                                
                                const oldGap = Math.abs(lowerSlice.score - higherSlice.score);
                                const newGap = Math.abs(newScore1 - newScore2);
                                
                                if (newGap < oldGap * 0.9) {
                                    // Make the swap
                                    lowerSlice.slice.systems[sysIdx1] = system2;
                                    higherSlice.slice.systems[sysIdx2] = system1;
                                    
                                    calculateSliceProperties(lowerSlice.slice);
                                    calculateSliceProperties(higherSlice.slice);
                                    
                                    swapMade = true;
                                    improvementsMade++;
                                    
                                    console.log(`Adjacent swap ${improvementsMade}: Gap reduced from ${oldGap.toFixed(1)} to ${newGap.toFixed(1)}`);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Progress tracking and aggressive random swaps when stuck
        if (attempt % 100 === 0 && attempt > 0) {
            const currentScores = slices.map(s => calculateSliceScore(s));
            const currentMin = Math.min(...currentScores);
            const currentMax = Math.max(...currentScores);
            const currentRatioCheck = currentMin / currentMax;
            
            console.log(`Balancing progress: attempt ${attempt}, ratio: ${currentRatioCheck.toFixed(3)}, improvements: ${improvementsMade}`);
            
            // If stuck, try aggressive random swaps
            if (Math.abs(currentRatioCheck - lastRatio) < 0.001 && attempt % 200 === 0) {
                console.log('Trying aggressive random swaps...');
                
                for (let randomAttempt = 0; randomAttempt < 10; randomAttempt++) {
                    const slice1Index = Math.floor(Math.random() * slices.length);
                    let slice2Index = Math.floor(Math.random() * slices.length);
                    while (slice2Index === slice1Index) {
                        slice2Index = Math.floor(Math.random() * slices.length);
                    }
                    
                    const slice1 = slices[slice1Index];
                    const slice2 = slices[slice2Index];
                    
                    const sys1Index = Math.floor(Math.random() * slice1.systems.length);
                    const sys2Index = Math.floor(Math.random() * slice2.systems.length);
                    
                    const system1 = slice1.systems[sys1Index];
                    const system2 = slice2.systems[sys2Index];
                    
                    if (system1.id === system2.id) continue;
                    
                    // Test the swap
                    const slice1Copy = JSON.parse(JSON.stringify(slice1));
                    const slice2Copy = JSON.parse(JSON.stringify(slice2));
                    
                    slice1Copy.systems[sys1Index] = system2;
                    slice2Copy.systems[sys2Index] = system1;
                    
                    calculateSliceProperties(slice1Copy);
                    calculateSliceProperties(slice2Copy);
                    
                    if (validateSliceConstraints(slice1Copy, {}, 0) && 
                        validateSliceConstraints(slice2Copy, {}, 0)) {
                        
                        // Calculate new overall balance
                        const testSlices = [...slices];
                        testSlices[slice1Index] = slice1Copy;
                        testSlices[slice2Index] = slice2Copy;
                        
                        const newScores = testSlices.map(s => calculateSliceScore(s));
                        const newMinScore = Math.min(...newScores);
                        const newMaxScore = Math.max(...newScores);
                        const newRatio = newMinScore / newMaxScore;
                        
                        if (newRatio > currentRatioCheck * 1.001) {
                            // Make the swap
                            slice1.systems[sys1Index] = system2;
                            slice2.systems[sys2Index] = system1;
                            
                            calculateSliceProperties(slice1);
                            calculateSliceProperties(slice2);
                            
                            improvementsMade++;
                            console.log(`Random aggressive swap ${improvementsMade}: improved ratio to ${newRatio.toFixed(3)}`);
                            break;
                        }
                    }
                }
            }
            
            lastRatio = currentRatioCheck;
        }
        
        // Allow UI updates every 50 attempts
        if (attempt % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    
    // Final score calculation and summary
    slices.forEach(slice => {
        slice.score = calculateSliceScore(slice);
    });
    
    const finalScores = slices.map(s => s.score);
    const finalMinScore = Math.min(...finalScores);
    const finalMaxScore = Math.max(...finalScores);
    const finalRatio = finalMinScore / finalMaxScore;
    
    console.log(`\n=== Score Balancing Summary ===`);
    console.log(`Initial ratio: ${initialRatio.toFixed(3)} -> Final ratio: ${finalRatio.toFixed(3)} (target: ${targetRatio})`);
    console.log(`Initial range: ${initialMinScore.toFixed(1)}-${initialMaxScore.toFixed(1)} -> Final range: ${finalMinScore.toFixed(1)}-${finalMaxScore.toFixed(1)}`);
    console.log(`Total improvements made: ${improvementsMade}`);
    console.log(`Balancing ${finalRatio >= targetRatio ? 'SUCCESS' : 'PARTIAL'} - ${finalRatio >= targetRatio ? 'Target achieved!' : 'Target not fully achieved but improved'}`);
}

/**
 * Place generated slices on the map
 */
/**
 * Place generated slices on the map
 */
async function placeSlicesOnMap(slices) {
    const editor = window.editor;
    if (!editor) throw new Error('Editor not available');
    
    console.log('Placing slices on map:', slices.length, 'slices');
    console.log('Available slotPositions:', slotPositions);
    
    // Get the first N slot positions for the slices
    const slotKeys = Object.keys(slotPositions).slice(0, slices.length);
    
    console.log('Using slot keys:', slotKeys);
    
    // Clear existing slices in the slots we'll use (positions 1-5 only, never touch position 0)
    slotKeys.forEach(slotNum => {
        const positions = slotPositions[slotNum];
        if (positions) {
            // Only clear positions 1-5, never position 0 (home system position)
            for (let i = 1; i < positions.length; i++) {
                const hexId = positions[i];
                const hexIdStr = hexId.toString().padStart(3, '0');
                if (editor.hexes[hexIdStr]) {
                    console.log('Clearing hex:', hexIdStr, '(position', i, 'in slot', slotNum + ')');
                    editor.clearAll(hexIdStr);
                }
            }
        }
    });
    
    // Place new slices in draft slots
    for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const slotNum = slotKeys[i];
        const positions = slotPositions[slotNum];
        
        console.log(`Placing slice ${i} in slot ${slotNum}:`, slice);
        console.log(`Positions for slot ${slotNum}:`, positions);
        
        if (positions && slice.systems.length > 0) {
            // Place systems in positions 1-5 only (position 0 is reserved for home system)
            const maxSystemsToPlace = Math.min(slice.systems.length, 5);
            console.log(`Placing ${maxSystemsToPlace} systems in slot ${slotNum} positions 1-5`);
            
            for (let j = 0; j < maxSystemsToPlace; j++) {
                const system = slice.systems[j];
                const hexId = positions[j + 1].toString().padStart(3, '0'); // Use positions 1-5 (skip position 0)
                
                console.log(`Placing system ${system.id} at hex ${hexId} (position ${j + 1} in slot ${slotNum})`);
                
                const hex = editor.hexes[hexId];
                if (!hex) {
                    console.warn(`Hex ${hexId} not found in editor.hexes`);
                    continue;
                }
                
                if (hex && system) {
                    try {
                        await assignSystem(editor, system, hexId);
                        markRealIDUsed(system.id);
                        console.log(`Successfully placed system ${system.id} at ${hexId}`);
                    } catch (error) {
                        console.error(`Failed to assign system ${system.id} to ${hexId}:`, error);
                    }
                }
            }
        }
    }
    
    // Update all overlays
    if (typeof window.editor?.redrawAllRealIDOverlays === 'function') {
        console.log('Redrawing realID overlays');
        window.editor.redrawAllRealIDOverlays(window.editor);
    }
    
    // Update system list
    if (typeof window.renderSystemList === 'function') {
        console.log('Rendering system list');
        window.renderSystemList();
    }
    
    console.log('Slice placement complete');
}

/**
 * Save weighting settings
 */
function saveWeightingSettings() {
    // Update weights from UI
    Object.keys(currentWeights).forEach(key => {
        const input = document.getElementById(`weight_${key}`);
        if (input) {
            currentWeights[key] = parseFloat(input.value) || 0;
        }
    });
    
    // Close popup
    const popup = document.getElementById('milty-weighting-popup');
    if (popup) {
        popup.remove();
    }
    
    alert('Weighting settings saved!');
}

/**
 * Reset weighting settings to defaults
 */
function resetWeightingSettings() {
    currentWeights = { ...DEFAULT_WEIGHTS };
    
    // Update UI
    Object.keys(currentWeights).forEach(key => {
        const input = document.getElementById(`weight_${key}`);
        if (input) {
            input.value = currentWeights[key];
        }
    });
}

/**
 * Show slice scores
 */
function showSliceScores(slices) {
    const scoresDiv = document.getElementById('sliceScores');
    const contentDiv = document.getElementById('scoresContent');
    
    if (!scoresDiv || !contentDiv) return;
    
    // Calculate scores and sort slices by score (best to worst)
    const scoredSlices = slices.map((slice, index) => ({
        index,
        slice,
        score: calculateSliceScore(slice)
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
}

/**
 * Hide slice scores
 */
function hideSliceScores() {
    const scoresDiv = document.getElementById('sliceScores');
    if (scoresDiv) scoresDiv.style.display = 'none';
}

/**
 * Show generation progress
 */
function showGenerationProgress(message, progress) {
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
function hideGenerationProgress() {
    const statusDiv = document.getElementById('generationStatus');
    if (statusDiv) statusDiv.style.display = 'none';
}

/**
 * Show generator help
 */
function showMiltyGeneratorHelp() {
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
function showWeightingHelp() {
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

// Initialize popup event handlers when content is loaded
setTimeout(() => {
    initializeGeneratorPopup();
}, 100);
