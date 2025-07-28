// List of tile IDs to always exclude from possible tiles (e.g., all hyperlanes)
const EXCLUDED_TILE_IDS = [
    // Add all known hyperlane tile IDs here (string or number as in SystemInfo.json)
    '83a', '83a60', '83a120', '83a180', '83a240', '83a300',
    '83b', '83b60', '83b120', '83b180', '83b240', '83b300',
    '84a', '84a60', '84a120', '84a180', '84a240', '84a300',
    '84b', '84b60', '84b120', '84b180', '84b240', '84b300',
    '85a', '85a60', '85a120', '85a180', '85a240', '85a300',
    '85b', '82', '82a', '18', '82ah', '82h', 'c41', '81', 'rexmex',
    'd35a', 'd35b', 'd36', 'm28'
    // Add more as needed
];
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
        minimum: 0,
        maximum: 2 // Default max, adjust as needed
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
        enabled: true,
        targetRatio: 0.75
    },
    sources: {
        base: true, // Base Game
        pokCodex: true, // Prophecy of Kings + Codex
        dsUncharted: false, // Discordant Stars / Uncharted Space
        eronous: false // Eronous / Lost_star_charts_of_Ixth / somno
    }
};

// Default feature weights for slice evaluation
const DEFAULT_WEIGHTS = {
    // Anomalies
    supernova: -3,
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

// Debug settings
let debugMode = false;
let debugDetails = {
    swapAttempts: 0,
    successfulSwaps: 0,
    swapTypes: { direct: 0, broader: 0, unused: 0, random: 0 },
    constraintFailures: 0,
    scoreImprovements: []
};

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
            },
            {
                label: 'Debug Info',
                action: () => showDebugInfo()
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
    // Ensure event handlers are attached after popup is rendered
    setTimeout(() => {
        initializeGeneratorPopup();
    }, 0);
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
                    <label style="font-weight: bold;">Minimum legendary planets:</label>
                    <input type="number" id="minLegendaries" value="${currentSettings.legendaries.minimum}" 
                           min="0" max="6" step="1"
                           style="width: 60px; padding: 5px; border: 1px solid #666; border-radius: 3px; background: #2a2a2a; color: #fff;">
                    <label style="font-weight: bold; margin-left: 20px;">Maximum legendary planets:</label>
                    <input type="number" id="maxLegendaries" value="${currentSettings.legendaries.maximum}" 
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
                        <input type="checkbox" id="sourceBase" ${currentSettings.sources.base ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Base Game</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="sourcePokCodex" ${currentSettings.sources.pokCodex ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>PoK + Codex</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="sourceDSUncharted" ${currentSettings.sources.dsUncharted ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Discordant Stars / Uncharted Space</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="sourceEronous" ${currentSettings.sources.eronous ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Eronous / Lost Star Charts of Ixth / Somno</span>
                    </label>
                </div>
            </div>
            
            <!-- Score Balancing (moved out of Advanced Settings) -->
            <div style="margin-bottom: 25px; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
                <h4 style="color: #607D8B; margin: 0 0 12px 0;">Score Balancing</h4>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="enableScoreBalancing" ${currentSettings.scoreBalancing.enabled ? 'checked' : ''}
                           style="margin-right: 8px;">
                    <span>Enable score balancing</span>
                </label>
                <div style="display: flex; align-items: center; gap: 10px; margin-left: 26px; margin-top: 8px;">
                    <label for="targetRatioPercent" style="font-size: 13px; color: #ccc;">Target % (weakest/strongest):</label>
                    <input type="number" id="targetRatioPercent" min="50" max="100" step="1" value="${Math.round((currentSettings.scoreBalancing.targetRatio || 0.75) * 100)}" style="width: 60px; padding: 4px; border: 1px solid #666; border-radius: 3px; background: #222; color: #fff;">
                    <span style="font-size: 13px; color: #aaa;">%</span>
                </div>
                <p style="margin: 5px 0 0 26px; font-size: 12px; color: #aaa; font-style: italic;">
                    Attempts to balance slice scores by swapping systems between slices to reduce score variance. The target percentage sets how close the weakest slice must be to the strongest (e.g., 80% means weakest slice must be at least 80% of the strongest slice's score).
                </p>
            </div>
            <!-- Advanced Settings (now only debug and slice generation) -->
            <div style="margin-bottom: 20px;">
                <button id="toggleAdvanced" 
                        style="background: #555; color: #fff; border: 1px solid #777; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Advanced Settings
                </button>
            </div>
            <div id="advancedSettings" style="display: none; padding: 15px; background: #3a3a3a; border-radius: 6px; border: 1px solid #555;">
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
                <h4 style="color: #607D8B; margin: 15px 0 12px 0;">Debug</h4>
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="enableDebugMode" ${debugMode ? 'checked' : ''}
                               style="margin-right: 8px;">
                        <span>Enable detailed balancing debug output</span>
                    </label>
                    <p style="margin: 5px 0 0 26px; font-size: 12px; color: #aaa; font-style: italic;">
                        Shows verbose console logging for balancing attempts, swap details, and constraint failures.
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

        // Show unused tile statistics
        showUnusedTileStatistics(slices, availableSystems);

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
    currentSettings.legendaries.maximum = parseInt(document.getElementById('maxLegendaries')?.value) || 6;

    currentSettings.sources.base = document.getElementById('sourceBase')?.checked || false;
    currentSettings.sources.pokCodex = document.getElementById('sourcePokCodex')?.checked || false;
    currentSettings.sources.dsUncharted = document.getElementById('sourceDSUncharted')?.checked || false;
    currentSettings.sources.eronous = document.getElementById('sourceEronous')?.checked || false;



    currentSettings.sliceGeneration.minOptimalInfluence = parseFloat(document.getElementById('minOptimalInfluence')?.value) || 4;
    currentSettings.sliceGeneration.minOptimalResources = parseFloat(document.getElementById('minOptimalResources')?.value) || 2.5;
    currentSettings.sliceGeneration.minOptimalTotal = parseFloat(document.getElementById('minOptimalTotal')?.value) || 9;
    currentSettings.sliceGeneration.maxOptimalTotal = parseFloat(document.getElementById('maxOptimalTotal')?.value) || 13;
    currentSettings.sliceGeneration.minPlanetSystems = parseInt(document.getElementById('minPlanetSystems')?.value) || 3;
    currentSettings.sliceGeneration.maxPlanetSystems = parseInt(document.getElementById('maxPlanetSystems')?.value) || 4;

    currentSettings.scoreBalancing.enabled = document.getElementById('enableScoreBalancing')?.checked || false;
    // Read target ratio percent and convert to decimal
    const ratioInput = document.getElementById('targetRatioPercent');
    let ratioValue = parseFloat(ratioInput?.value);
    if (isNaN(ratioValue) || ratioValue < 50 || ratioValue > 100) ratioValue = 75;
    currentSettings.scoreBalancing.targetRatio = ratioValue / 100;

    debugMode = document.getElementById('enableDebugMode')?.checked || false;

    console.log('Updated settings:', currentSettings);
    console.log('Debug mode:', debugMode ? 'ENABLED' : 'DISABLED');
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
    // Try to use SystemInfo.systems if available (from SystemInfo.json)
    if (window.SystemInfo && Array.isArray(window.SystemInfo.systems)) {
        systems = window.SystemInfo.systems;
        console.log('Using SystemInfo.systems:', systems.length, 'systems');
    } else if (editor.allSystems && Array.isArray(editor.allSystems)) {
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
    const hasAnySource = currentSettings.sources.base ||
        currentSettings.sources.pokCodex ||
        currentSettings.sources.dsUncharted ||
        currentSettings.sources.eronous;

    if (!hasAnySource) {
        console.warn('No sources selected, defaulting to base and PoK+Codex');
        currentSettings.sources.base = true;
        currentSettings.sources.pokCodex = true;
    }

    const filtered = systems.filter(system => {
        if (!system.id) return false;
        // Exclude by tile ID (e.g., all hyperlanes)
        if (EXCLUDED_TILE_IDS.includes(system.id)) return false;
        // Exclude by isHyperlane property (robust for all hyperlane systems)
        if (system.isHyperlane === true) return false;
        // Strict source filtering: only include if the system's source matches a selected source
        const source = getSystemSource(system);
        if (
            (source === 'base' && currentSettings.sources.base) ||
            (source === 'pokCodex' && currentSettings.sources.pokCodex) ||
            (source === 'dsUncharted' && currentSettings.sources.dsUncharted) ||
            (source === 'eronous' && currentSettings.sources.eronous)
        ) {
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
        }
        // If not a selected source, exclude
        return false;
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
    // Match SystemInfo.json source values to internal categories
    const src = (system.source || '').toLowerCase();
    if (src === 'base') return 'base';
    if (src === 'pok' || src === 'codex') return 'pokCodex';
    if (src === 'ds' || src === 'uncharted_space' || src === 'discordant stars/uncharted space') return 'dsUncharted';
    if (src === 'eronous' || src === 'lost_star_charts_of_ixth' || src === 'somno' || src === 'eronous/lost_star_charts_of_ixth/somno') return 'eronous';
    // Dane leaks, draft, or other unknowns can be handled as needed
    return src;
}

/**
 * Generate slices with all constraints
 */
async function generateSlicesWithConstraints(availableSystems) {
    const maxAttempts = 1000;
    let attempts = 0;

    // --- Wormhole logic: find two types with at least 2 tiles each ---
    let requiredWormholeTypes = null;
    if (currentSettings.wormholes.includeAlphaBeta) {
        // Find all wormhole systems and count types
        const wormholeCounts = {};
        availableSystems.forEach(sys => {
            if (Array.isArray(sys.wormholes)) {
                sys.wormholes.forEach(wh => {
                    if (!wormholeCounts[wh]) wormholeCounts[wh] = 0;
                    wormholeCounts[wh]++;
                });
            }
        });
        // Find all types with at least 2 tiles
        const eligibleTypes = Object.entries(wormholeCounts).filter(([type, count]) => count >= 2).map(([type]) => type);
        if (eligibleTypes.length < 2) {
            throw new Error('Not enough wormhole tiles of at least 2 types (need 2+ of each).');
        }
        // Pick two types at random
        const shuffled = eligibleTypes.sort(() => Math.random() - 0.5);
        requiredWormholeTypes = [shuffled[0], shuffled[1]];
        // Store for validation
        currentSettings.wormholes._requiredTypes = requiredWormholeTypes;
        console.log('Wormhole constraint: requiring at least 2 of each:', requiredWormholeTypes);
    } else {
        currentSettings.wormholes._requiredTypes = null;
    }

    while (attempts < maxAttempts) {
        attempts++;
        if (attempts % 50 === 0) {
            showGenerationProgress(`Attempting generation... (${attempts}/${maxAttempts})`, 20 + (attempts / maxAttempts) * 60);
            await new Promise(resolve => setTimeout(resolve, 10));
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

        // Shuffle the final selected systems to randomize their positions in the slice
        selectedSystems = selectedSystems.sort(() => Math.random() - 0.5);

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
    // Check legendary minimum and maximum
    const totalLegendaries = slices.reduce((sum, slice) => sum + slice.legendaries, 0);
    if (totalLegendaries < currentSettings.legendaries.minimum) return false;
    if (totalLegendaries > currentSettings.legendaries.maximum) return false;

    // Check wormhole requirement for any 2 types
    if (currentSettings.wormholes.includeAlphaBeta && Array.isArray(currentSettings.wormholes._requiredTypes)) {
        const [typeA, typeB] = currentSettings.wormholes._requiredTypes;
        const countA = slices.reduce((sum, slice) => sum + slice.wormholes.filter(wh => wh === typeA).length, 0);
        const countB = slices.reduce((sum, slice) => sum + slice.wormholes.filter(wh => wh === typeB).length, 0);
        if (countA < 2 || countB < 2) return false;
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

    // Planet type bonuses
    let industrialCount = 0;
    let culturalCount = 0;
    let hazardousCount = 0;

    slice.systems.forEach(system => {
        if (system.planets && Array.isArray(system.planets)) {
            system.planets.forEach(planet => {
                if (planet.planetType === 'INDUSTRIAL') industrialCount++;
                else if (planet.planetType === 'CULTURAL') culturalCount++;
                else if (planet.planetType === 'HAZARDOUS') hazardousCount++;
            });
        }
    });

    score += industrialCount * currentWeights.industrial;
    score += culturalCount * currentWeights.cultural;
    score += hazardousCount * currentWeights.hazardous;

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

    const maxBalancingAttempts = 500; // Reduced for better performance
    const targetRatio = currentSettings.scoreBalancing.targetRatio;

    // Reset debug tracking
    if (debugMode) {
        debugDetails = {
            swapAttempts: 0,
            successfulSwaps: 0,
            swapTypes: { direct: 0, broader: 0, unused: 0, random: 0 },
            constraintFailures: 0,
            scoreImprovements: []
        };
    }

    console.log('Starting score balancing...');
    if (debugMode) console.log('🔍 DEBUG MODE ENABLED - Verbose logging active');

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

    if (debugMode) {
        console.log('📊 Initial slice breakdown:');
        slices.forEach((slice, i) => {
            console.log(`  Slice ${i}: Score ${slice.score.toFixed(1)} (${slice.totalResources}R/${slice.totalInfluence}I, ${slice.systems.length} systems)`);
        });
    }

    let improvementsMade = 0;
    let consecutiveFailures = 0;

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

        // Find slices that need balancing
        const weakestSliceIndex = scores.indexOf(minScore);
        const strongestSliceIndex = scores.indexOf(maxScore);

        const weakestSlice = slices[weakestSliceIndex];
        const strongestSlice = slices[strongestSliceIndex];

        let swapMade = false;

        // Try direct swaps between weakest and strongest slices
        for (let i = 0; i < weakestSlice.systems.length && !swapMade; i++) {
            for (let j = 0; j < strongestSlice.systems.length && !swapMade; j++) {
                const weakSystem = weakestSlice.systems[i];
                const strongSystem = strongestSlice.systems[j];

                if (weakSystem.id === strongSystem.id) continue;

                // Test the swap
                if (testSystemSwap(weakestSlice, strongestSlice, i, j, scores)) {
                    // Make the swap
                    weakestSlice.systems[i] = strongSystem;
                    strongestSlice.systems[j] = weakSystem;

                    calculateSliceProperties(weakestSlice);
                    calculateSliceProperties(strongestSlice);

                    swapMade = true;
                    improvementsMade++;
                    consecutiveFailures = 0;

                    if (debugMode) {
                        debugDetails.successfulSwaps++;
                        debugDetails.swapTypes.direct++;
                    }

                    const newWeakScore = calculateSliceScore(weakestSlice);
                    const newStrongScore = calculateSliceScore(strongestSlice);

                    console.log(`Swap ${improvementsMade}: ${weakSystem.id} <-> ${strongSystem.id}`);
                    console.log(`  Scores: ${minScore.toFixed(1)} -> ${newWeakScore.toFixed(1)}, ${maxScore.toFixed(1)} -> ${newStrongScore.toFixed(1)}`);

                    if (debugMode) {
                        debugDetails.scoreImprovements.push({
                            type: 'direct',
                            improvement: (newWeakScore - minScore) + (newStrongScore - maxScore),
                            systems: [weakSystem.id, strongSystem.id]
                        });
                    }
                }
            }
        }

        if (!swapMade) {
            consecutiveFailures++;

            // Try broader swaps if direct approach isn't working
            if (consecutiveFailures > 20) {
                if (debugMode) console.log('🔄 Trying broader swaps...');
                swapMade = tryBroaderSwaps(slices, scores);
                if (swapMade) {
                    improvementsMade++;
                    consecutiveFailures = 0;
                    if (debugMode) {
                        debugDetails.successfulSwaps++;
                        debugDetails.swapTypes.broader++;
                    }
                }
            }

            // Try using unused tiles for better balancing
            if (consecutiveFailures > 30) {
                if (debugMode) console.log('🎲 Trying unused tile swaps...');
                swapMade = await tryUnusedTileSwaps(slices, scores);
                if (swapMade) {
                    improvementsMade++;
                    consecutiveFailures = 0;
                    if (debugMode) {
                        debugDetails.successfulSwaps++;
                        debugDetails.swapTypes.unused++;
                    }
                }
            }

            // If still stuck, try random swaps occasionally
            if (consecutiveFailures > 50 && attempt % 25 === 0) {
                if (debugMode) console.log('🎯 Trying random swaps...');
                swapMade = tryRandomSwap(slices);
                if (swapMade) {
                    improvementsMade++;
                    consecutiveFailures = 0;
                    if (debugMode) {
                        debugDetails.successfulSwaps++;
                        debugDetails.swapTypes.random++;
                    }
                }
            }
        }

        // Progress updates
        if (attempt % 50 === 0 && attempt > 0) {
            const currentScores = slices.map(s => calculateSliceScore(s));
            const currentMin = Math.min(...currentScores);
            const currentMax = Math.max(...currentScores);
            const currentRatioCheck = currentMin / currentMax;

            console.log(`Balancing progress: attempt ${attempt}, ratio: ${currentRatioCheck.toFixed(3)}, improvements: ${improvementsMade}`);

            // Allow UI updates
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Break if we're not making progress
        if (consecutiveFailures > 100) {
            console.log('Breaking due to lack of progress');
            break;
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

    if (debugMode) {
        console.log(`\n🔍 === Debug Statistics ===`);
        console.log(`Total swap attempts: ${debugDetails.swapAttempts}`);
        console.log(`Successful swaps: ${debugDetails.successfulSwaps}`);
        console.log(`Constraint failures: ${debugDetails.constraintFailures}`);
        console.log(`Success rate: ${debugDetails.swapAttempts > 0 ? ((debugDetails.successfulSwaps / debugDetails.swapAttempts) * 100).toFixed(1) : 0}%`);
        console.log(`Swap types breakdown:`);
        console.log(`  - Direct swaps: ${debugDetails.swapTypes.direct}`);
        console.log(`  - Broader swaps: ${debugDetails.swapTypes.broader}`);
        console.log(`  - Unused tile swaps: ${debugDetails.swapTypes.unused}`);
        console.log(`  - Random swaps: ${debugDetails.swapTypes.random}`);

        if (debugDetails.scoreImprovements.length > 0) {
            const totalImprovement = debugDetails.scoreImprovements.reduce((sum, imp) => sum + imp.improvement, 0);
            console.log(`Total score improvement: ${totalImprovement.toFixed(1)}`);
            console.log(`Average improvement per swap: ${(totalImprovement / debugDetails.scoreImprovements.length).toFixed(1)}`);
        }

        console.log(`Final slice scores:`);
        finalScores.forEach((score, i) => {
            const slice = slices[i];
            console.log(`  Slice ${i}: ${score.toFixed(1)} (${slice.totalResources}R/${slice.totalInfluence}I, ${slice.anomalies.length} anomalies)`);
        });
    }
}

/**
 * Test if swapping two systems would improve balance
 */
function testSystemSwap(slice1, slice2, sys1Index, sys2Index, allScores) {
    const system1 = slice1.systems[sys1Index];
    const system2 = slice2.systems[sys2Index];

    if (debugMode) {
        debugDetails.swapAttempts++;
    }

    // Create test copies
    const slice1Copy = JSON.parse(JSON.stringify(slice1));
    const slice2Copy = JSON.parse(JSON.stringify(slice2));

    // Perform swap on copies
    slice1Copy.systems[sys1Index] = system2;
    slice2Copy.systems[sys2Index] = system1;

    // Recalculate properties
    calculateSliceProperties(slice1Copy);
    calculateSliceProperties(slice2Copy);

    // Check constraints - use relaxed validation for balancing
    if (!validateSliceConstraintsRelaxed(slice1Copy) || !validateSliceConstraintsRelaxed(slice2Copy)) {
        if (debugMode) {
            debugDetails.constraintFailures++;
            console.log(`❌ Constraint failure: ${system1.id} <-> ${system2.id}`);
        }
        return false;
    }

    // Calculate new scores
    const newScore1 = calculateSliceScore(slice1Copy);
    const newScore2 = calculateSliceScore(slice2Copy);

    // Check if this improves balance
    const oldMin = Math.min(slice1.score, slice2.score);
    const oldMax = Math.max(slice1.score, slice2.score);
    const newMin = Math.min(newScore1, newScore2);
    const newMax = Math.max(newScore1, newScore2);

    const oldGap = oldMax - oldMin;
    const newGap = newMax - newMin;

    const wouldImprove = newGap < oldGap || (newMin > oldMin + 0.5);

    if (debugMode && wouldImprove) {
        console.log(`✅ Beneficial swap found: ${system1.id} <-> ${system2.id}`);
        console.log(`   Gap: ${oldGap.toFixed(1)} -> ${newGap.toFixed(1)} (${newGap < oldGap ? 'REDUCED' : 'WEAK IMPROVED'})`);
        console.log(`   Scores: ${slice1.score.toFixed(1)} -> ${newScore1.toFixed(1)}, ${slice2.score.toFixed(1)} -> ${newScore2.toFixed(1)}`);
    }

    // Accept if gap is reduced or if the weaker slice improves significantly
    return wouldImprove;
}

/**
 * Try swaps between any slices, not just weakest/strongest
 */
function tryBroaderSwaps(slices, scores) {
    const sortedIndices = scores.map((score, index) => ({ score, index }))
        .sort((a, b) => a.score - b.score)
        .map(item => item.index);

    // Try swaps between bottom half and top half
    const bottomHalf = sortedIndices.slice(0, Math.ceil(slices.length / 2));
    const topHalf = sortedIndices.slice(Math.floor(slices.length / 2));

    for (let bottomIndex of bottomHalf) {
        for (let topIndex of topHalf) {
            const bottomSlice = slices[bottomIndex];
            const topSlice = slices[topIndex];

            for (let i = 0; i < bottomSlice.systems.length; i++) {
                for (let j = 0; j < topSlice.systems.length; j++) {
                    if (testSystemSwap(bottomSlice, topSlice, i, j, scores)) {
                        const system1 = bottomSlice.systems[i];
                        const system2 = topSlice.systems[j];

                        bottomSlice.systems[i] = system2;
                        topSlice.systems[j] = system1;

                        calculateSliceProperties(bottomSlice);
                        calculateSliceProperties(topSlice);

                        console.log(`Broader swap: ${system1.id} <-> ${system2.id} between slices ${bottomIndex} and ${topIndex}`);
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

/**
 * Try a random swap as a last resort
 */
function tryRandomSwap(slices) {
    const slice1Index = Math.floor(Math.random() * slices.length);
    let slice2Index = Math.floor(Math.random() * slices.length);
    while (slice2Index === slice1Index) {
        slice2Index = Math.floor(Math.random() * slices.length);
    }

    const slice1 = slices[slice1Index];
    const slice2 = slices[slice2Index];

    const sys1Index = Math.floor(Math.random() * slice1.systems.length);
    const sys2Index = Math.floor(Math.random() * slice2.systems.length);

    if (testSystemSwap(slice1, slice2, sys1Index, sys2Index, [])) {
        const system1 = slice1.systems[sys1Index];
        const system2 = slice2.systems[sys2Index];

        slice1.systems[sys1Index] = system2;
        slice2.systems[sys2Index] = system1;

        calculateSliceProperties(slice1);
        calculateSliceProperties(slice2);

        console.log(`Random swap: ${system1.id} <-> ${system2.id}`);
        return true;
    }

    return false;
}

/**
 * Relaxed constraint validation for balancing (allows temporary constraint violations)
 */
function validateSliceConstraintsRelaxed(slice) {
    // Only enforce the most critical constraints during balancing

    // Must have at least some systems
    if (!slice.systems || slice.systems.length === 0) return false;

    // Basic planet system count (allow some flexibility)
    const planetSystemCount = slice.systems.filter(sys => sys.planets && sys.planets.length > 0).length;
    if (planetSystemCount < Math.max(1, currentSettings.sliceGeneration.minPlanetSystems - 1) ||
        planetSystemCount > currentSettings.sliceGeneration.maxPlanetSystems + 1) {
        return false;
    }

    // Allow wormhole violations during balancing
    // Allow optimal value violations during balancing - they'll be checked at the end

    return true;
}

/**
 * Try swapping systems in slices with unused tiles for better balance
 */
async function tryUnusedTileSwaps(slices, scores) {
    console.log('Trying unused tile swaps for better balance...');

    // Get available unused systems
    const editor = window.editor;
    if (!editor) return false;

    const availableSystems = getAvailableSystems();
    const usedSystemIds = new Set();

    // Collect all currently used system IDs
    slices.forEach(slice => {
        slice.systems.forEach(sys => usedSystemIds.add(sys.id));
    });

    // Find unused systems
    const unusedSystems = availableSystems.filter(sys => !usedSystemIds.has(sys.id));

    if (unusedSystems.length === 0) {
        console.log('No unused systems available for swapping');
        return false;
    }

    console.log(`Found ${unusedSystems.length} unused systems for potential swaps`);

    // Sort slices by score to focus on improving the weakest ones
    const sortedSlices = scores.map((score, index) => ({ score, index, slice: slices[index] }))
        .sort((a, b) => a.score - b.score);

    // Focus on the bottom 50% of slices
    const slicesToImprove = sortedSlices.slice(0, Math.ceil(slices.length / 2));

    for (let sliceInfo of slicesToImprove) {
        const slice = sliceInfo.slice;
        const sliceIndex = sliceInfo.index;

        // Try swapping each system in this slice with unused systems
        for (let systemIndex = 0; systemIndex < slice.systems.length; systemIndex++) {
            const currentSystem = slice.systems[systemIndex];

            // Test swapping with unused systems
            for (let unusedSystem of unusedSystems) {
                if (currentSystem.id === unusedSystem.id) continue;

                // Create a test slice with the swap
                const testSlice = JSON.parse(JSON.stringify(slice));
                testSlice.systems[systemIndex] = unusedSystem;

                // Recalculate properties
                calculateSliceProperties(testSlice);

                // Check constraints
                if (!validateSliceConstraintsRelaxed(testSlice)) continue;

                // Calculate new score
                const newScore = calculateSliceScore(testSlice);
                const improvement = newScore - slice.score;

                // Accept if this significantly improves the slice
                if (improvement > 1.0) {
                    console.log(`Unused tile swap: Replacing ${currentSystem.id} with ${unusedSystem.id} in slice ${sliceIndex}`);
                    console.log(`  Score improvement: ${slice.score.toFixed(1)} -> ${newScore.toFixed(1)} (+${improvement.toFixed(1)})`);

                    // Make the swap
                    slice.systems[systemIndex] = unusedSystem;
                    calculateSliceProperties(slice);
                    slice.score = calculateSliceScore(slice);

                    // Remove the unused system from the pool and add the replaced system
                    const unusedIndex = unusedSystems.indexOf(unusedSystem);
                    unusedSystems.splice(unusedIndex, 1);
                    unusedSystems.push(currentSystem);

                    return true; // Made one swap, return to allow other strategies
                }

                // Also accept smaller improvements for very weak slices
                const minSliceScore = Math.min(...scores);
                if (slice.score <= minSliceScore * 1.1 && improvement > 0.5) {
                    console.log(`Small unused tile swap for weak slice: Replacing ${currentSystem.id} with ${unusedSystem.id} in slice ${sliceIndex}`);
                    console.log(`  Score improvement: ${slice.score.toFixed(1)} -> ${newScore.toFixed(1)} (+${improvement.toFixed(1)})`);

                    // Make the swap
                    slice.systems[systemIndex] = unusedSystem;
                    calculateSliceProperties(slice);
                    slice.score = calculateSliceScore(slice);

                    // Remove the unused system from the pool and add the replaced system
                    const unusedIndex = unusedSystems.indexOf(unusedSystem);
                    unusedSystems.splice(unusedIndex, 1);
                    unusedSystems.push(currentSystem);

                    return true;
                }
            }
        }
    }

    console.log('No beneficial unused tile swaps found');
    return false;
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
                        // Clear the hex first (same as MiltyBuilderCore)
                        if (typeof editor.clearAll === 'function') {
                            editor.clearAll(hexId);
                        }

                        // Use assignSystem to place the system
                        await assignSystem(editor, system, hexId);

                        // Mark realID as used (same as MiltyBuilderCore pattern)
                        if (system.id) {
                            markRealIDUsed(system.id.toString());
                        }

                        console.log(`Successfully placed system ${system.id} at ${hexId}`);
                    } catch (error) {
                        console.error(`Failed to assign system ${system.id} to ${hexId}:`, error);
                    }
                }
            }
        }
    }

    // Update all overlays using the same pattern as MiltyBuilderCore
    console.log('Updating overlays after slice placement');

    // Set overlay visibility flags properly for generated data
    if (window.editor.showPlanetTypes === undefined) window.editor.showPlanetTypes = true;
    if (window.editor.showResInf === undefined) window.editor.showResInf = false;
    if (window.editor.showIdealRI === undefined) window.editor.showIdealRI = true;
    if (window.editor.showRealID === undefined) window.editor.showRealID = true;

    // Update visual elements first (same as MiltyBuilderCore updateVisualElements)
    if (typeof window.editor?.redrawAllRealIDOverlays === 'function') {
        window.editor.redrawAllRealIDOverlays(window.editor);
    }
    if (typeof window.renderSystemList === 'function') {
        window.renderSystemList();
    }

    // Import all the required modules first, then execute in sequence (same as importSlices)
    Promise.all([
        import('../../features/realIDsOverlays.js'),
        import('../../draw/customLinksDraw.js'),
        import('../../draw/borderAnomaliesDraw.js'),
        import('../../features/baseOverlays.js'),
        import('../../features/imageSystemsOverlay.js'),
        import('../../draw/enforceSvgLayerOrder.js'),
        import('../../ui/uiFilters.js')
    ]).then(([
        { redrawAllRealIDOverlays },
        { drawCustomAdjacencyLayer },
        { drawBorderAnomaliesLayer },
        { updateEffectsVisibility, updateWormholeVisibility },
        { updateTileImageLayer },
        { enforceSvgLayerOrder },
        { refreshSystemList }
    ]) => {
        console.log('Executing comprehensive overlay redraw sequence');

        // Execute in the exact same order as importFullState/importSlices
        redrawAllRealIDOverlays(window.editor);
        drawCustomAdjacencyLayer(window.editor);
        drawBorderAnomaliesLayer(window.editor);
        updateEffectsVisibility(window.editor);
        updateWormholeVisibility(window.editor);
        updateTileImageLayer(window.editor);

        // Refresh system list to update filter states
        refreshSystemList();

        // Enforce SVG layer order to ensure planets and overlays appear correctly
        if (window.editor?.svg) {
            enforceSvgLayerOrder(window.editor.svg);
        }

        console.log('Overlay redraw sequence complete');
    }).catch(err => {
        console.error('Could not load overlay modules:', err);
        // Fallback: try direct calls
        if (typeof window.editor?.redrawAllRealIDOverlays === 'function') {
            window.editor.redrawAllRealIDOverlays(window.editor);
        }
    });

    // Update border anomalies overlay if active
    if (typeof window.editor?.redrawBorderAnomaliesOverlay === 'function') {
        window.editor.redrawBorderAnomaliesOverlay();
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

/**
 * Show statistics about unused tiles
 */
function showUnusedTileStatistics(slices, availableSystems) {
    const usedSystemIds = new Set();

    // Collect all used system IDs
    slices.forEach(slice => {
        slice.systems.forEach(sys => usedSystemIds.add(sys.id));
    });

    // Find unused systems
    const unusedSystems = availableSystems.filter(sys => !usedSystemIds.has(sys.id));

    console.log(`\n=== Unused Tile Statistics ===`);
    console.log(`Total available systems: ${availableSystems.length}`);
    console.log(`Used in slices: ${usedSystemIds.size}`);
    console.log(`Unused systems: ${unusedSystems.length}`);

    if (unusedSystems.length > 0) {
        // Analyze unused systems
        const unusedWithPlanets = unusedSystems.filter(s => s.planets && s.planets.length > 0);
        const unusedAnomalies = unusedSystems.filter(s => !s.planets || s.planets.length === 0);

        console.log(`  - With planets: ${unusedWithPlanets.length}`);
        console.log(`  - Anomalies/Empty: ${unusedAnomalies.length}`);

        // Show top 5 unused systems with planets (by total resources + influence)
        if (unusedWithPlanets.length > 0) {
            const scoredUnused = unusedWithPlanets.map(sys => {
                let totalRes = 0;
                let totalInf = 0;
                if (sys.planets) {
                    sys.planets.forEach(p => {
                        totalRes += p.resources || 0;
                        totalInf += p.influence || 0;
                    });
                }
                return { system: sys, total: totalRes + totalInf, res: totalRes, inf: totalInf };
            }).sort((a, b) => b.total - a.total);

            console.log(`Top 5 unused planet systems:`);
            scoredUnused.slice(0, 5).forEach((item, i) => {
                console.log(`  ${i + 1}. ${item.system.id}: ${item.system.name || 'Unknown'} (${item.res}R/${item.inf}I)`);
            });
        }

        // Show unused legendary systems
        const unusedLegendaries = unusedSystems.filter(sys =>
            sys.planets && sys.planets.some(p => p.legendaryAbilityName)
        );
        if (unusedLegendaries.length > 0) {
            console.log(`Unused legendary systems: ${unusedLegendaries.map(s => `${s.id}:${s.name || 'Unknown'}`).join(', ')}`);
        }

        // Show unused tech specialties
        const unusedTechSpecs = new Set();
        unusedSystems.forEach(sys => {
            if (sys.planets) {
                sys.planets.forEach(p => {
                    if (p.techSpecialty) unusedTechSpecs.add(p.techSpecialty);
                });
            }
        });
        if (unusedTechSpecs.size > 0) {
            console.log(`Unused tech specialties: ${Array.from(unusedTechSpecs).join(', ')}`);
        }
    }

    console.log(`===============================\n`);
}

/**
 * Show debug information popup
 */
function showDebugInfo() {
    let content = `
        <div style="padding: 20px; line-height: 1.5; max-height: 60vh; overflow-y: auto; font-family: monospace;">
            <h3 style="color: #ffe066; margin-top: 0;">Debug Information</h3>
    `;

    if (debugDetails.swapAttempts === 0) {
        content += `
            <p style="color: #aaa;">No balancing data available yet. Enable debug mode and generate slices with balancing enabled to see detailed statistics.</p>
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

        if (debugDetails.scoreImprovements.length > 0) {
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
}
