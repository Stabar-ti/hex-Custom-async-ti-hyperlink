// src/modules/Milty/miltyBuilderCore.js
// Core logic and data management for Milty Slice Designer

import { removeWormholeOverlay } from '../../features/wormholes.js';

// Default slice and slot position definitions
export const defaultSlices = {
    A: [530, 401, 424, 529, 301, 318],
    B: [403, 303, 302, 402, 202, 201],
    C: [204, 103, 102, 203, '000', 101],
    D: [208, 209, 105, 104, 210, 106],
    E: [419, 420, 315, 314, 316, 211],
    F: [527, 528, 422, 421, 423, 317]
};

export const slotPositions = {
    1: [836, 941, 837, 732, 942, 838],
    2: [624, 625, 521, 520, 626, 522],
    3: [724, 725, 621, 620, 622, 518],
    4: [617, 515, 514, 616, 412, 411],
    5: [510, 408, 509, 611, 407, 508],
    6: [813, 711, 812, 914, 710, 811],
    7: [936, 937, 833, 832, 938, 834],
    8: [1036, 1037, 933, 932, 934, 830],
    9: [1032, 1033, 929, 928, 930, 826],
    10: [1028, 926, 925, 1027, 823, 822],
    11: [1025, 923, 922, 1024, 820, 819],
    12: [817, 715, 816, 918, 714, 815]
};

// Move slice between any positions (A-F, 1-12, intermixed)
export function moveSlice(sourceId, sourceType, targetId, targetType, updateStatusMsg) {
    // Get source hex positions first
    let sourceHexes = [];
    if (sourceType === 'map') {
        const sliceKeys = ['A', 'B', 'C', 'D', 'E', 'F'];
        const sliceIndex = sliceKeys.indexOf(sourceId);
        if (sliceIndex >= 0) {
            sourceHexes = Object.values(defaultSlices)[sliceIndex] || [];
        }
    } else if (sourceType === 'slot') {
        sourceHexes = slotPositions[sourceId] || [];
    }

    if (!sourceHexes.length) {
        updateStatusMsg(`Invalid source ${sourceType} ${sourceId}.`);
        return false;
    }

    // Build sourceData from actual current hex states (not stored arrays)
    let sourceData = [];
    for (let i = 0; i < sourceHexes.length; i++) {
        const hexId = sourceHexes[i];
        if (hexId && window.editor?.hexes?.[hexId]) {
            const hex = window.editor.hexes[hexId];
            sourceData.push({
                hexId: hexId,
                realId: hex.realId,
                baseType: hex.baseType,
                planets: Array.isArray(hex.planets) ? JSON.parse(JSON.stringify(hex.planets)) : [],
                inherentWormholes: hex.inherentWormholes ? new Set(Array.from(hex.inherentWormholes)) : new Set(),
                customWormholes: hex.customWormholes ? new Set(Array.from(hex.customWormholes)) : new Set(),
                wormholes: hex.wormholes ? new Set(Array.from(hex.wormholes)) : new Set(),
                effects: Array.isArray(hex.effects) ? [...hex.effects] : Array.from(hex.effects || []),
                isHyperlane: hex.isHyperlane,
                isNebula: hex.isNebula,
                isGravityRift: hex.isGravityRift,
                isSupernova: hex.isSupernova,
                isAsteroidField: hex.isAsteroidField
            });
        } else {
            sourceData.push(null);
        }
    }

    // Get target hex positions
    let targetHexes = [];
    if (targetType === 'map') {
        const sliceKeys = ['A', 'B', 'C', 'D', 'E', 'F'];
        const sliceIndex = sliceKeys.indexOf(targetId);
        if (sliceIndex >= 0) {
            targetHexes = Object.values(defaultSlices)[sliceIndex] || [];
        }
    } else if (targetType === 'slot') {
        targetHexes = slotPositions[targetId] || [];
    }

    if (!targetHexes.length) {
        updateStatusMsg(`Invalid target ${targetType} ${targetId}.`);
        return false;
    }

    // Apply slice data to target positions
    const minLen = Math.min(sourceData.length, targetHexes.length);
    for (let j = 1; j < minLen; ++j) {
        const srcData = sourceData[j];
        const tgtHexId = targetHexes[j];
        if (srcData && tgtHexId && (srcData.realId || srcData.baseType || srcData.isHyperlane || srcData.isNebula || srcData.isGravityRift || srcData.isSupernova || srcData.isAsteroidField)) {
            const tgtHex = window.editor?.hexes?.[tgtHexId];
            if (tgtHex) {
                applyHexData(srcData, tgtHex, tgtHexId);
            }
        }
    }

    // Clear source hexes (only positions 1-5, not homesystem at 0)
    for (let j = 1; j < sourceData.length; ++j) {
        const srcData = sourceData[j];
        if (srcData && srcData.hexId && window.editor) {
            clearHex(srcData.hexId);
        }
    }

    // Update UI components
    updateVisualElements();

    updateStatusMsg(`Moved slice from ${sourceType} ${sourceId} to ${targetType} ${targetId}. Selection cleared.`);
    return true;
}

// Apply hex data to target hex
function applyHexData(srcData, tgtHex, tgtHexId) {
    if (srcData.realId) {
        // For systems with realId, follow importFullState pattern
        tgtHex.realId = srcData.realId;

        // Mark as used
        import('../../ui/uiFilters.js').then(({ markRealIDUsed }) => {
            markRealIDUsed(srcData.realId);
        }).catch(err => {
            console.warn('Could not mark realId as used:', err);
        });

        tgtHex.planets = Array.isArray(srcData.planets) ? JSON.parse(JSON.stringify(srcData.planets)) : [];

        // Handle wormholes properly
        const realIdKey = srcData.realId.toString().toUpperCase();
        const info = window.editor?.sectorIDLookup?.[realIdKey] || {};

        tgtHex.inherentWormholes = new Set((info.wormholes || []).filter(Boolean).map(w => w.toLowerCase()));
        tgtHex.customWormholes = new Set(Array.from(srcData.customWormholes || []).filter(Boolean).map(w => w.toLowerCase()));
        tgtHex.wormholes = new Set([...tgtHex.inherentWormholes, ...tgtHex.customWormholes]);

        tgtHex.isHyperlane = srcData.isHyperlane;
        tgtHex.isNebula = srcData.isNebula;
        tgtHex.isGravityRift = srcData.isGravityRift;
        tgtHex.isSupernova = srcData.isSupernova;
        tgtHex.isAsteroidField = srcData.isAsteroidField;

        // Apply effects
        if (srcData.effects && srcData.effects.length > 0) {
            srcData.effects.forEach(eff => {
                if (eff && typeof window.editor.applyEffect === 'function') {
                    window.editor.applyEffect(tgtHexId, eff);
                }
            });
        }

        // Set sector type
        setSectorType(srcData, tgtHexId);

        // Apply effects from SystemInfo
        if (info.isNebula) window.editor.applyEffect(tgtHexId, 'nebula');
        if (info.isGravityRift) window.editor.applyEffect(tgtHexId, 'rift');
        if (info.isSupernova) window.editor.applyEffect(tgtHexId, 'supernova');
        if (info.isAsteroidField) window.editor.applyEffect(tgtHexId, 'asteroid');

        // Create wormhole overlays
        createWormholeOverlays(tgtHex);

    } else if (srcData.baseType || srcData.isHyperlane || srcData.isNebula || srcData.isGravityRift || srcData.isSupernova || srcData.isAsteroidField) {
        // For special hexes without realId
        tgtHex.baseType = srcData.baseType;
        tgtHex.planets = Array.isArray(srcData.planets) ? JSON.parse(JSON.stringify(srcData.planets)) : [];

        tgtHex.inherentWormholes = new Set();
        tgtHex.customWormholes = new Set(Array.from(srcData.customWormholes || []).filter(Boolean).map(w => w.toLowerCase()));
        tgtHex.wormholes = new Set([...tgtHex.inherentWormholes, ...tgtHex.customWormholes]);

        tgtHex.isHyperlane = srcData.isHyperlane;
        tgtHex.isNebula = srcData.isNebula;
        tgtHex.isGravityRift = srcData.isGravityRift;
        tgtHex.isSupernova = srcData.isSupernova;
        tgtHex.isAsteroidField = srcData.isAsteroidField;

        // Apply effects
        if (srcData.effects && srcData.effects.length > 0) {
            srcData.effects.forEach(eff => {
                if (eff && typeof window.editor.applyEffect === 'function') {
                    window.editor.applyEffect(tgtHexId, eff);
                }
            });
        }

        // Update visual appearance
        if (srcData.baseType && typeof window.editor.setSectorType === 'function') {
            window.editor.setSectorType(tgtHexId, srcData.baseType, { skipSave: true });
        }

        // Create wormhole overlays
        if (tgtHex.wormholes && tgtHex.wormholes.size > 0) {
            createWormholeOverlays(tgtHex);
        }
    }

    // Move custom wormholes
    if (srcData.customWormholes && srcData.customWormholes.size > 0) {
        if (!srcData.realId) {
            srcData.customWormholes.forEach(wh => {
                if (!tgtHex.customWormholes) tgtHex.customWormholes = new Set();
                tgtHex.customWormholes.add(wh);
            });
            if (!tgtHex.inherentWormholes) tgtHex.inherentWormholes = new Set();
            tgtHex.wormholes = new Set([...tgtHex.inherentWormholes, ...tgtHex.customWormholes]);
        }
        // Update visual wormholes
        import('../../features/wormholes.js').then(({ updateHexWormholes }) => {
            updateHexWormholes(tgtHex);
        }).catch(err => {
            console.warn('Could not update hex wormholes:', err);
        });
    }
}

// Set sector type based on source data
function setSectorType(srcData, tgtHexId) {
    if (srcData.baseType === "void") {
        window.editor.setSectorType(tgtHexId, 'void', { skipSave: true });
    } else if (srcData.baseType === "homesystem" || (srcData.planets && srcData.planets.some(p => p.planetType === 'FACTION'))) {
        window.editor.setSectorType(tgtHexId, 'homesystem', { skipSave: true });
    } else if (srcData.baseType === "special" || (!srcData.planets?.length && (srcData.isAsteroidField || srcData.isSupernova || srcData.isNebula || srcData.isGravityRift))) {
        window.editor.setSectorType(tgtHexId, 'special', { skipSave: true });
    } else if (srcData.baseType === "legendary planet" || (srcData.planets && srcData.planets.some(p => p.legendaryAbilityName?.trim()))) {
        window.editor.setSectorType(tgtHexId, 'legendary planet', { skipSave: true });
    } else {
        const planetCount = (srcData.planets || []).length;
        if (planetCount >= 3 || srcData.baseType === "3 planet") {
            window.editor.setSectorType(tgtHexId, '3 planet', { skipSave: true });
        } else if (planetCount >= 2 || srcData.baseType === "2 planet") {
            window.editor.setSectorType(tgtHexId, '2 planet', { skipSave: true });
        } else if (planetCount >= 1 || srcData.baseType === "1 planet") {
            window.editor.setSectorType(tgtHexId, '1 planet', { skipSave: true });
        } else {
            window.editor.setSectorType(tgtHexId, 'empty', { skipSave: true });
        }
    }
}

// Create wormhole overlays for a hex
function createWormholeOverlays(tgtHex) {
    tgtHex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
    tgtHex.wormholeOverlays = [];
    Array.from(tgtHex.wormholes).forEach((w, i) => {
        const positions = window.editor.effectIconPositions;
        const len = positions.length;
        const reversedIndex = len - 1 - (i % len);
        const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
        import('../../features/baseOverlays.js').then(({ createWormholeOverlay }) => {
            const overlay = createWormholeOverlay(tgtHex.center.x + pos.dx, tgtHex.center.y + pos.dy, w.toLowerCase());
            if (overlay) {
                const wormholeIconLayer = window.editor.svg.querySelector('#wormholeIconLayer');
                if (wormholeIconLayer) {
                    wormholeIconLayer.appendChild(overlay);
                } else {
                    window.editor.svg.appendChild(overlay);
                }
                tgtHex.wormholeOverlays.push(overlay);
            }
        }).catch(err => {
            console.warn('Could not create wormhole overlay:', err);
        });
    });
}

// Clear a hex of all content
function clearHex(hexId) {
    removeWormholeOverlay(window.editor, hexId);
    const srcHex = window.editor.hexes?.[hexId];
    if (srcHex && srcHex.customWormholes) {
        srcHex.customWormholes = new Set();
        import('../../features/wormholes.js').then(({ updateHexWormholes }) => {
            updateHexWormholes(srcHex);
        }).catch(err => {
            console.warn('Could not update hex wormholes:', err);
        });
    }

    if (typeof window.editor.clearAll === 'function') {
        window.editor.clearAll(hexId);
    }
}

// Update visual elements after slice operations
function updateVisualElements() {
    if (typeof window.editor?.redrawAllRealIDOverlays === 'function') window.editor.redrawAllRealIDOverlays(window.editor);
    if (typeof window.renderSystemList === 'function') window.renderSystemList();

    // Update visual overlays for effects and wormholes
    import('../../features/baseOverlays.js').then(({ updateWormholeVisibility }) => {
        updateWormholeVisibility(window.editor);
    }).catch(err => {
        console.warn('Could not update wormhole visibility:', err);
    });

    // Update tile image layer for visual consistency
    import('../../features/imageSystemsOverlay.js').then(({ updateTileImageLayer }) => {
        updateTileImageLayer(window.editor);
    }).catch(err => {
        console.warn('Could not update tile image layer:', err);
    });

    // Update border anomalies overlay if active
    if (typeof window.editor?.redrawBorderAnomaliesOverlay === 'function') {
        window.editor.redrawBorderAnomaliesOverlay();
    }

    // Import and call the refreshSystemList function to update filter states
    import('../../ui/uiFilters.js').then(({ refreshSystemList }) => {
        refreshSystemList();
    }).catch(err => {
        console.warn('Could not refresh system list filters:', err);
    });
}

// Analyze slice occupancy and return color scheme
export function analyzeSliceOccupancy(sliceHexes, sliceName) {
    // Analyze slice contents (skip position 0 - homesystem)
    let totalSlots = sliceHexes.length - 1; // 5 slots (positions 1-5)
    let filledWithRealId = 0;
    let filledWithOther = 0;

    for (let i = 1; i < sliceHexes.length; i++) {
        const hexId = sliceHexes[i];
        const hex = window.editor?.hexes?.[hexId];
        if (hex) {
            if (hex.realId) {
                filledWithRealId++;
            } else if (hex.baseType || hex.isHyperlane || hex.isNebula || hex.isGravityRift ||
                hex.isSupernova || hex.isAsteroidField || (hex.wormholes && hex.wormholes.length > 0)) {
                filledWithOther++;
            }
        }
    }

    // Determine colors based on occupancy
    let backgroundColor = '';
    let textColor = '';
    let title = '';

    if (filledWithRealId === totalSlots) {
        // All 5 slots filled with realId systems (async tiles)
        backgroundColor = '#28a745'; // Green
        textColor = '#fff';
        title = `${sliceName}: Complete (${filledWithRealId}/${totalSlots} systems)`;
    } else if (filledWithRealId + filledWithOther === totalSlots) {
        // All 5 slots filled but not all with realId (mixed content)
        backgroundColor = '#fd7e14'; // Orange
        textColor = '#fff';
        title = `${sliceName}: Full but mixed (${filledWithRealId} systems, ${filledWithOther} other)`;
    } else if (filledWithRealId + filledWithOther > 0) {
        // Partially filled
        backgroundColor = '#dc3545'; // Red
        textColor = '#fff';
        title = `${sliceName}: Partial (${filledWithRealId + filledWithOther}/${totalSlots} filled)`;
    } else {
        // Completely empty
        backgroundColor = '#f8f9fa'; // Light gray/white
        textColor = '#212529';
        title = `${sliceName}: Empty`;
    }

    return { backgroundColor, textColor, title };
}

// Generate output string for fully occupied draft slices
export function generateOutputString() {
    const fullyOccupiedSlices = [];
    const sliceDetails = [];
    for (let slotNum = 1; slotNum <= 12; slotNum++) {
        const slotHexes = slotPositions[slotNum];
        if (!slotHexes) continue;
        const realIds = [];
        let isFullyOccupied = true;
        for (let i = 1; i < slotHexes.length; i++) {
            const hexId = slotHexes[i];
            const hex = window.editor?.hexes?.[hexId];
            if (hex && hex.realId) {
                realIds.push(hex.realId);
            } else {
                isFullyOccupied = false;
                break;
            }
        }
        if (isFullyOccupied && realIds.length === 5) {
            fullyOccupiedSlices.push(realIds.join(','));
            sliceDetails.push({ slotNum: slotNum, realIds: realIds });
        }
    }
    return {
        outputString: fullyOccupiedSlices.join(';'),
        sliceDetails: sliceDetails
    };
}

// Helper function for tech display
export function capitalizeTech(tech) {
    if (!tech) return '';
    const map = {
        CYBERNETIC: "Cybernetic",
        BIOTIC: "Biotic",
        WARFARE: "Warfare",
        PROPULSION: "Propulsion"
    };
    return map[tech.toUpperCase()] || (tech[0].toUpperCase() + tech.slice(1).toLowerCase());
}
