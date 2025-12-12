// also double check realIDsOverlay
export const overlayDefaults = {
    showPlanetTypes: true,
    showResInf: false,
    showIdealRI: true,
    showRealID: true,
    showLore: false,
    showTokens: false
};

// Border anomaly type enablement settings
// Set to false to disable specific border anomaly types
// To add new types: 1) Add to /public/data/border.json, 2) Add entry here (optional, defaults to true)
// All types are bidirectional by default except GRAVITYWAVE
// Version: 1.1 - Updated with false values for testing
export const borderAnomalySettings = {
    'ASTEROID': true,
    'GRAVITYWAVE': true,
    'NEBULA': true,
    'MINEFIELD': true,
    'ARROW': false,
    'SPATIALTEAR': true,
    'VOIDTETHER': false,
    'COREBORDER': false,
    'RIMBORDER': false,
    'YELLOW': true,
    'REDORANGE': true,
    // New types will default to true if not specified here
    // Example for disabling a type: 'TYPENAME': false,
};

// Version for debugging cache issues
export const configVersion = "1.1-with-false-values";