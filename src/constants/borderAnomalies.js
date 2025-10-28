// Border anomalies configuration
let borderAnomalyTypes = null;

/**
 * Load border anomaly types from JSON file
 */
export async function loadBorderAnomalyTypes() {
    if (borderAnomalyTypes) return borderAnomalyTypes;

    try {
        // Use path relative to the HTML file location
        const basePath = window.location.pathname.endsWith('/') 
            ? window.location.pathname 
            : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        const jsonPath = `${basePath}public/data/border.json`;
        
        console.log('Loading border anomaly types from:', jsonPath);
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Loaded border anomaly data:', data);

        // Import settings dynamically to ensure they're loaded (with cache bust)
        const settingsModule = await import(`../config/toggleSettings.js?v=${Date.now()}`);
        const { borderAnomalySettings, configVersion } = settingsModule;
        console.log('Loaded config version:', configVersion);
        console.log('Imported border anomaly settings module:', settingsModule);
        console.log('Imported border anomaly settings:', borderAnomalySettings);

        // Debug: check specific values that should be false
        console.log('ARROW should be false:', borderAnomalySettings.ARROW);
        console.log('VOIDTETHER should be false:', borderAnomalySettings.VOIDTETHER);
        console.log('COREBORDER should be false:', borderAnomalySettings.COREBORDER);
        console.log('RIMBORDER should be false:', borderAnomalySettings.RIMBORDER);

        borderAnomalyTypes = data.reduce((acc, anomaly) => {
            // Get enabled state from settings, default to true if undefined
            const enabledSetting = borderAnomalySettings[anomaly.id];
            const isEnabled = enabledSetting === undefined ? true : enabledSetting;

            console.log(`Border anomaly ${anomaly.id}: setting=${enabledSetting}, enabled=${isEnabled}`);

            acc[anomaly.id] = {
                id: anomaly.id,
                name: anomaly.name,
                alias: anomaly.alias,
                image: anomaly.image,
                enabled: isEnabled,
                drawStyle: getDefaultDrawStyle(anomaly.id),
                bidirectional: getBidirectionalDefault(anomaly.id)
            };
            return acc;
        }, {});

        // Apply any saved user settings
        borderAnomalyTypes = await applySavedSettings(borderAnomalyTypes);

        console.log('Processed border anomaly types:', Object.keys(borderAnomalyTypes));
        return borderAnomalyTypes;
    } catch (error) {
        console.error('Failed to load border anomaly types:', error);
        console.log('Using fallback border anomaly types');
        // Fallback to hardcoded types
        borderAnomalyTypes = getDefaultBorderAnomalyTypes();
        // Apply any saved user settings even to fallback types
        borderAnomalyTypes = await applySavedSettings(borderAnomalyTypes);
        return borderAnomalyTypes;
    }
}

/**
 * Get all available border anomaly types
 */
export function getBorderAnomalyTypes() {
    return borderAnomalyTypes || getDefaultBorderAnomalyTypes();
}

/**
 * Get enabled border anomaly types only
 */
export function getEnabledBorderAnomalyTypes() {
    const types = getBorderAnomalyTypes();
    console.log('getEnabledBorderAnomalyTypes - all types:', Object.keys(types));

    const filtered = Object.fromEntries(
        Object.entries(types).filter(([id, type]) => {
            console.log(`Filtering ${id}: enabled=${type.enabled}`);
            return type.enabled;
        })
    );

    console.log('getEnabledBorderAnomalyTypes - filtered types:', Object.keys(filtered));
    return filtered;
}



/**
 * Predefined color palette for auto-generating styles
 */
const styleColorPalette = [
    '#e32b2b', '#19c67f', '#8b4513', '#9370db', '#ff4500', '#ffd700',
    '#4b0082', '#000000', '#696969', '#ffff00', '#ff6347', '#32cd32',
    '#1e90ff', '#ff1493', '#ffa500', '#8a2be2', '#dc143c', '#00ced1',
    '#ff69b4', '#228b22', '#d2691e', '#4169e1', '#ff8c00', '#9932cc'
];

const stylePatterns = ['solid', 'dashed', 'dotted'];
const styleWidths = [2, 3, 4, 5];

/**
 * Get default draw style for anomaly type
 */
function getDefaultDrawStyle(id) {
    const predefinedStyles = {
        'SPATIALTEAR': { color: '#e32b2b', width: 3, pattern: 'solid' },
        'GRAVITYWAVE': { color: '#19c67f', width: 4, pattern: 'solid' },
        'ASTEROID': { color: '#8b4513', width: 3, pattern: 'dashed' },
        'NEBULA': { color: '#9370db', width: 4, pattern: 'solid' },
        'MINEFIELD': { color: '#ff4500', width: 2, pattern: 'dotted' },
        'ARROW': { color: '#ffd700', width: 2, pattern: 'solid' },
        'VOIDTETHER': { color: '#4b0082', width: 3, pattern: 'solid' },
        'COREBORDER': { color: '#000000', width: 5, pattern: 'solid' },
        'RIMBORDER': { color: '#696969', width: 4, pattern: 'solid' },
        'YELLOW': { color: '#ffff00', width: 3, pattern: 'solid' },
        'REDORANGE': { color: '#ff4500', width: 3, pattern: 'solid' }
    };

    // Return predefined style if available
    if (predefinedStyles[id]) {
        return predefinedStyles[id];
    }

    // Auto-generate style for new types based on ID hash
    return generateStyleFromId(id);
}

/**
 * Generate a consistent style for a border anomaly ID
 */
function generateStyleFromId(id) {
    // Create a simple hash from the ID to ensure consistency
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        const char = id.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Use absolute value to avoid negative indices
    hash = Math.abs(hash);

    // Pick style elements based on hash
    const color = styleColorPalette[hash % styleColorPalette.length];
    const width = styleWidths[(hash >> 4) % styleWidths.length];
    const pattern = stylePatterns[(hash >> 8) % stylePatterns.length];

    console.log(`Auto-generated style for ${id}:`, { color, width, pattern });

    return { color, width, pattern };
}

/**
 * Get bidirectional default for anomaly type
 */
function getBidirectionalDefault(id) {
    // Gravity Wave is the only unidirectional type by default
    if (id === 'GRAVITYWAVE') {
        return false;
    }

    // All other types are bidirectional by default
    return true;
}

/**
 * Fallback border anomaly types if loading fails
 */
function getDefaultBorderAnomalyTypes() {
    return {
        'SPATIALTEAR': {
            id: 'SPATIALTEAR',
            name: 'Spatial Tear',
            alias: ['spatial tear', 'spatialtear', 'spatial', 'tear'],
            image: 'spatial_tear_border.png',
            enabled: true, // Will be updated by applySavedSettings
            drawStyle: { color: '#e32b2b', width: 3, pattern: 'solid' },
            bidirectional: true
        },
        'GRAVITYWAVE': {
            id: 'GRAVITYWAVE',
            name: 'Gravity Wave',
            alias: ['gravity wave', 'gravitywave', 'gravity', 'wave'],
            image: 'gravity_wave_border.png',
            enabled: true, // Will be updated by applySavedSettings
            drawStyle: { color: '#19c67f', width: 4, pattern: 'solid' },
            bidirectional: false
        }
    };
}

/**
 * Find border anomaly type by name or alias
 */
export function findBorderAnomalyType(searchTerm) {
    const types = getBorderAnomalyTypes();
    const term = searchTerm.toLowerCase();

    // Direct ID match
    if (types[term.toUpperCase()]) {
        return types[term.toUpperCase()];
    }

    // Name or alias match
    for (const type of Object.values(types)) {
        if (type.name.toLowerCase() === term) {
            return type;
        }
        if (type.alias.some(alias => alias.toLowerCase() === term)) {
            return type;
        }
    }

    return null;
}

/**
 * Update the draw style for a border anomaly type
 */
export function updateBorderAnomalyStyle(id, newStyle) {
    if (borderAnomalyTypes && borderAnomalyTypes[id]) {
        borderAnomalyTypes[id].drawStyle = { ...borderAnomalyTypes[id].drawStyle, ...newStyle };
        saveBorderAnomalySettings();
        console.log(`Updated style for ${id}:`, borderAnomalyTypes[id].drawStyle);
    }
}

/**
 * Update the bidirectional setting for a border anomaly type
 */
export function updateBorderAnomalyBidirectional(id, bidirectional) {
    if (borderAnomalyTypes && borderAnomalyTypes[id]) {
        borderAnomalyTypes[id].bidirectional = bidirectional;
        saveBorderAnomalySettings();
        console.log(`Updated ${id} bidirectional setting to:`, bidirectional);
    }
}

/**
 * Save border anomaly settings to localStorage
 */
function saveBorderAnomalySettings() {
    if (!borderAnomalyTypes) return;

    const settings = {};
    Object.entries(borderAnomalyTypes).forEach(([id, type]) => {
        settings[id] = {
            drawStyle: type.drawStyle,
            bidirectional: type.bidirectional
        };
    });

    try {
        localStorage.setItem('borderAnomalySettings', JSON.stringify(settings));
    } catch (error) {
        console.warn('Failed to save border anomaly settings:', error);
    }
}

/**
 * Load border anomaly settings from localStorage
 */
function loadBorderAnomalySettings() {
    try {
        const settings = localStorage.getItem('borderAnomalySettings');
        return settings ? JSON.parse(settings) : {};
    } catch (error) {
        console.warn('Failed to load border anomaly settings:', error);
        return {};
    }
}

/**
 * Apply saved settings to loaded border anomaly types
 */
async function applySavedSettings(types) {
    // Import toggle settings (with cache bust)
    const { borderAnomalySettings } = await import(`../config/toggleSettings.js?v=${Date.now()}`);
    console.log('applySavedSettings - imported toggle settings:', borderAnomalySettings);

    const savedSettings = loadBorderAnomalySettings();

    Object.entries(types).forEach(([id, type]) => {
        // Apply toggle settings for enabled state
        const toggleEnabled = borderAnomalySettings[id];
        type.enabled = toggleEnabled === undefined ? true : toggleEnabled;
        console.log(`applySavedSettings - ${id}: toggle=${toggleEnabled}, enabled=${type.enabled}`);

        // Apply saved user customizations
        const saved = savedSettings[id];
        if (saved) {
            if (saved.drawStyle) type.drawStyle = { ...type.drawStyle, ...saved.drawStyle };
            if (saved.bidirectional !== undefined) type.bidirectional = saved.bidirectional;
        }
    });

    return types;
}

/**
 * Clear the cached border anomaly types (for reset functionality)
 */
export function clearCache() {
    borderAnomalyTypes = null;
}