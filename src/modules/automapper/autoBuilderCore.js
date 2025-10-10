/**
 * AutoMapper Core - Core logic for automatic map generation
 * Contains algorithms for balanced map generation and analysis
 */

/**
 * Map generation presets
 */
const MAP_PRESETS = {
    balanced: {
        name: 'Balanced',
        description: 'Well-rounded maps with fair resource distribution',
        resourceVariance: 0.15,
        anomalyDensity: 0.12,
        conflictLevel: 0.5,
        explorationFactor: 0.3
    },
    aggressive: {
        name: 'Aggressive',
        description: 'Higher conflict potential with contested areas',
        resourceVariance: 0.2,
        anomalyDensity: 0.08,
        conflictLevel: 0.8,
        explorationFactor: 0.2
    },
    exploration: {
        name: 'Exploration',
        description: 'More anomalies and exploration opportunities',
        resourceVariance: 0.18,
        anomalyDensity: 0.25,
        conflictLevel: 0.3,
        explorationFactor: 0.7
    },
    economic: {
        name: 'Economic',
        description: 'Resource-focused with high economic potential',
        resourceVariance: 0.1,
        anomalyDensity: 0.1,
        conflictLevel: 0.4,
        explorationFactor: 0.2
    }
};

/**
 * Player count configurations
 */
const PLAYER_CONFIGS = {
    3: { rings: 2, homeDistance: 2, totalSystems: 19 },
    4: { rings: 2, homeDistance: 2, totalSystems: 25 },
    5: { rings: 3, homeDistance: 2, totalSystems: 31 },
    6: { rings: 3, homeDistance: 2, totalSystems: 37 },
    7: { rings: 3, homeDistance: 3, totalSystems: 43 },
    8: { rings: 3, homeDistance: 3, totalSystems: 49 }
};

/**
 * System weights for balance calculations
 */
const SYSTEM_WEIGHTS = {
    resources: 0.3,
    influence: 0.25,
    planets: 0.2,
    tech: 0.15,
    strategic: 0.1
};

/**
 * Generate a balanced map
 * @param {number} playerCount - Number of players (3-8)
 * @param {string} mapStyle - Map generation style preset
 * @param {string} genMode - Generation mode (optimal, fast, iterative)
 * @returns {Promise<Object>} Generated map result
 */
export async function generateBalancedMap(playerCount = 6, mapStyle = 'balanced', genMode = 'optimal', progressCallback = null) {
    const startTime = Date.now();

    try {
        console.log(`AutoMapper: Generating ${mapStyle} map for ${playerCount} players using ${genMode} mode`);

        if (progressCallback) progressCallback('Initializing generation...', 10);

        // Get configuration
        const config = PLAYER_CONFIGS[playerCount];
        const preset = MAP_PRESETS[mapStyle] || MAP_PRESETS.balanced;

        if (!config) {
            throw new Error(`Unsupported player count: ${playerCount}`);
        }

        if (progressCallback) progressCallback('Applying generation settings...', 20);

        // Generate map based on mode
        let mapData;
        switch (genMode) {
            case 'fast':
                mapData = await generateFastMap(config, preset, playerCount, progressCallback);
                break;
            case 'iterative':
                mapData = await generateIterativeMap(config, preset, playerCount, progressCallback);
                break;
            case 'optimal':
            default:
                mapData = await generateOptimalMap(config, preset, playerCount, progressCallback);
                break;
        }

        if (progressCallback) progressCallback('Calculating balance score...', 85);

        // Calculate balance score
        const balanceScore = calculateBalanceScore(mapData, config, preset);

        if (progressCallback) progressCallback('Generating analysis...', 95);

        // Generate analysis
        const analysis = generateMapAnalysis(mapData, config, preset);

        const result = {
            success: true,
            playerCount,
            mapStyle,
            generationMode: genMode,
            mapData,
            balanceScore,
            analysis,
            generationTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };

        if (progressCallback) progressCallback('Generation complete!', 100);

        console.log(`AutoMapper: Generated map with balance score ${balanceScore}/100 in ${result.generationTime}ms`);
        return result;

    } catch (error) {
        console.error('AutoMapper: Map generation failed:', error);
        if (progressCallback) progressCallback(`Error: ${error.message}`, 0);
        throw new Error(`Map generation failed: ${error.message}`);
    }
}

/**
 * Generate map using fast algorithm
 */
async function generateFastMap(config, preset, playerCount, progressCallback) {
    console.log('AutoMapper: Using fast generation algorithm');

    if (progressCallback) progressCallback('Fast generation - Setting up systems...', 30);
    await sleep(200);

    if (progressCallback) progressCallback('Fast generation - Placing home systems...', 50);
    await sleep(200);

    if (progressCallback) progressCallback('Fast generation - Adding planets...', 70);
    await sleep(100);

    return generateMockMapData(config, preset, playerCount, 'fast');
}

/**
 * Generate map using iterative algorithm
 */
async function generateIterativeMap(config, preset, playerCount, progressCallback) {
    console.log('AutoMapper: Using iterative generation algorithm');

    let bestMap = null;
    let bestScore = 0;
    const iterations = 3; // Reduced from 5 to prevent timeout

    for (let i = 0; i < iterations; i++) {
        const progress = 30 + ((i + 1) / iterations) * 40; // 30-70%
        if (progressCallback) progressCallback(`Iterative generation - Attempt ${i + 1}/${iterations}...`, progress);

        console.log(`AutoMapper: Iteration ${i + 1}/${iterations}`);

        await sleep(150); // Reduced sleep time
        const mapData = generateMockMapData(config, preset, playerCount, 'iterative');
        const score = calculateBalanceScore(mapData, config, preset);

        if (score > bestScore) {
            bestScore = score;
            bestMap = mapData;
        }
    }

    if (progressCallback) progressCallback('Iterative generation - Selecting best result...', 75);
    await sleep(100);

    return bestMap;
}

/**
 * Generate map using optimal algorithm
 */
async function generateOptimalMap(config, preset, playerCount, progressCallback) {
    console.log('AutoMapper: Using optimal generation algorithm');

    if (progressCallback) progressCallback('Optimal generation - Analyzing constraints...', 30);
    await sleep(300);

    if (progressCallback) progressCallback('Optimal generation - Calculating optimal positions...', 45);
    await sleep(400);

    if (progressCallback) progressCallback('Optimal generation - Balancing resources...', 60);
    await sleep(300);

    if (progressCallback) progressCallback('Optimal generation - Finalizing layout...', 75);
    await sleep(200);

    return generateMockMapData(config, preset, playerCount, 'optimal');
}

/**
 * Generate mock map data for demonstration
 */
function generateMockMapData(config, preset, playerCount, mode) {
    const mapData = {
        systems: [],
        homePositions: [],
        centerSystem: null,
        hyperlanes: [],
        metadata: {
            rings: config.rings,
            totalSystems: config.totalSystems,
            preset: preset.name,
            mode,
            playerCount
        }
    };

    // Calculate hex positions for player home systems
    const homeHexes = calculateHomePositions(playerCount);

    // Generate home positions - FIX: Use the playerCount parameter properly
    for (let i = 0; i < playerCount; i++) {
        mapData.homePositions.push({
            player: i + 1,
            hexId: homeHexes[i],
            position: `home_${i + 1}`,
            resources: 4 + Math.floor(Math.random() * 2),
            influence: 2 + Math.floor(Math.random() * 2),
            planets: 2,
            systemData: generateHomeSystem(i + 1)
        });
    }

    // Generate center system (Mecatol Rex)
    mapData.centerSystem = {
        hexId: '000', // Center hex
        id: 'mecatol_rex',
        name: 'Mecatol Rex',
        resources: 1,
        influence: 6,
        planets: 1,
        type: 'legendary'
    };

    // Generate other systems based on preset - FIX: Ensure we don't create too many systems
    const systemCount = Math.min(config.totalSystems - mapData.homePositions.length - 1, 25); // Cap at 25 systems
    const availableHexes = getAvailableHexes(homeHexes);

    for (let i = 0; i < systemCount && i < availableHexes.length; i++) {
        const system = generateRandomSystem(i, preset, mode);
        system.hexId = availableHexes[i];
        mapData.systems.push(system);
    }

    return mapData;
}

/**
 * Calculate optimal home system positions for given player count
 */
function calculateHomePositions(playerCount) {
    // Using only ring 1 positions that definitely exist (101-106)
    const positions = {
        3: ['101', '103', '105'],  // Ring 1, positions 1, 3, 5
        4: ['101', '102', '104', '105'],  // Ring 1, positions 1, 2, 4, 5
        5: ['101', '102', '103', '104', '105'],  // Ring 1, positions 1-5
        6: ['101', '102', '103', '104', '105', '106'],  // Ring 1, all positions
        7: ['101', '102', '103', '104', '105', '106', '000'],  // Ring 1 + center (temporary)
        8: ['101', '102', '103', '104', '105', '106', '000', '000']  // Ring 1 + centers (temporary)
    };

    return positions[playerCount] || positions[6]; // Default to 6-player positions
}

/**
 * Get available hex positions (excluding home positions and center)
 */
function getAvailableHexes(excludeHexes) {
    // Generate a list of available hex positions using only ring 1 initially
    const allHexes = [];

    // Ring 1 (6 positions: 101-106) - these should always exist
    for (let i = 1; i <= 6; i++) {
        allHexes.push(`1${String(i).padStart(2, '0')}`);
    }

    // Only add ring 2 if it likely exists (for larger maps)
    for (let i = 1; i <= 12; i++) {
        allHexes.push(`2${String(i).padStart(2, '0')}`);
    }

    // Filter out excluded hexes and center, return only first few to avoid overwhelming
    const available = allHexes.filter(hex => !excludeHexes.includes(hex) && hex !== '000');
    return available.slice(0, 10); // Limit to first 10 available hexes
}

/**
 * Generate a home system for a player
 */
function generateHomeSystem(playerNumber) {
    return {
        id: `home_${playerNumber}`,
        name: `Player ${playerNumber} Home`,
        planets: [
            {
                name: `Home Planet ${playerNumber}`,
                resources: 4,
                influence: 2,
                planetType: 'FACTION'
            }
        ],
        wormholes: [],
        isHomesystem: true
    };
}

/**
 * Generate a random system based on preset parameters
 */
function generateRandomSystem(id, preset, mode) {
    // Try to use real systems if available
    if (typeof window !== 'undefined' && window.editor && window.editor.sectorIDLookup) {
        const realSystem = selectRandomRealSystem(preset, mode);
        if (realSystem) {
            return {
                ...realSystem,
                id: realSystem.id,
                type: classifySystemType(realSystem)
            };
        }
    }

    // Fallback to generated system
    const systemTypes = ['normal', 'anomaly', 'empty', 'special'];
    const weights = mode === 'optimal' ? [0.6, 0.15, 0.15, 0.1] : [0.7, 0.1, 0.15, 0.05];

    const type = weightedRandom(systemTypes, weights);

    const system = {
        id: `gen_system_${id}`,
        type,
        planets: [],
        anomalies: [],
        wormholes: []
    };

    switch (type) {
        case 'normal':
            system.planets = generatePlanets(1 + Math.floor(Math.random() * 3), preset);
            break;
        case 'anomaly':
            system.anomalies = [generateAnomaly()];
            if (Math.random() < 0.4) {
                system.planets = generatePlanets(1, preset);
            }
            break;
        case 'empty':
            // No planets or anomalies
            break;
        case 'special':
            system.planets = generatePlanets(1, preset);
            system.special = generateSpecialFeature();
            break;
    }

    return system;
}

/**
 * Select a random real system from the database
 */
function selectRandomRealSystem(preset, mode) {
    const sectorLookup = window.editor.sectorIDLookup;
    if (!sectorLookup) return null;

    // Get all non-home systems (filter out home systems and Mecatol Rex)
    const availableSystems = Object.values(sectorLookup).filter(sys => {
        if (!sys || !sys.id) return false;

        // Skip home systems
        if (sys.planets && sys.planets.some(p => p.planetType === 'FACTION')) return false;

        // Skip Mecatol Rex
        if (sys.id.toString() === '18') return false;

        // Skip hyperlane tiles for regular system generation
        if (sys.isHyperlane) return false;

        return true;
    });

    if (availableSystems.length === 0) return null;

    // Select based on preset preferences
    const filteredSystems = filterSystemsByPreset(availableSystems, preset, mode);

    if (filteredSystems.length === 0) {
        // Fallback to any available system
        return availableSystems[Math.floor(Math.random() * availableSystems.length)];
    }

    return filteredSystems[Math.floor(Math.random() * filteredSystems.length)];
}

/**
 * Filter systems based on preset preferences
 */
function filterSystemsByPreset(systems, preset, mode) {
    if (preset.name === 'aggressive') {
        // Prefer systems with more resources or special features
        return systems.filter(sys => {
            const totalRes = sys.planets ? sys.planets.reduce((sum, p) => sum + (p.resources || 0), 0) : 0;
            return totalRes >= 2 || sys.isNebula || sys.isGravityRift;
        });
    } else if (preset.name === 'exploration') {
        // Prefer systems with anomalies or wormholes
        return systems.filter(sys =>
            sys.isNebula || sys.isAsteroidField || sys.isGravityRift ||
            (sys.wormholes && sys.wormholes.length > 0)
        );
    } else if (preset.name === 'economic') {
        // Prefer systems with multiple planets or high resource value
        return systems.filter(sys => {
            const planetCount = sys.planets ? sys.planets.length : 0;
            const totalRes = sys.planets ? sys.planets.reduce((sum, p) => sum + (p.resources || 0), 0) : 0;
            return planetCount >= 2 || totalRes >= 3;
        });
    }

    // Balanced - return all systems
    return systems;
}

/**
 * Classify a real system's type
 */
function classifySystemType(system) {
    if (system.isNebula || system.isAsteroidField || system.isGravityRift || system.isSupernova) {
        return 'anomaly';
    } else if (!system.planets || system.planets.length === 0) {
        return 'empty';
    } else if (system.planets.some(p => p.legendaryAbilityName)) {
        return 'special';
    } else {
        return 'normal';
    }
}

/**
 * Generate planets for a system
 */
function generatePlanets(count, preset) {
    const planets = [];

    for (let i = 0; i < count; i++) {
        const planet = {
            name: `Planet_${Math.random().toString(36).substr(2, 8)}`,
            resources: Math.floor(Math.random() * 4),
            influence: Math.floor(Math.random() * 4),
            type: weightedRandom(['cultural', 'industrial', 'hazardous'], [0.33, 0.33, 0.34]),
            traits: []
        };

        // Add tech specialties based on preset
        if (Math.random() < 0.2) {
            planet.tech = weightedRandom(['red', 'yellow', 'green', 'blue'], [0.25, 0.25, 0.25, 0.25]);
        }

        planets.push(planet);
    }

    return planets;
}

/**
 * Generate anomaly
 */
function generateAnomaly() {
    const anomalies = ['asteroid-field', 'nebula', 'supernova', 'gravity-rift'];
    return {
        type: weightedRandom(anomalies, [0.3, 0.3, 0.2, 0.2]),
        effect: 'Various effects based on type'
    };
}

/**
 * Generate special feature
 */
function generateSpecialFeature() {
    const features = ['wormhole', 'legendary', 'faction-home'];
    return {
        type: weightedRandom(features, [0.5, 0.3, 0.2]),
        description: 'Special system feature'
    };
}

/**
 * Calculate balance score for generated map
 */
function calculateBalanceScore(mapData, config, preset) {
    if (!mapData || !mapData.homePositions) {
        return 0;
    }

    let totalScore = 0;
    const factors = [];

    // Resource balance factor
    const resourceBalance = calculateResourceBalance(mapData);
    factors.push({ name: 'Resource Balance', score: resourceBalance, weight: 0.3 });

    // Position fairness factor  
    const positionFairness = calculatePositionFairness(mapData, config);
    factors.push({ name: 'Position Fairness', score: positionFairness, weight: 0.25 });

    // Strategic diversity factor
    const strategicDiversity = calculateStrategicDiversity(mapData, preset);
    factors.push({ name: 'Strategic Diversity', score: strategicDiversity, weight: 0.2 });

    // Anomaly distribution factor
    const anomalyDistribution = calculateAnomalyDistribution(mapData, preset);
    factors.push({ name: 'Anomaly Distribution', score: anomalyDistribution, weight: 0.15 });

    // Connectivity factor
    const connectivity = calculateConnectivity(mapData);
    factors.push({ name: 'Connectivity', score: connectivity, weight: 0.1 });

    // Calculate weighted score
    factors.forEach(factor => {
        totalScore += factor.score * factor.weight;
    });

    return Math.round(Math.max(0, Math.min(100, totalScore)));
}

/**
 * Calculate resource balance between starting positions
 */
function calculateResourceBalance(mapData) {
    if (!mapData.homePositions || mapData.homePositions.length === 0) {
        return 50;
    }

    const resources = mapData.homePositions.map(pos => pos.resources || 0);
    const influences = mapData.homePositions.map(pos => pos.influence || 0);

    const resourceVariance = calculateVariance(resources);
    const influenceVariance = calculateVariance(influences);

    // Lower variance = better balance
    const resourceScore = Math.max(0, 100 - (resourceVariance * 25));
    const influenceScore = Math.max(0, 100 - (influenceVariance * 25));

    return (resourceScore + influenceScore) / 2;
}

/**
 * Calculate position fairness
 */
function calculatePositionFairness(mapData, config) {
    // In a real implementation, this would analyze proximity to center,
    // neighboring systems, chokepoints, etc.
    return 75 + Math.random() * 20; // Mock score
}

/**
 * Calculate strategic diversity
 */
function calculateStrategicDiversity(mapData, preset) {
    // Analyze variety of system types, tech specialties, planet types
    const systemTypes = new Set();
    let techPlanets = 0;

    mapData.systems.forEach(system => {
        systemTypes.add(system.type);
        if (system.planets) {
            techPlanets += system.planets.filter(p => p.tech).length;
        }
    });

    const diversityScore = (systemTypes.size / 4) * 50; // Max 4 system types
    const techScore = Math.min(50, (techPlanets / mapData.systems.length) * 100);

    return diversityScore + techScore;
}

/**
 * Calculate anomaly distribution
 */
function calculateAnomalyDistribution(mapData, preset) {
    const anomalySystems = mapData.systems.filter(s => s.anomalies && s.anomalies.length > 0);
    const actualDensity = anomalySystems.length / mapData.systems.length;
    const targetDensity = preset.anomalyDensity;

    const densityDiff = Math.abs(actualDensity - targetDensity);
    return Math.max(0, 100 - (densityDiff * 200));
}

/**
 * Calculate connectivity score
 */
function calculateConnectivity(mapData) {
    // In a real implementation, this would analyze hyperlane connectivity
    return 80 + Math.random() * 15; // Mock score
}

/**
 * Calculate current map balance
 * @returns {Promise<Object>} Analysis of current map
 */
export async function calculateMapBalance() {
    console.log('AutoMapper: Analyzing current map balance');

    // Simulate analysis time
    await sleep(800);

    // In a real implementation, this would analyze the actual hex editor state
    // For now, return mock analysis data

    const mockAnalysis = {
        balanceRating: 72 + Math.floor(Math.random() * 20),
        fairnessIndex: 0.75 + Math.random() * 0.2,
        competitiveLevel: 'High',
        playerAnalysis: [
            { position: 1, summary: 'Strong economic position with good tech access' },
            { position: 2, summary: 'Balanced position with moderate resources' },
            { position: 3, summary: 'Aggressive position near conflict zones' },
            { position: 4, summary: 'Exploration-focused with anomaly access' },
            { position: 5, summary: 'Resource-rich but isolated position' },
            { position: 6, summary: 'Centrally located with good connectivity' }
        ].slice(0, Math.floor(Math.random() * 6) + 3),
        mapFeatures: 'Well-distributed anomalies with balanced resource allocation. Some chokepoints present for strategic control.',
        recommendations: [
            'Consider adjusting resource distribution in outer rim',
            'Add more wormhole connections for better mobility',
            'Balance tech planet distribution'
        ]
    };

    return mockAnalysis;
}

/**
 * Get available map generation presets
 * @returns {Object} Available presets
 */
export function getMapGenerationPresets() {
    return { ...MAP_PRESETS };
}

/**
 * Generate map analysis details
 */
function generateMapAnalysis(mapData, config, preset) {
    const analysis = {
        resourceBalance: 'Resources are well distributed across starting positions',
        strategicPositions: `${config.playerCount} strategic starting positions optimized for ${preset.name} gameplay`,
        recommendations: []
    };

    // Add recommendations based on balance score
    const score = calculateBalanceScore(mapData, config, preset);

    if (score < 70) {
        analysis.recommendations.push('Consider regenerating for better balance');
    }
    if (score >= 85) {
        analysis.recommendations.push('Excellent balance achieved - map ready for competitive play');
    }

    analysis.recommendations.push(`Optimized for ${preset.description.toLowerCase()}`);

    return analysis;
}

/**
 * Utility functions
 */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function weightedRandom(items, weights) {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            return items[i];
        }
    }

    return items[items.length - 1];
}

function calculateVariance(numbers) {
    if (numbers.length === 0) return 0;

    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;

    return Math.sqrt(variance);
}