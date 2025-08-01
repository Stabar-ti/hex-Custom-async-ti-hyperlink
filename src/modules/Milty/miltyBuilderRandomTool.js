// List of tile IDs to always exclude from possible tiles (e.g., all hyperlanes)
const EXCLUDED_TILE_IDS = [
    // Add all known hyperlane tile IDs here (string or number as in SystemInfo.json)
    '83a', '83a60', '83a120', '83a180', '83a240', '83a300',
    '83b', '83b60', '83b120', '83b180', '83b240', '83b300',
    '84a', '84a60', '84a120', '84a180', '84a240', '84a300',
    '84b', '84b60', '84b120', '84b180', '84b240', '84b300',
    '85a', '85a60', '85a120', '85a180', '85a240', '85a300',
    '85b', '82', '82b', '82a', '18', '82ah', '82h', 'c41', '81', 'rexmex',
    'd35a', 'd35b', 'd36', 'm28'
    // Add more as needed
];
// src/modules/Milty/miltyBuilderRandomTool.js
// Milty Draft Slice Generation Tool - Core Logic
// UI functions have been moved to miltyRandomToolUI.js for better separation of concerns

console.log('🚀 miltyBuilderRandomTool.js module is loading...');

import { assignSystem } from '../../features/assignSystem.js';
import { markRealIDUsed, unmarkRealIDUsed } from '../../ui/uiFilters.js';
import { slotPositions } from './miltyBuilderCore.js';

console.log('✅ All imports loaded successfully in miltyBuilderRandomTool.js');

// No UI imports needed - the UI module will handle all UI calls

// Default generation settings
const DEFAULT_SETTINGS = {
    sliceCount: 6,
    wormholes: {
        includeAlphaBeta: true,
        maxPerSlice: 1,
        abundanceWeight: 1.0, // 1.0 = equal probability, >1.0 = favor abundant types, <1.0 = favor rare types
        forceGamma: false // Force one gamma wormhole in one of the slices
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

// Debug settings - store in global scope to persist across module reloads
let debugMode = false;

// Store debug details in global scope so they persist across module instances
if (!window.miltyDebugState) {
    window.miltyDebugState = {
        debugDetails: {
            swapAttempts: 0,
            successfulSwaps: 0,
            swapTypes: { direct: 0, broader: 0, unused: 0, random: 0 },
            constraintFailures: 0,
            scoreImprovements: [],
            // Generation failure tracking
            generationFailures: {
                totalAttempts: 0,
                sliceSetFailures: 0,
                sliceSetValidationFailures: 0,
                individualSliceFailures: 0,
                constraintFailureBreakdown: {
                    planetSystemCount: 0,
                    optimalResources: 0,
                    optimalInfluence: 0,
                    optimalTotal: 0,
                    wormholeConstraints: 0,
                    legendaryConstraints: 0,
                    duplicateWormholes: 0
                },
                sliceGenerationPhases: {
                    insufficientCandidates: 0,
                    wormholeAssignmentFailed: 0,
                    planetSystemSelectionFailed: 0,
                    emptySystemFillingFailed: 0,
                    finalSystemFillingFailed: 0,
                    constraintValidationFailed: 0
                }
            }
        },
        debugMode: false
    };
}

// Use global debug state
let debugDetails = window.miltyDebugState.debugDetails;

// Helper function to keep global debug state in sync
function syncDebugState() {
    if (debugMode) {
        window.miltyDebugState.debugDetails = debugDetails;
        window.miltyDebugState.debugMode = debugMode;
    }
}

// Export accessor functions for UI module
export function getCurrentWeights() {
    return { ...currentWeights };
}

export function setCurrentSettings(settings) {
    currentSettings = { ...settings };
    debugMode = settings.debugMode;
    // Also store in global state to persist across module reloads
    window.miltyDebugState.debugMode = settings.debugMode;
    console.log('🔧 Settings updated:', currentSettings);
    console.log('🔧 Debug mode specifically set to:', debugMode);
    console.log('🔧 Global debug mode set to:', window.miltyDebugState.debugMode);
    console.log('🔧 Settings.debugMode was:', settings.debugMode);
}

export function getCurrentSettings() {
    return { ...currentSettings };
}

export function setCurrentWeights(weights) {
    currentWeights = { ...weights };
    console.log('🎛️ Weights updated:', currentWeights);
}

export function resetWeightsToDefault() {
    currentWeights = { ...DEFAULT_WEIGHTS };
    console.log('🔄 Weights reset to default');
}

export function getDebugDetails() {
    console.log('🔍 getDebugDetails called');

    // Sync debug mode from global state
    debugMode = window.miltyDebugState.debugMode;
    debugDetails = window.miltyDebugState.debugDetails;

    console.log('🔍 Current debugMode variable:', debugMode);
    console.log('🔍 Global debugMode state:', window.miltyDebugState.debugMode);
    console.log('🔍 Current debugDetails:', debugDetails);
    console.log('🔍 debugDetails.swapAttempts:', debugDetails.swapAttempts);

    if (debugDetails.generationFailures) {
        console.log('🔍 Generation failures:', debugDetails.generationFailures);
    }

    return debugDetails;
}

export { calculateSliceScore };

// Simple test export to verify module loading
export const moduleTest = 'Module loaded successfully!';

console.log('📦 All functions exported from miltyBuilderRandomTool.js');

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
 * This is the core generation function without UI calls
 */
export async function generateMiltySlices() {
    console.log('🔥 generateMiltySlices function called!');
    // Settings should be updated by UI before calling this function

    // Get available systems
    const availableSystems = getAvailableSystems();
    console.log('Available systems:', availableSystems.length);
    console.log('First 10 systems:', availableSystems.slice(0, 10).map(s => `${s.id}:${s.name || 'Unknown'}`));

    if (availableSystems.length === 0) {
        throw new Error('No systems available with current source settings');
    }

    // Generate slices
    const slices = await generateSlicesWithConstraints(availableSystems);
    console.log('Generated slices:', slices);
    console.log('Number of slices generated:', slices.length);

    // Apply score balancing if enabled
    if (currentSettings.scoreBalancing.enabled) {
        await balanceSliceScores(slices);
    }

    // Log detailed slice information
    slices.forEach((slice, i) => {
        const planetSystems = slice.systems.filter(s => s.planets && s.planets.length > 0);
        const emptySystems = slice.systems.filter(s => !s.planets || s.planets.length === 0);

        console.log(`Slice ${i}: ${slice.systems.length} systems (${planetSystems.length} planet + ${emptySystems.length} empty/anomaly) - ${slice.totalResources}R/${slice.totalInfluence}I, ${slice.optimalResources}/${slice.optimalInfluence} optimal`);
        console.log(`  Systems:`, slice.systems.map(s => `${s.id}:${s.name || 'Unknown'}`));
    });

    // Place slices on the map
    await placeSlicesOnMap(slices);

    return slices; // Return the slices for UI to handle
}

/**
 * Update current settings from UI inputs
 */
function updateSettingsFromUI() {
    currentSettings.sliceCount = parseInt(document.getElementById('sliceCount')?.value) || 6;
    currentSettings.wormholes.includeAlphaBeta = document.getElementById('includeAlphaBeta')?.checked || false;
    currentSettings.wormholes.maxPerSlice = document.getElementById('maxOneWormhole')?.checked ? 1 : 2;
    currentSettings.wormholes.abundanceWeight = parseFloat(document.getElementById('wormholeAbundanceWeight')?.value) || 1.0;
    currentSettings.wormholes.forceGamma = document.getElementById('forceGamma')?.checked || false;
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

        // Exclude by tile ID (robust matching for strings and numbers)
        const systemId = String(system.id).toLowerCase();
        const isExcluded = EXCLUDED_TILE_IDS.some(excludedId => {
            const excludedIdStr = String(excludedId).toLowerCase();
            return systemId === excludedIdStr;
        });
        if (isExcluded) {
            if (debugMode) console.log(`Excluding system ${system.id} - found in EXCLUDED_TILE_IDS`);
            return false;
        }

        // Exclude by isHyperlane property (robust for all hyperlane systems)
        if (system.isHyperlane === true) {
            if (debugMode) console.log(`Excluding system ${system.id} - marked as hyperlane`);
            return false;
        }
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
            if (numId <= 18 || numId === 51) {
                if (debugMode) console.log(`Excluding system ${system.id} - home system or Mecatol Rex`);
                return false; // Exclude home systems (1-18) and Mecatol Rex (51)
            }
            // Exclude systems with baseType === "homesystem"
            if (system.baseType === "homesystem") {
                if (debugMode) console.log(`Excluding system ${system.id} - baseType is homesystem`);
                return false;
            }
            // Exclude systems that are already placed on the map (have baseType set)
            if (editor && editor.hexes && editor.hexes[system.id] && editor.hexes[system.id].baseType) {
                if (debugMode) console.log(`Excluding system ${system.id} - already placed on map`);
                return false;
            }
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
 * Smart wormhole pre-selection to guarantee constraint satisfaction
 */
function smartWormholePreSelection(availableSystems, sliceCount) {
    console.log('🌀 Running smart wormhole pre-selection...');

    // Find all wormhole systems and count types (exclude gamma - they don't count for alpha/beta constraint)
    const wormholeSystems = availableSystems.filter(sys =>
        sys.wormholes && Array.isArray(sys.wormholes) && sys.wormholes.length > 0
    );

    const wormholeTypeGroups = {};
    wormholeSystems.forEach(sys => {
        sys.wormholes.forEach(wh => {
            // Skip null/undefined wormholes
            if (!wh) return;

            const wormholeType = wh.toLowerCase();
            // For alpha/beta constraint, exclude gamma and delta (gamma doesn't count, delta shouldn't be selected)
            if (wormholeType === 'gamma' || wormholeType === 'delta') return;

            if (!wormholeTypeGroups[wh]) wormholeTypeGroups[wh] = [];
            wormholeTypeGroups[wh].push(sys);
        });
    });

    console.log('Available wormhole types (excluding gamma/delta):', Object.keys(wormholeTypeGroups));
    console.log('Wormhole type counts:', Object.fromEntries(
        Object.entries(wormholeTypeGroups).map(([type, systems]) => [type, systems.length])
    ));

    // Find types with at least 2 tiles
    const eligibleTypes = Object.entries(wormholeTypeGroups).filter(([type, systems]) => systems.length >= 2);

    if (eligibleTypes.length < 2) {
        console.warn('Not enough non-gamma wormhole types with 2+ tiles each');
        return { selectedSystems: [], requiredTypes: null };
    }

    // Use weighted random selection based on abundance and user preference
    const abundanceWeight = currentSettings.wormholes.abundanceWeight || 1.0;

    // Calculate weighted probabilities for each eligible type
    const weightedTypes = eligibleTypes.map(([type, systems]) => ({
        type,
        systems,
        weight: Math.pow(systems.length, abundanceWeight)
    }));

    // Select first type using weighted random
    const totalWeight1 = weightedTypes.reduce((sum, wt) => sum + wt.weight, 0);
    let random1 = Math.random() * totalWeight1;
    let selectedType1 = null;
    for (const wt of weightedTypes) {
        random1 -= wt.weight;
        if (random1 <= 0) {
            selectedType1 = wt.type;
            break;
        }
    }

    // Select second type (excluding the first one) using weighted random
    const remainingTypes = weightedTypes.filter(wt => wt.type !== selectedType1);
    const totalWeight2 = remainingTypes.reduce((sum, wt) => sum + wt.weight, 0);
    let random2 = Math.random() * totalWeight2;
    let selectedType2 = null;
    for (const wt of remainingTypes) {
        random2 -= wt.weight;
        if (random2 <= 0) {
            selectedType2 = wt.type;
            break;
        }
    }

    const selectedTypes = [selectedType1, selectedType2];

    console.log(`Selected wormhole types: ${selectedTypes[0]} (${wormholeTypeGroups[selectedTypes[0]].length} available), ${selectedTypes[1]} (${wormholeTypeGroups[selectedTypes[1]].length} available)`);
    console.log(`Abundance weight used: ${abundanceWeight} (1.0 = equal probability, >1.0 = favor abundant types, <1.0 = favor rare types)`);
    console.log(`Gamma and Delta wormholes excluded from selection (Gamma for constraint rules, Delta by design choice)`);

    // Pre-select enough systems to satisfy the constraint (at least 2 of each type)
    // Select 2 or more of each type, regardless of slice count
    const systemsPerType = Math.max(2, Math.min(wormholeTypeGroups[selectedTypes[0]].length, wormholeTypeGroups[selectedTypes[1]].length));
    const preSelectedSystems = [];

    // Select systems of the first type
    const type1Systems = [...wormholeTypeGroups[selectedTypes[0]]]; // Copy array
    const selectedFirstTypeSystems = [];
    const maxType1 = Math.min(systemsPerType, type1Systems.length);
    for (let i = 0; i < maxType1; i++) {
        const randomIndex = Math.floor(Math.random() * type1Systems.length);
        const selected = type1Systems.splice(randomIndex, 1)[0];
        selectedFirstTypeSystems.push(selected);
        preSelectedSystems.push(selected);
    }

    // Select systems of the second type
    const type2Systems = [...wormholeTypeGroups[selectedTypes[1]]]; // Copy array
    const selectedSecondTypeSystems = [];
    const maxType2 = Math.min(systemsPerType, type2Systems.length);
    for (let i = 0; i < maxType2; i++) {
        const randomIndex = Math.floor(Math.random() * type2Systems.length);
        const selected = type2Systems.splice(randomIndex, 1)[0];
        selectedSecondTypeSystems.push(selected);
        preSelectedSystems.push(selected);
    }

    console.log(`Pre-selected wormhole systems:`, {
        [selectedTypes[0]]: selectedFirstTypeSystems.map(s => s.id),
        [selectedTypes[1]]: selectedSecondTypeSystems.map(s => s.id),
        totalPreSelected: preSelectedSystems.length,
        systemsPerType: systemsPerType
    });

    return {
        selectedSystems: preSelectedSystems,
        requiredTypes: selectedTypes
    };
}

/**
 * Generate slices with all constraints
 */
async function generateSlicesWithConstraints(availableSystems) {
    const maxAttempts = 2000;
    let attempts = 0;

    // Reset generation failure tracking if in debug mode
    if (debugMode) {
        debugDetails.generationFailures = {
            totalAttempts: 0,
            sliceSetFailures: 0,
            sliceSetValidationFailures: 0,
            individualSliceFailures: 0,
            constraintFailureBreakdown: {
                planetSystemCount: 0,
                optimalResources: 0,
                optimalInfluence: 0,
                optimalTotal: 0,
                wormholeConstraints: 0,
                legendaryConstraints: 0,
                duplicateWormholes: 0
            },
            sliceGenerationPhases: {
                insufficientCandidates: 0,
                wormholeAssignmentFailed: 0,
                planetSystemSelectionFailed: 0,
                emptySystemFillingFailed: 0,
                finalSystemFillingFailed: 0,
                constraintValidationFailed: 0
            }
        };
        window.miltyDebugState.debugDetails = debugDetails;
    }

    // --- Smart wormhole pre-selection to improve success rates ---
    let preSelectedWormholeSystems = [];
    let requiredWormholeTypes = null;
    let gammaWormholeSystem = null;

    // Handle alpha/beta wormhole pre-selection
    if (currentSettings.wormholes.includeAlphaBeta) {
        const wormholeResult = smartWormholePreSelection(availableSystems, currentSettings.sliceCount);
        preSelectedWormholeSystems = wormholeResult.selectedSystems;
        requiredWormholeTypes = wormholeResult.requiredTypes;

        if (!requiredWormholeTypes) {
            throw new Error('Not enough wormhole tiles of at least 2 types (need 2+ of each) for smart pre-selection.');
        }

        // Store for validation
        currentSettings.wormholes._requiredTypes = requiredWormholeTypes;
        currentSettings.wormholes._preSelectedSystems = preSelectedWormholeSystems;

        console.log('Smart wormhole pre-selection:', {
            requiredTypes: requiredWormholeTypes,
            preSelectedSystems: preSelectedWormholeSystems.length,
            systemIds: preSelectedWormholeSystems.map(s => s.id)
        });
    } else {
        currentSettings.wormholes._requiredTypes = null;
        currentSettings.wormholes._preSelectedSystems = [];
    }

    // Handle gamma wormhole selection independently
    if (currentSettings.wormholes.forceGamma) {
        const gammaSystems = availableSystems.filter(sys =>
            sys.wormholes && sys.wormholes.some(wh => wh && wh.toLowerCase() === 'gamma')
        );

        if (gammaSystems.length > 0) {
            // Select a random gamma system
            gammaWormholeSystem = gammaSystems[Math.floor(Math.random() * gammaSystems.length)];
            console.log(`Selected gamma wormhole system: ${gammaWormholeSystem.id} (${gammaSystems.length} gamma systems available)`);
        } else {
            console.warn('Force gamma requested but no gamma wormhole systems available');
        }
    }

    // Store gamma system for slice generation
    currentSettings.wormholes._gammaSystem = gammaWormholeSystem;

    while (attempts < maxAttempts) {
        attempts++;
        if (debugMode) {
            debugDetails.generationFailures.totalAttempts++;
        }

        if (attempts % 50 === 0) {
            // Progress updates handled by UI layer
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        try {
            const slices = generateSliceSet(availableSystems);
            if (validateSliceSet(slices)) {
                if (debugMode) {
                    console.log(`🎯 Generation succeeded after ${attempts} attempts`);
                    console.log(`📊 Failure breakdown:`, debugDetails.generationFailures);
                }
                return slices;
            } else {
                if (debugMode) {
                    debugDetails.generationFailures.sliceSetValidationFailures++;
                    console.log(`❌ Slice set validation failed on attempt ${attempts}`);
                }
            }
        } catch (error) {
            if (debugMode) {
                debugDetails.generationFailures.sliceSetFailures++;
                console.log(`❌ Slice set generation failed on attempt ${attempts}: ${error.message}`);
            }
            // Continue trying
        }
    }

    if (debugMode) {
        console.log(`💥 Generation failed after ${maxAttempts} attempts`);
        console.log(`📊 Final failure breakdown:`, debugDetails.generationFailures);
    }

    throw new Error(`Could not generate valid slice set after ${maxAttempts} attempts. Try relaxing constraints.`);
}

/**
 * Generate a single set of slices with smart wormhole handling
 */
function generateSliceSet(availableSystems) {
    const slices = [];
    const usedSystems = new Set();
    // Initialize wormhole tracker with all known wormhole types
    const wormholeTracker = {
        alpha: 0, beta: 0, gamma: 0, delta: 0, eta: 0, epsilon: 0,
        kappa: 0, zeta: 0, champion: 0, probability: 0, voyage: 0,
        narrows: 0, iota: 0, theta: 0
    };
    let legendaryCount = 0;

    // Get pre-selected wormhole systems
    const preSelectedWormholes = currentSettings.wormholes._preSelectedSystems || [];
    const wormholeQueue = [...preSelectedWormholes]; // Copy for distribution
    const gammaSystem = currentSettings.wormholes._gammaSystem;
    let gammaAssigned = false;

    // Randomly choose which slice gets the gamma system (if any)
    let gammaSliceIndex = -1;
    if (gammaSystem) {
        gammaSliceIndex = Math.floor(Math.random() * currentSettings.sliceCount);
        console.log(`Gamma system ${gammaSystem.id} will be assigned to slice ${gammaSliceIndex}`);
    }

    console.log(`Starting slice generation with ${wormholeQueue.length} pre-selected wormhole systems`);

    for (let i = 0; i < currentSettings.sliceCount; i++) {
        // Decide if this slice should get the gamma system
        const shouldAssignGamma = gammaSystem && i === gammaSliceIndex && !gammaAssigned && !usedSystems.has(gammaSystem.id);

        const slice = generateSingleSlice(availableSystems, usedSystems, wormholeTracker, legendaryCount, wormholeQueue, shouldAssignGamma ? gammaSystem : null);
        if (!slice) throw new Error('Could not generate slice');

        slices.push(slice);
        slice.systems.forEach(sys => usedSystems.add(sys.id));

        // Check if gamma was assigned in this slice
        if (shouldAssignGamma && slice.systems.includes(gammaSystem)) {
            gammaAssigned = true;
            console.log(`Gamma system ${gammaSystem.id} assigned to slice ${i}`);
        }

        // Update trackers
        slice.systems.forEach(sys => {
            if (sys.wormholes) {
                sys.wormholes.forEach(wh => {
                    if (wh && wormholeTracker.hasOwnProperty(wh.toLowerCase())) {
                        wormholeTracker[wh.toLowerCase()]++;
                    } else if (wh) {
                        // Initialize unknown wormhole types dynamically
                        const wormholeType = wh.toLowerCase();
                        if (!wormholeTracker[wormholeType]) {
                            wormholeTracker[wormholeType] = 0;
                        }
                        wormholeTracker[wormholeType]++;
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

    console.log(`Final wormhole distribution:`, wormholeTracker);
    return slices;
}

/**
 * Generate a single slice with constraint-aware selection and smart wormhole handling
 */
function generateSingleSlice(availableSystems, usedSystems, wormholeTracker, currentLegendaryCount, wormholeQueue = [], assignedGammaSystem = null) {
    const maxSliceAttempts = 100;

    // Pre-categorize systems for more efficient selection
    const candidateSystems = availableSystems.filter(sys => !usedSystems.has(sys.id));
    const systemsWithPlanets = candidateSystems.filter(sys => sys.planets && sys.planets.length > 0);
    const systemsWithoutPlanets = candidateSystems.filter(sys => !sys.planets || sys.planets.length === 0);

    // Further categorize by value to improve constraint satisfaction
    const highValueSystems = systemsWithPlanets.filter(sys => {
        const optimalValue = calculateSystemOptimalValue(sys);
        return optimalValue >= currentSettings.sliceGeneration.minOptimalResources * 1.5;
    });
    const mediumValueSystems = systemsWithPlanets.filter(sys => {
        const optimalValue = calculateSystemOptimalValue(sys);
        return optimalValue >= currentSettings.sliceGeneration.minOptimalResources * 0.8 &&
            optimalValue < currentSettings.sliceGeneration.minOptimalResources * 1.5;
    });
    const lowValueSystems = systemsWithPlanets.filter(sys => {
        const optimalValue = calculateSystemOptimalValue(sys);
        return optimalValue < currentSettings.sliceGeneration.minOptimalResources * 0.8;
    });

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

        if (candidateSystems.length < systemCount) {
            if (debugMode) {
                debugDetails.generationFailures.sliceGenerationPhases.insufficientCandidates++;
                console.log(`❌ Insufficient candidate systems: need ${systemCount}, have ${candidateSystems.length}`);
            }
            continue;
        }

        // Smart wormhole allocation: try to assign one pre-selected wormhole per slice
        // But don't force it - some slices might not get wormholes from the pre-selected pool
        let assignedWormhole = null;

        // Priority 1: Assign gamma system if specified for this slice
        if (assignedGammaSystem && candidateSystems.includes(assignedGammaSystem)) {
            assignedWormhole = assignedGammaSystem;
            console.log(`Assigning gamma system ${assignedGammaSystem.id} to this slice`);
        }
        // Priority 2: Assign from pre-selected wormhole queue
        else if (wormholeQueue.length > 0 && currentSettings.wormholes.includeAlphaBeta) {
            // Take the first available wormhole from the queue
            for (let i = 0; i < wormholeQueue.length; i++) {
                const wormholeSystem = wormholeQueue[i];
                if (!usedSystems.has(wormholeSystem.id) && candidateSystems.includes(wormholeSystem)) {
                    assignedWormhole = wormholeSystem;
                    wormholeQueue.splice(i, 1); // Remove from queue
                    break;
                }
            }
            // Don't treat this as a failure - just means this slice won't get a pre-selected wormhole
            if (!assignedWormhole && debugMode && wormholeQueue.length > 0) {
                console.log(`ℹ️ No suitable wormhole from queue for this slice (${wormholeQueue.length} remaining)`);
            }
        }

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

        // Account for the assigned wormhole when calculating planet system targets
        let targetPlanetSystems = actualMinPlanetSystems +
            Math.floor(Math.random() * (actualMaxPlanetSystems - actualMinPlanetSystems + 1));

        // If assigned wormhole has planets, it counts toward planet systems
        if (assignedWormhole && assignedWormhole.planets && assignedWormhole.planets.length > 0) {
            targetPlanetSystems = Math.max(0, targetPlanetSystems - 1);
        }

        let selectedSystems = [];

        // Add the assigned wormhole first if we have one
        if (assignedWormhole) {
            selectedSystems.push(assignedWormhole);
        }

        // Smart selection for remaining systems
        const remainingSlots = systemCount - selectedSystems.length;
        if (remainingSlots > 0 && targetPlanetSystems > 0 && systemsWithPlanets.length >= targetPlanetSystems) {
            // Try to build a valid slice by prioritizing constraint satisfaction
            const remainingPlanetSystems = selectConstraintAwareSystems(
                highValueSystems.filter(s => !selectedSystems.includes(s)),
                mediumValueSystems.filter(s => !selectedSystems.includes(s)),
                lowValueSystems.filter(s => !selectedSystems.includes(s)),
                targetPlanetSystems,
                currentSettings
            );

            if (remainingPlanetSystems.length < targetPlanetSystems && debugMode) {
                debugDetails.generationFailures.sliceGenerationPhases.planetSystemSelectionFailed++;
                console.log(`⚠️ Planet system selection: wanted ${targetPlanetSystems}, got ${remainingPlanetSystems.length}`);
            }

            selectedSystems.push(...remainingPlanetSystems.slice(0, Math.min(remainingSlots, targetPlanetSystems)));
        }

        // Fill remaining slots with empty/anomaly systems
        const stillRemainingSlots = systemCount - selectedSystems.length;
        if (stillRemainingSlots > 0 && systemsWithoutPlanets.length > 0) {
            const availableEmptySystems = systemsWithoutPlanets.filter(s => !selectedSystems.includes(s));
            const shuffledEmptySystems = availableEmptySystems.sort(() => Math.random() - 0.5);
            const emptySystemsToAdd = shuffledEmptySystems.slice(0, Math.min(stillRemainingSlots, availableEmptySystems.length));

            if (emptySystemsToAdd.length < stillRemainingSlots && debugMode) {
                debugDetails.generationFailures.sliceGenerationPhases.emptySystemFillingFailed++;
                console.log(`⚠️ Empty system filling: needed ${stillRemainingSlots}, got ${emptySystemsToAdd.length}`);
            }

            selectedSystems.push(...emptySystemsToAdd);
        }

        // If we still need more systems, fill with any available systems
        const finalRemainingSlots = systemCount - selectedSystems.length;
        if (finalRemainingSlots > 0) {
            const remainingCandidates = candidateSystems.filter(sys => !selectedSystems.includes(sys));
            const shuffledRemaining = remainingCandidates.sort(() => Math.random() - 0.5);
            const finalSystemsToAdd = shuffledRemaining.slice(0, finalRemainingSlots);

            if (finalSystemsToAdd.length < finalRemainingSlots && debugMode) {
                debugDetails.generationFailures.sliceGenerationPhases.finalSystemFillingFailed++;
                console.log(`⚠️ Final system filling: needed ${finalRemainingSlots}, got ${finalSystemsToAdd.length}`);
            }

            selectedSystems.push(...finalSystemsToAdd);
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
            const wormholeIds = slice.systems.filter(s => s.wormholes && s.wormholes.length > 0).map(s => s.id);
            console.log(`Generated slice: ${slice.systems.length} total systems (${planetCount} planet + ${emptyCount} empty/anomaly) - wormholes: [${wormholeIds.join(', ')}]`);
            return slice;
        } else {
            if (debugMode) {
                debugDetails.generationFailures.sliceGenerationPhases.constraintValidationFailed++;
                // Get detailed constraint failure info
                const constraintDetails = getConstraintFailureDetails(slice, wormholeTracker, currentLegendaryCount);
                console.log(`❌ Slice constraint validation failed:`, constraintDetails);
            }
        }
    }

    if (debugMode) {
        debugDetails.generationFailures.individualSliceFailures++;
        console.log(`❌ Individual slice generation failed after ${maxSliceAttempts} attempts`);
    }

    return null;
}

/**
 * Get detailed information about why a slice failed constraint validation
 */
function getConstraintFailureDetails(slice, wormholeTracker, currentLegendaryCount) {
    const failures = [];

    // Check planet system count
    const planetSystemCount = slice.systems.filter(sys => sys.planets && sys.planets.length > 0).length;
    if (planetSystemCount < currentSettings.sliceGeneration.minPlanetSystems) {
        failures.push(`Too few planet systems: ${planetSystemCount} < ${currentSettings.sliceGeneration.minPlanetSystems}`);
        if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.planetSystemCount++;
    }
    if (planetSystemCount > currentSettings.sliceGeneration.maxPlanetSystems) {
        failures.push(`Too many planet systems: ${planetSystemCount} > ${currentSettings.sliceGeneration.maxPlanetSystems}`);
        if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.planetSystemCount++;
    }

    // Check optimal values if slice has planets
    const hasPlanets = slice.systems.some(sys => sys.planets && sys.planets.length > 0);
    if (hasPlanets) {
        if (slice.optimalResources < currentSettings.sliceGeneration.minOptimalResources) {
            failures.push(`Insufficient optimal resources: ${slice.optimalResources.toFixed(1)} < ${currentSettings.sliceGeneration.minOptimalResources}`);
            if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.optimalResources++;
        }
        if (slice.optimalInfluence < currentSettings.sliceGeneration.minOptimalInfluence) {
            failures.push(`Insufficient optimal influence: ${slice.optimalInfluence.toFixed(1)} < ${currentSettings.sliceGeneration.minOptimalInfluence}`);
            if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.optimalInfluence++;
        }

        const optimalTotal = slice.optimalResources + slice.optimalInfluence;
        if (optimalTotal < currentSettings.sliceGeneration.minOptimalTotal) {
            failures.push(`Insufficient optimal total: ${optimalTotal.toFixed(1)} < ${currentSettings.sliceGeneration.minOptimalTotal}`);
            if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.optimalTotal++;
        }
        if (optimalTotal > currentSettings.sliceGeneration.maxOptimalTotal) {
            failures.push(`Excessive optimal total: ${optimalTotal.toFixed(1)} > ${currentSettings.sliceGeneration.maxOptimalTotal}`);
            if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.optimalTotal++;
        }
    }

    // Check wormhole constraints
    if (currentSettings.wormholes.maxPerSlice === 1 && slice.wormholes.length > 1) {
        failures.push(`Too many wormholes: ${slice.wormholes.length} > 1`);
        if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.wormholeConstraints++;
    }

    // Check for duplicate wormholes in slice
    const wormholeSet = new Set(slice.wormholes);
    if (wormholeSet.size !== slice.wormholes.length) {
        failures.push(`Duplicate wormholes in slice: ${slice.wormholes.join(', ')}`);
        if (debugMode) debugDetails.generationFailures.constraintFailureBreakdown.duplicateWormholes++;
    }

    return failures;
}

/**
 * Calculate the optimal value of a system for constraint checking
 */
function calculateSystemOptimalValue(system) {
    if (!system.planets || !Array.isArray(system.planets)) return 0;

    let optimalResources = 0;
    let optimalInfluence = 0;

    system.planets.forEach(planet => {
        const res = planet.resources || 0;
        const inf = planet.influence || 0;

        if (res === inf && res > 0) {
            optimalResources += res / 2;
            optimalInfluence += inf / 2;
        } else if (res > inf) {
            optimalResources += res;
        } else if (inf > res) {
            optimalInfluence += inf;
        }
    });

    return optimalResources + optimalInfluence;
}

/**
 * Select systems using constraint-aware logic
 */
function selectConstraintAwareSystems(highValue, mediumValue, lowValue, targetCount, settings) {
    const selected = [];

    // Calculate how much optimal value we need
    const minOptimalTotal = settings.sliceGeneration.minOptimalTotal;
    let currentOptimal = 0;

    // First, try to get some high-value systems
    const highValueNeeded = Math.min(2, Math.floor(targetCount * 0.4), highValue.length);
    for (let i = 0; i < highValueNeeded && selected.length < targetCount; i++) {
        const system = highValue[Math.floor(Math.random() * highValue.length)];
        if (!selected.includes(system)) {
            selected.push(system);
            currentOptimal += calculateSystemOptimalValue(system);
            // Remove from array to avoid duplicates
            highValue.splice(highValue.indexOf(system), 1);
        }
    }

    // Fill with medium value systems
    while (selected.length < targetCount && mediumValue.length > 0) {
        const system = mediumValue[Math.floor(Math.random() * mediumValue.length)];
        if (!selected.includes(system)) {
            selected.push(system);
            currentOptimal += calculateSystemOptimalValue(system);
            mediumValue.splice(mediumValue.indexOf(system), 1);
        }
    }

    // If we still need more and haven't met optimal requirements, prefer systems that help
    while (selected.length < targetCount && lowValue.length > 0) {
        const system = lowValue[Math.floor(Math.random() * lowValue.length)];
        if (!selected.includes(system)) {
            selected.push(system);
            currentOptimal += calculateSystemOptimalValue(system);
            lowValue.splice(lowValue.indexOf(system), 1);
        }
    }

    return selected;
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

    // Check wormhole requirement for any 2 types (excluding gamma and delta wormholes)
    if (currentSettings.wormholes.includeAlphaBeta && Array.isArray(currentSettings.wormholes._requiredTypes)) {
        const [typeA, typeB] = currentSettings.wormholes._requiredTypes;

        // Count only non-gamma/non-delta wormholes for the alpha/beta constraint
        const countA = slices.reduce((sum, slice) => {
            return sum + slice.wormholes.filter(wh => {
                const wormholeType = wh.toLowerCase();
                return wh === typeA && wormholeType !== 'gamma' && wormholeType !== 'delta';
            }).length;
        }, 0);
        const countB = slices.reduce((sum, slice) => {
            return sum + slice.wormholes.filter(wh => {
                const wormholeType = wh.toLowerCase();
                return wh === typeB && wormholeType !== 'gamma' && wormholeType !== 'delta';
            }).length;
        }, 0);

        if (countA < 2 || countB < 2) {
            if (debugMode) {
                console.log(`❌ Wormhole constraint failed: ${typeA}=${countA}, ${typeB}=${countB} (need 2+ of each, excluding gamma)`);
                debugDetails.generationFailures.constraintFailureBreakdown.wormholeConstraints++;
            }
            return false;
        }

        if (debugMode) {
            console.log(`✅ Wormhole constraint satisfied: ${typeA}=${countA}, ${typeB}=${countB}`);
        }
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

    // Reset debug tracking - use global state
    if (debugMode) {
        debugDetails = {
            swapAttempts: 0,
            successfulSwaps: 0,
            swapTypes: { direct: 0, broader: 0, unused: 0, random: 0 },
            constraintFailures: 0,
            scoreImprovements: []
        };
        // Store in global state
        window.miltyDebugState.debugDetails = debugDetails;
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
                        syncDebugState(); // Keep global state in sync
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
                        syncDebugState(); // Keep global state in sync
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

    // Final constraint repair - fix any violations that slipped through balancing
    console.log('\n=== Final Constraint Validation & Repair ===');
    let constraintViolations = 0;
    const violatingSlices = [];

    slices.forEach((slice, i) => {
        const violations = getConstraintViolationDetails(slice);
        if (violations.length > 0) {
            console.log(`⚠️ Slice ${i} constraint violations: ${violations.join(', ')}`);
            constraintViolations++;
            violatingSlices.push({ index: i, slice, violations });
        }
    });

    // If there are violations, try to repair them using unused tiles
    if (constraintViolations > 0) {
        console.log(`🔧 Attempting to repair ${constraintViolations} slices with constraint violations...`);

        const availableSystems = getAvailableSystems();
        const usedSystemIds = new Set();
        slices.forEach(slice => {
            slice.systems.forEach(sys => usedSystemIds.add(sys.id));
        });
        const unusedSystems = availableSystems.filter(sys => !usedSystemIds.has(sys.id));

        for (const violatingSlice of violatingSlices) {
            const repaired = await repairSliceConstraints(violatingSlice.slice, violatingSlice.index, unusedSystems);
            if (repaired) {
                console.log(`✅ Repaired slice ${violatingSlice.index} constraint violations`);
            } else {
                console.log(`❌ Could not repair slice ${violatingSlice.index} constraint violations`);
            }
        }

        // Re-validate after repairs
        constraintViolations = 0;
        slices.forEach((slice, i) => {
            const violations = getConstraintViolationDetails(slice);
            if (violations.length > 0) {
                console.log(`⚠️ Slice ${i} still has violations: ${violations.join(', ')}`);
                constraintViolations++;
            }
        });
    }

    if (constraintViolations === 0) {
        console.log('✅ All slices meet original constraints');
    } else {
        console.log(`❌ ${constraintViolations} slices still have constraint violations`);
    }

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
            const planetSystems = slice.systems.filter(sys => sys.planets && sys.planets.length > 0).length;
            const emptySystems = slice.systems.filter(sys => !sys.planets || sys.planets.length === 0).length;
            console.log(`  Slice ${i}: ${score.toFixed(1)} (${slice.totalResources}R/${slice.totalInfluence}I, ${slice.optimalResources.toFixed(1)}/${slice.optimalInfluence.toFixed(1)} optimal, ${planetSystems} planet + ${emptySystems} empty systems, ${slice.anomalies.length} anomalies)`);
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
        window.miltyDebugState.debugDetails = debugDetails; // Keep global state in sync
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
            syncDebugState(); // Keep global state in sync
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
 * Get detailed constraint violation information for a slice
 */
function getConstraintViolationDetails(slice) {
    const violations = [];

    // Check planet system count
    const planetSystemCount = slice.systems.filter(sys => sys.planets && sys.planets.length > 0).length;
    if (planetSystemCount < currentSettings.sliceGeneration.minPlanetSystems) {
        violations.push(`Too few planet systems: ${planetSystemCount} < ${currentSettings.sliceGeneration.minPlanetSystems}`);
    }
    if (planetSystemCount > currentSettings.sliceGeneration.maxPlanetSystems) {
        violations.push(`Too many planet systems: ${planetSystemCount} > ${currentSettings.sliceGeneration.maxPlanetSystems}`);
    }

    // Check optimal values if slice has planets
    const hasPlanets = slice.systems.some(sys => sys.planets && sys.planets.length > 0);
    if (hasPlanets) {
        if (slice.optimalResources < currentSettings.sliceGeneration.minOptimalResources) {
            violations.push(`Insufficient optimal resources: ${slice.optimalResources.toFixed(1)} < ${currentSettings.sliceGeneration.minOptimalResources}`);
        }
        if (slice.optimalInfluence < currentSettings.sliceGeneration.minOptimalInfluence) {
            violations.push(`Insufficient optimal influence: ${slice.optimalInfluence.toFixed(1)} < ${currentSettings.sliceGeneration.minOptimalInfluence}`);
        }

        const optimalTotal = slice.optimalResources + slice.optimalInfluence;
        if (optimalTotal < currentSettings.sliceGeneration.minOptimalTotal) {
            violations.push(`Insufficient optimal total: ${optimalTotal.toFixed(1)} < ${currentSettings.sliceGeneration.minOptimalTotal}`);
        }
        if (optimalTotal > currentSettings.sliceGeneration.maxOptimalTotal) {
            violations.push(`Excessive optimal total: ${optimalTotal.toFixed(1)} > ${currentSettings.sliceGeneration.maxOptimalTotal}`);
        }
    }

    return violations;
}

/**
 * Attempt to repair constraint violations in a slice using unused systems
 */
async function repairSliceConstraints(slice, sliceIndex, unusedSystems) {
    console.log(`🔧 Attempting to repair slice ${sliceIndex} constraints...`);

    const planetSystemCount = slice.systems.filter(sys => sys.planets && sys.planets.length > 0).length;

    // Handle too many planet systems - replace some planet systems with empty/anomaly systems
    if (planetSystemCount > currentSettings.sliceGeneration.maxPlanetSystems) {
        const excessCount = planetSystemCount - currentSettings.sliceGeneration.maxPlanetSystems;
        console.log(`  Need to replace ${excessCount} planet systems with empty/anomaly systems`);

        const planetSystemIndices = [];
        slice.systems.forEach((sys, i) => {
            if (sys.planets && sys.planets.length > 0) {
                planetSystemIndices.push(i);
            }
        });

        // Find suitable empty/anomaly systems from unused pool
        const emptyUnusedSystems = unusedSystems.filter(sys => !sys.planets || sys.planets.length === 0);

        if (emptyUnusedSystems.length >= excessCount) {
            // Replace lowest value planet systems with empty systems
            const systemValues = planetSystemIndices.map(i => ({
                index: i,
                value: calculateSystemOptimalValue(slice.systems[i])
            })).sort((a, b) => a.value - b.value);

            for (let i = 0; i < excessCount && i < systemValues.length; i++) {
                const replaceIndex = systemValues[i].index;
                const replacementSystem = emptyUnusedSystems[i];

                console.log(`    Replacing planet system ${slice.systems[replaceIndex].id} with empty system ${replacementSystem.id}`);
                slice.systems[replaceIndex] = replacementSystem;

                // Remove from unused pool
                const unusedIndex = unusedSystems.indexOf(replacementSystem);
                if (unusedIndex >= 0) unusedSystems.splice(unusedIndex, 1);
            }

            calculateSliceProperties(slice);
            return true;
        }
    }

    // Handle too few planet systems - replace some empty systems with planet systems
    if (planetSystemCount < currentSettings.sliceGeneration.minPlanetSystems) {
        const neededCount = currentSettings.sliceGeneration.minPlanetSystems - planetSystemCount;
        console.log(`  Need to replace ${neededCount} empty/anomaly systems with planet systems`);

        const emptySystemIndices = [];
        slice.systems.forEach((sys, i) => {
            if (!sys.planets || sys.planets.length === 0) {
                emptySystemIndices.push(i);
            }
        });

        // Find suitable planet systems from unused pool
        const planetUnusedSystems = unusedSystems.filter(sys => sys.planets && sys.planets.length > 0)
            .sort((a, b) => calculateSystemOptimalValue(b) - calculateSystemOptimalValue(a)); // Sort by value descending

        if (planetUnusedSystems.length >= neededCount && emptySystemIndices.length >= neededCount) {
            for (let i = 0; i < neededCount; i++) {
                const replaceIndex = emptySystemIndices[i];
                const replacementSystem = planetUnusedSystems[i];

                console.log(`    Replacing empty system ${slice.systems[replaceIndex].id} with planet system ${replacementSystem.id}`);
                slice.systems[replaceIndex] = replacementSystem;

                // Remove from unused pool
                const unusedIndex = unusedSystems.indexOf(replacementSystem);
                if (unusedIndex >= 0) unusedSystems.splice(unusedIndex, 1);
            }

            calculateSliceProperties(slice);
            return true;
        }
    }

    // Handle optimal value violations - try to swap systems for better ones
    const hasPlanets = slice.systems.some(sys => sys.planets && sys.planets.length > 0);
    if (hasPlanets && (slice.optimalResources < currentSettings.sliceGeneration.minOptimalResources ||
        slice.optimalInfluence < currentSettings.sliceGeneration.minOptimalInfluence ||
        slice.optimalResources + slice.optimalInfluence < currentSettings.sliceGeneration.minOptimalTotal)) {

        console.log(`  Attempting to improve optimal values through system replacement`);

        // Find the weakest planet system in the slice
        let weakestIndex = -1;
        let weakestValue = Infinity;

        slice.systems.forEach((sys, i) => {
            if (sys.planets && sys.planets.length > 0) {
                const value = calculateSystemOptimalValue(sys);
                if (value < weakestValue) {
                    weakestValue = value;
                    weakestIndex = i;
                }
            }
        });

        if (weakestIndex >= 0) {
            // Find a better replacement from unused systems
            const betterSystems = unusedSystems.filter(sys =>
                sys.planets && sys.planets.length > 0 &&
                calculateSystemOptimalValue(sys) > weakestValue + 1.0 // Must be significantly better
            ).sort((a, b) => calculateSystemOptimalValue(b) - calculateSystemOptimalValue(a));

            if (betterSystems.length > 0) {
                const replacementSystem = betterSystems[0];
                console.log(`    Replacing weak system ${slice.systems[weakestIndex].id} (value: ${weakestValue.toFixed(1)}) with ${replacementSystem.id} (value: ${calculateSystemOptimalValue(replacementSystem).toFixed(1)})`);

                slice.systems[weakestIndex] = replacementSystem;

                // Remove from unused pool
                const unusedIndex = unusedSystems.indexOf(replacementSystem);
                if (unusedIndex >= 0) unusedSystems.splice(unusedIndex, 1);

                calculateSliceProperties(slice);
                return true;
            }
        }
    }

    console.log(`  Could not find suitable replacements to repair slice ${sliceIndex}`);
    return false;
}

/**
 * Relaxed constraint validation for balancing (allows temporary constraint violations)
 */
function validateSliceConstraintsRelaxed(slice) {
    // Only enforce the most critical constraints during balancing
    // But be stricter about planet system count to prevent violations

    // Must have at least some systems
    if (!slice.systems || slice.systems.length === 0) return false;

    // Planet system count - enforce the exact constraints, no flexibility
    const planetSystemCount = slice.systems.filter(sys => sys.planets && sys.planets.length > 0).length;

    if (planetSystemCount < currentSettings.sliceGeneration.minPlanetSystems ||
        planetSystemCount > currentSettings.sliceGeneration.maxPlanetSystems) {
        return false;
    }

    // Check basic optimal constraints - allow some flexibility but not too much
    const hasPlanets = slice.systems.some(sys => sys.planets && sys.planets.length > 0);
    if (hasPlanets) {
        // Allow optimal values to be slightly below minimum during balancing, but not too much
        const minOptimalResources = currentSettings.sliceGeneration.minOptimalResources * 0.9;
        const minOptimalInfluence = currentSettings.sliceGeneration.minOptimalInfluence * 0.9;
        const minOptimalTotal = currentSettings.sliceGeneration.minOptimalTotal * 0.9;

        if (slice.optimalResources < minOptimalResources) return false;
        if (slice.optimalInfluence < minOptimalInfluence) return false;

        const optimalTotal = slice.optimalResources + slice.optimalInfluence;
        if (optimalTotal < minOptimalTotal) return false;
    }

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


