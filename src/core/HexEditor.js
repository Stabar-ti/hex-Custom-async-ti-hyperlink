// ───────────────────────────────────────────────────────────────
// core/HexEditor.js
// 
// This file defines the HexEditor class, the core "engine" of the 
// TI4 map editor. The HexEditor manages the SVG grid, the state 
// for all map hexes, and provides methods for editing hexes, 
// hyperlanes, wormholes, and overlays. It wires up UI bindings, 
// handles import/export, and offers many helper utilities to 
// interact with map data.
// ───────────────────────────────────────────────────────────────

// ───── Import all dependencies needed by the editor ─────

// UI bindings for panel controls and sidebar
import { bindUI } from '../ui/uiBindings.js';
// Mouse/touch/keyboard events for SVG map itself (pan, zoom, right-click, etc.)
import { bindSvgHandlers } from '../ui/svgBindings.js';
// Core drawing: generate grid, draw hexes, special tiles, etc.
import { drawHexGrid, drawHex, drawSpecialHexes, generateRings, autoscaleView, clearSpecialCorners } from '../draw/drawHexes.js';
// Exporting helpers for map, hyperlane tiles, wormholes
import { exportMap, exportHyperlaneTilePositions, exportWormholePositions } from '../data/export.js';
// Importers for map string (hyperlanes) and sector types
import { importMap, importSectorTypes } from '../data/import.js';
// Logic for toggling wormhole overlays and visibility
import { toggleWormhole, removeWormholeOverlay, redrawWormholeOverlays, updateHexWormholes } from '../features/wormholes.js';
// Hex-grid geometry math utilities (distance, neighbors)
import { hexDistance, getNeighbors } from '../utils/geometry.js';
// Common constants: directions, colors, icon offsets, etc.
import { edgeDirections, ringDirections, effectIconPositions, sectorColors, controlPositions, MAX_MAP_RINGS, wormholeTypes } from '../constants/constants.js';
// Logic to add/remove overlays (nebula, asteroid, etc.)
import { applyEffectToHex, clearAllEffects, refreshEffectsOverlays } from '../features/effects.js';
// Change sector fill and type (e.g., planet, void, etc.)
import { setSectorType } from '../features/sectorTypes.js';
// Draw links between hexes (for hyperlanes)
import { drawCurveLink, drawLoopCircle, drawLoopbackCurve } from '../draw/links.js';
// Allow editor to create/erase hyperlane links with clicks
import { bindHyperlaneEditing } from '../features/hyperlanes.js';
// Main hex click handling logic (sector mode/effect mode/wormhole mode)
import { registerClickHandler } from '../ui/uiEvents.js';
// Theme support (auto-switch dark/light mode)
import { applySavedTheme } from '../ui/uiTheme.js';
// Calculate shortest path distances for overlays, etc.
import { calculateDistancesFrom } from '../draw/drawDistances.js';
// Helper for unmarking real system IDs in overlays
import { unmarkRealIDUsed, clearRealIDUsage } from '../ui/uiFilters.js';
// RealID/overlay features (sector ID overlays, toggles, etc.)
import { initRealIDFeatures, updateLayerVisibility, redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
// Loads system data for all tiles (names, IDs, etc.)
import { loadSystemInfo } from '../data/import.js';
import { updateEffectsVisibility, updateWormholeVisibility, createWormholeOverlay } from '../features/baseOverlays.js'
import { updateTileImageLayer } from '../features/imageSystemsOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';

// Apply the last-used theme (light/dark)
applySavedTheme();


// ───────────────────────────────────────────────────────────────
// HexEditor: The main map editor engine class
// ───────────────────────────────────────────────────────────────
export default class HexEditor {
  /**
   * Main constructor for the map editor. Sets up state,
   * binds UI and event handlers, and draws the initial grid.
   * 
   * @param {object} options - SVG and optional reset callback.
   */
  constructor({ svg, confirmReset = null }) {
    // ─── Core state variables ───
    this.hexes = {};            // Map of all hexes by label/id
    this.selectedPath = [];     // Used for drawing hyperlane paths
    this.mode = 'hyperlane';    // Current editing mode ("hyperlane", "nebula", etc.)
    this.hoveredHexLabel = null;// Which hex is being hovered (for highlight)
    this.fillCorners = true;   // If true, adds corner hexes to map grid
    this.showWormholes = true;  // If wormhole icons are shown
    this.wormholeLinkLines = [];
    this.wormholeLinksShown = false; // If wormhole link lines are visible
    this.showEffects = true;    // If effect overlays (nebula, etc.) are shown
    this.hexRadius = 40;        // Base radius (in px) of each hex
    this.sqrt3 = Math.sqrt(3);  // Precompute for layout
    this.edgeDirections = edgeDirections;       // List of hex directions
    this.ringDirections = ringDirections;       // Directions to spiral out from center
    this.currentRings = 6;           // Default, will be set by generateMap/_setRingCount
    this.currentFillCorners = false; // Ditto   
    this.confirmReset = confirmReset;
    this.effectIconPositions = effectIconPositions; // Offset icons so overlays don't stack
    this.sectorColors = sectorColors;           // Color for each sector type
    this._posIndex = 0;         // For cycling control panel positions
    this.showTileImages = false;


    // ─── UI + map grid setup ───
    this.svg = svg;             // Reference to the SVG element
    this.confirmReset = confirmReset; // Callback to confirm resets
    bindUI(this);               // Setup all UI control bindings
    bindSvgHandlers(this);      // Setup SVG-specific events (zoom, pan, etc.)
    drawHexGrid(this, this.fillCorners); // Draw initial empty grid

    // ─── Corner map toggle logic ───
    this.toggleCorners = (isChecked) => {
      this.fillCorners = isChecked;
      this.generateMap();
    };

    // ─── Global escape key handler for clearing overlays and links ───
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearWormholeLinks();
        if (typeof this.clearDistanceOverlays === 'function') {
          this.clearDistanceOverlays();
        }
      }
    });

    // ─── Hyperlane path/segment creation and core click logic ───
    bindHyperlaneEditing(this);   // Allows drawing hyperlane links with clicks
    registerClickHandler(this);   // Handles click mode (effect/sector/wormhole/hyperlane)
    this.drawnSegments = [];      // Track drawn SVG links for undo/delete
    this.linking = true;          // If true, in path-creation mode
    this.unlinking = false;       // If true, in path-deletion mode

    // ─── DEFERRED: Wait for system info to load before generating grid ───
    // This ensures all system/sector metadata is ready before drawing.
    loadSystemInfo(this)
      .then(() => {
        this.generateMap();
        console.log("HexEditor fully initialized.");
      })
      .catch(err => {
        console.error("Could not load system info:", err);
        // Optionally fallback to a blank map if data load fails:
        // this.generateMap();
      });
  }

  // ────────  SIMPLE WRAPPER FUNCTIONS  ────────

  /**
     * Change the type (fill) of a given hex.
     * @param {string} label - hex id
     * @param {string} type  - type to set
     * @param {object} opts  - options ({ skipSave: true } to skip saveState)
     */
  setSectorType(label, type, opts) {
    setSectorType(this, label, type, opts);
  }

  /**
   * Apply an effect overlay to a hex (nebula, asteroid, etc.)
   */
  applyEffect(label, effect) {
    applyEffectToHex(this, label, effect);
  }

  /**
   * Toggle a wormhole marker on a hex.
   */
  toggleWormhole(label, type) {
    toggleWormhole(this, label, type);
  }

  // ────────  WORMHOLE LINK VISUALIZATION  ────────

  /**
   * Draw dashed lines connecting all hexes that share a wormhole type.
   * Each wormhole group (Alpha, Beta, etc.) is shown in a different color.
   * Ensures no duplicate lines are created.
   */
  drawWormholeLinks() {
    // Remove existing link lines, if any
    this.clearWormholeLinks();

    // Find or create the wormhole line SVG layer
    let layer = this.svg.querySelector('#wormholeLineLayer');
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.setAttribute('id', 'wormholeLineLayer');
      this.svg.appendChild(layer);
    }

    // Group hexes by which wormholes they contain
    const groups = {};
    for (const [label, hex] of Object.entries(this.hexes)) {
      if (hex.wormholes && hex.wormholes.size) {
        hex.wormholes.forEach((type) => {
          if (!groups[type]) groups[type] = [];
          groups[type].push(hex);
        });
      }
    }

    // For each wormhole type, draw a line between every pair in the group
    Object.keys(groups).forEach((type) => {
      const list = groups[type];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const hexA = list[i], hexB = list[j];
          // Try to use explicit center, fallback to polygon center if not available
          let x1, y1, x2, y2;
          if (hexA.center && typeof hexA.center.x === 'number') {
            x1 = hexA.center.x; y1 = hexA.center.y;
          } else if (hexA.polygon) {
            const bboxA = hexA.polygon.getBBox();
            x1 = bboxA.x + bboxA.width / 2; y1 = bboxA.y + bboxA.height / 2;
          } else continue;
          if (hexB.center && typeof hexB.center.x === 'number') {
            x2 = hexB.center.x; y2 = hexB.center.y;
          } else if (hexB.polygon) {
            const bboxB = hexB.polygon.getBBox();
            x2 = bboxB.x + bboxB.width / 2; y2 = bboxB.y + bboxB.height / 2;
          } else continue;

          // Create the SVG line
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', x1);
          line.setAttribute('y1', y1);
          line.setAttribute('x2', x2);
          line.setAttribute('y2', y2);

          // Color lines by wormhole type; fallback to gray
          const strokeColor = (wormholeTypes[type] && wormholeTypes[type].color) || '#888888';
          line.setAttribute('stroke', strokeColor);
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-dasharray', '4,4');
          line.setAttribute('pointer-events', 'none');
          layer.appendChild(line);
          this.wormholeLinkLines.push(line);
        }
      }
    });
    this.wormholeLinksShown = true;
  }

  /**
   * Remove all wormhole link lines from the SVG.
   */
  clearWormholeLinks() {
    const layer = this.svg.querySelector('#wormholeLineLayer');
    if (layer && this.wormholeLinkLines.length) {
      this.wormholeLinkLines.forEach((line) => {
        if (layer.contains(line)) layer.removeChild(line);
      });
      this.wormholeLinkLines = [];
    }
    this.wormholeLinksShown = false;
  }

  /**
   * Ensure a hex exists at (label, q, r); create if needed.
   */
  ensureHex(label, q, r) {
    if (!this.hexes[label]) {
      this.hexes[label] = {
        label,
        q,
        r,
        matrix: Array(6).fill(0).map(() => Array(6).fill(0))
      };
    }
  }

  /**
   * Cycles the control panel (sector buttons) between left/top/right
   */
  cycleControlPanelPosition() {
    const container = document.getElementById('sectorControlsContainer');
    if (!container) return;
    controlPositions.forEach(cls => container.classList.remove(cls));
    const nextClass = controlPositions[this._posIndex % controlPositions.length];
    container.classList.add(nextClass);
    this._posIndex++;
  }

  /**
   * Generate a new blank map of the selected ring count.
   * Loads system data for each tile, initializes overlays/layers.
   */
  generateMap() {
    if (this.confirmReset && this.confirmReset() === false) return;

    const rings = parseInt(document.getElementById('ringCount').value, 10);
    if (isNaN(rings) || rings < 1 || rings > MAX_MAP_RINGS) {
      alert(`Enter 1–${MAX_MAP_RINGS}`);
      return;
    }
    this.currentRings = rings;
    this.currentFillCorners = this.fillCorners;

    // Clear overlays, segments, SVG
    clearRealIDUsage();
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    this.hexes = {};
    this.drawnSegments.length = 0;
    this.selectedPath.length = 0;

    // Draw main map hexes
    const layout = generateRings(rings, this.fillCorners);
    layout.forEach(h => drawHex(this, h.q, h.r, h.label));

    // Initialize empty state for all hexes - don't auto-assign planets
    // Planets should only be assigned when user explicitly assigns a system
    for (const [label, hex] of Object.entries(this.hexes)) {
      hex.planets = [];
      hex.wormholes = new Set();
      hex.realId = null;
    }
    this.currentLayoutRings = rings;

    // --- ALWAYS clear, then redraw special corners ---
    clearSpecialCorners(this);
    drawSpecialHexes(this);

    updateEffectsVisibility(this);

    // Add the wormhole line layer to the SVG
    const wormholeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wormholeLayer.setAttribute('id', 'wormholeLineLayer');
    this.svg.appendChild(wormholeLayer);

    // Optional overlays
    initRealIDFeatures(this);
    updateLayerVisibility(this, 'planetTypeLayer', this.showPlanetTypes);
    updateLayerVisibility(this, 'resInfLayer', this.showResInf);
    updateLayerVisibility(this, 'idealRILayer', this.showIdealRI);
    updateLayerVisibility(this, 'realIDLabelLayer', this.showRealID);

    updateTileImageLayer(this);

    // Add wormholeIconLayer (for wormhole overlays, above tile images)
    let wormholeIconLayer = this.svg.querySelector('#wormholeIconLayer');
    if (!wormholeIconLayer) {
      wormholeIconLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wormholeIconLayer.setAttribute('id', 'wormholeIconLayer');
      wormholeIconLayer.setAttribute('visibility', 'visible'); // Ensure layer is visible by default
      this.svg.appendChild(wormholeIconLayer);
    }
    enforceSvgLayerOrder(this.svg);

    autoscaleView(this);
  }

  addRing() {
    const ringsInput = document.getElementById('ringCount');
    let rings = parseInt(ringsInput.value, 10);
    if (isNaN(rings)) rings = 1;
    if (rings >= MAX_MAP_RINGS) return;
    rings += 1;
    ringsInput.value = rings;
    this._setRingCount(rings);

  }

  removeRing() {
    const ringsInput = document.getElementById('ringCount');
    let rings = parseInt(ringsInput.value, 10);
    if (isNaN(rings) || rings <= 1) return;
    rings -= 1;
    ringsInput.value = rings;
    this._setRingCount(rings);

  }

  // Internal: Adjust rings, preserve hexes inside new bounds
  _setRingCount(newRings) {
    this.currentRings = newRings;
    this.currentFillCorners = this.fillCorners;

    const layout = generateRings(newRings, this.fillCorners);
    const newLabels = new Set(layout.map(h => h.label));
    const oldLabels = new Set(Object.keys(this.hexes));

    // Add new hexes
    for (const h of layout) {
      if (!this.hexes[h.label]) {
        drawHex(this, h.q, h.r, h.label);
      }
    }

    // Remove cut hexes (with clearAll and polygon/label removal), but skip corners!
    for (const label of oldLabels) {
      if (
        !newLabels.has(label) &&
        !['TL', 'TR', 'BL', 'BR'].includes(label)
      ) {
        this.clearAll(label);
        this.clearCustomAdjencies(label);

        // Remove the hex polygon from SVG
        const hex = this.hexes[label];
        if (hex && hex.polygon && hex.polygon.parentNode) {
          hex.polygon.parentNode.removeChild(hex.polygon);
        }
        // Remove the sector label <text>
        const labelEl = document.getElementById(`label-${label}`);
        if (labelEl && labelEl.parentNode) {
          labelEl.parentNode.removeChild(labelEl);
        }

        delete this.hexes[label];
      }
    }

    // --- Preserve corner hex data, then redraw special corners ---
    // Save corner hex data before clearing
    const cornerData = {};
    ['TL', 'TR', 'BL', 'BR'].forEach(label => {
      if (this.hexes[label]) {
        cornerData[label] = {
          baseType: this.hexes[label].baseType,
          effects: new Set(this.hexes[label].effects),
          wormholes: new Set(this.hexes[label].wormholes),
          customWormholes: new Set(this.hexes[label].customWormholes || []),
          inherentWormholes: new Set(this.hexes[label].inherentWormholes || []),
          planets: [...(this.hexes[label].planets || [])],
          realId: this.hexes[label].realId,
          matrix: this.hexes[label].matrix ? this.hexes[label].matrix.map(row => [...row]) : null,
          customAdjacents: this.hexes[label].customAdjacents ? [...this.hexes[label].customAdjacents] : undefined,
          adjacencyOverrides: this.hexes[label].adjacencyOverrides ? { ...this.hexes[label].adjacencyOverrides } : undefined,
          borderAnomalies: this.hexes[label].borderAnomalies ? { ...this.hexes[label].borderAnomalies } : undefined
        };
      }
    });

    clearSpecialCorners(this);
    drawSpecialHexes(this);

    // Restore corner hex data
    ['TL', 'TR', 'BL', 'BR'].forEach(label => {
      if (cornerData[label] && this.hexes[label]) {
        const hex = this.hexes[label];
        const data = cornerData[label];
        hex.baseType = data.baseType || '';
        hex.effects = data.effects || new Set();
        hex.wormholes = data.wormholes || new Set();
        hex.customWormholes = data.customWormholes || new Set();
        hex.inherentWormholes = data.inherentWormholes || new Set();
        hex.planets = data.planets || [];
        hex.realId = data.realId || null;
        if (data.matrix) hex.matrix = data.matrix;
        if (data.customAdjacents) hex.customAdjacents = data.customAdjacents;
        if (data.adjacencyOverrides) hex.adjacencyOverrides = data.adjacencyOverrides;
        if (data.borderAnomalies) hex.borderAnomalies = data.borderAnomalies;

        // Update hex.wormholes to be the union of inherentWormholes and customWormholes
        updateHexWormholes(hex);

        // Update the polygon fill color to match the restored baseType
        if (hex.polygon) {
          hex.polygon.setAttribute('fill', this.sectorColors[hex.baseType] || this.sectorColors['']);
        }

        // Clear any old overlay arrays since hexes were redrawn
        hex.overlays = [];
        hex.wormholeOverlays = [];
      }
    });

    updateEffectsVisibility(this);
    redrawAllRealIDOverlays(this);

    // Redraw overlays for corner hexes at their new positions
    ['TL', 'TR', 'BL', 'BR'].forEach(label => {
      if (cornerData[label] && this.hexes[label]) {

        // Refresh effects overlays at new position
        if (cornerData[label].effects && cornerData[label].effects.size > 0) {
          // Effects data was already restored above, just refresh the overlays
          refreshEffectsOverlays(this, label);
        }

        // Create wormhole overlays using the same approach as tileCopyPasteWizard
        const hex = this.hexes[label];
        if (hex.wormholes && hex.wormholes.size > 0) {

          // Clear any existing overlays first
          if (hex.wormholeOverlays) {
            hex.wormholeOverlays.forEach(o => {
              if (o.parentNode) o.parentNode.removeChild(o);
            });
            hex.wormholeOverlays = [];
          }

          // Create new overlays for all wormholes
          Array.from(hex.wormholes).forEach((w, i) => {
            const positions = this.effectIconPositions;
            const len = positions.length;
            const reversedIndex = len - 1 - (i % len);
            const pos = positions[reversedIndex] || { dx: 0, dy: 0 };

            const overlay = createWormholeOverlay(hex.center.x + pos.dx, hex.center.y + pos.dy, w.toLowerCase());
            if (overlay) {
              overlay.setAttribute('data-label', label);
              const wormholeIconLayer = this.svg.querySelector('#wormholeIconLayer');
              if (wormholeIconLayer) {
                wormholeIconLayer.appendChild(overlay);
              } else {
                this.svg.appendChild(overlay);
              }
              if (!hex.wormholeOverlays) hex.wormholeOverlays = [];
              hex.wormholeOverlays.push(overlay);
            }
          });
        }

        // Redraw realID overlays at new position if hex has realId
        if (cornerData[label].realId !== null && cornerData[label].realId !== undefined) {
          // The redrawAllRealIDOverlays call above should handle this, but let's be explicit
          redrawAllRealIDOverlays(this);
        }
      }
    });

    autoscaleView(this);

    // Force SVG layer order update before setting wormhole visibility
    enforceSvgLayerOrder(this.svg);
    // Update wormhole visibility AFTER all redrawing operations are complete
    updateWormholeVisibility(this);
  }




  /**
   * Switch editing mode and clear selection
   */
  setMode(mode) {

    this.mode = mode;
    this.selectedPath = [];
    ///editor.clearAll(label);
    Object.values(this.hexes).forEach(h => h.polygon?.classList.remove('selected'));

  }

  /**
   * Checks if two hexes are direct neighbors on the grid.
   */
  areNeighbors(a, b) {
    const dq = this.hexes[b].q - this.hexes[a].q;
    const dr = this.hexes[b].r - this.hexes[a].r;
    return this.edgeDirections.some(d => d.q === dq && d.r === dr);
  }

  /**
   * Toggle a wormhole icon on a hex and refresh overlays.
   */
  toggleWormholeOnHex(hexId, type) {
    toggleWormhole(this, hexId, type);
    updateWormholeVisibility(this);
  }

  // ──────── EXPORT/IMPORT UI HELPERS ────────



  exportCurrentMap() {
    exportMap(this);
  }
  exportData() {
    exportMap(this);
  }
  exportSectorTypes() {
    import('../data/export.js').then(({ exportSectorTypes }) => {
      const result = exportSectorTypes(this);
      document.getElementById('exportTypesText').value = result;
      document.getElementById('exportTypesModal').style.display = 'block';
    });
  }
  exportHyperlaneTilePositions() {
    exportHyperlaneTilePositions(this);
  }
  async exportWormholePositions() {
    await exportWormholePositions(this);
  }

  /**
   * Import hyperlane map links
   */
  importFromData(data) {
    importMap(this, data);
  }
  importData() {
    const text = document.getElementById('importText').value;
    if (!text) {
      alert("No hyperlane data to import.");
      return;
    }
    importMap(this, text);
  }
  importSectorTypes() {
    const text = document.getElementById('importTypesText').value;
    if (!text) {
      alert("No sector type data to import.");
      return;
    }
    importSectorTypes(this, text);
  }

  // ──────── GEOMETRY HELPERS ────────

  /**
   * Get the map distance (in hexes) between two hexes.
   */
  getDistance(hexA, hexB) {
    return hexDistance(this.hexes[hexA], this.hexes[hexB]);
  }

  /**
   * Get the 6 direct neighbors of a given hex ID.
   */
  getNeighborsOf(hexId) {
    const { q, r } = this.hexes[hexId];
    return getNeighbors(q, r);
  }

  // ──────── EFFECT/WORMHOLE/EVERYTHING CLEARING ────────

  /**
   * Remove all overlays, wormholes, hyperlanes, and sector type from a hex.
   */
  clearAllEffects(label) {
    clearAllEffects(this, label);
  }

  /**
 * Full hex reset: remove all overlays, links, wormholes, and set to blank.
 */
  clearAll(label) {
    // 1) Remove all hyperlane link segments for this hex
    this.deleteAllSegments(label);

    // 2) Remove all effect overlays (nebula, etc.)
    this.clearAllEffects(label);

    // 3) Remove wormhole icons, overlays, and reset realID/planets
    const hex = this.hexes[label];
    if (hex) {
      // remove any existing wormhole overlays
      hex.wormholeOverlays.forEach(o => {
        if (o.parentNode === this.svg) this.svg.removeChild(o);
        // Also remove from wormholeIconLayer if present
        const wormholeIconLayer = this.svg.querySelector('#wormholeIconLayer');
        if (wormholeIconLayer && wormholeIconLayer.contains(o)) {
          wormholeIconLayer.removeChild(o);
        }
      });
      hex.wormholeOverlays = [];
      hex.wormholes.clear();

      // Clear new features
      // delete hex.customAdjacents;
      // delete hex.adjacencyOverrides;
      // delete hex.borderAnomalies;

      // Clear lore data
      hex.systemLore = null;
      hex.planetLore = [];

      // if there was a real system assigned, unmark it and clear planet data
      if (hex.realId != null) {
        unmarkRealIDUsed(hex.realId.toString());
        hex.planets = [];
        hex.realId = null;
        redrawAllRealIDOverlays(this);
      }
    }

    // 4) Reset the fill/type of the hex back to “blank”
    this.setSectorType(label, '');
  }


  clearCustomAdjencies(label) {
    const hex = this.hexes[label];
    if (!hex) return;
    delete hex.customAdjacents;
    delete hex.adjacencyOverrides;
    delete hex.borderAnomalies;
  }

  clearCustomAdjacenciesBothSides(label) {
    const hex = this.hexes[label];
    if (!hex) return;

    // Remove all outgoing custom adjacencies from this hex
    delete hex.customAdjacents;
    delete hex.adjacencyOverrides;

    // For border anomalies, also clear reciprocal/blocked anomalies on neighbors
    if (hex.borderAnomalies) {
      for (const [sideStr, anomaly] of Object.entries(hex.borderAnomalies)) {
        const side = parseInt(sideStr, 10);
        // Get the neighbor hex
        const dirs = [
          { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
          { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
        ];
        const nq = hex.q + dirs[side].q;
        const nr = hex.r + dirs[side].r;
        const neighbor = Object.values(this.hexes).find(h => h.q === nq && h.r === nr);
        if (!neighbor) continue;

        // Remove on both ends for Spatial Tear, and for Gravity Wave if present
        if (anomaly.type === "Spatial Tear" || anomaly.type === "Gravity Wave") {
          const opp = (side + 3) % 6;
          if (neighbor.borderAnomalies && neighbor.borderAnomalies[opp]) {
            // For Spatial Tear, always remove. For Gravity Wave, only if it's present.
            delete neighbor.borderAnomalies[opp];
            if (Object.keys(neighbor.borderAnomalies).length === 0)
              delete neighbor.borderAnomalies;
          }
        }
      }
      // Remove all borderAnomalies from this hex
      delete hex.borderAnomalies;
    }

    // Now check every neighbor to see if they have an anomaly that blocks THIS hex, but this hex doesn't have a record
    const dirs = [
      { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
      { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
    ];
    for (let side = 0; side < 6; side++) {
      const nq = hex.q + dirs[side].q;
      const nr = hex.r + dirs[side].r;
      const neighbor = Object.values(this.hexes).find(h => h.q === nq && h.r === nr);
      if (!neighbor || !neighbor.borderAnomalies) continue;
      const opp = (side + 3) % 6;
      // If the neighbor has a Spatial Tear or Gravity Wave on the edge facing us, clear it.
      const anomaly = neighbor.borderAnomalies[opp];
      if (anomaly && (anomaly.type === "Spatial Tear" || anomaly.type === "Gravity Wave")) {
        delete neighbor.borderAnomalies[opp];
        if (Object.keys(neighbor.borderAnomalies).length === 0)
          delete neighbor.borderAnomalies;
      }
    }
  }


  // ──────── OVERLAY UTILITY ────────

  /**
   * Calculate shortest-path map distances for overlays.
   */
  calculateDistancesFrom(sourceLabel, maxDist) {
    return calculateDistancesFrom(this, sourceLabel, maxDist);
  }

  // ──────── SVG LINK/DRAWING HELPERS ────────

  /**
   * Draw a curve link from one hex to another (for hyperlane overlays).
   */
  drawCurveLink(from, to, entry, exit) {
    return drawCurveLink(this.svg, this.hexes[to], entry, exit, to, this.hexRadius);
  }

  /**
   * Draw a circular "loop" overlay on a hex (for loopback links).
   */
  drawLoopCircle(label) {
    const hex = this.hexes[label];
    if (hex?.center) {
      const { x, y } = hex.center;
      const loop = drawLoopCircle(this.svg, x, y, label);
      this.drawnSegments.push(loop);
    }
  }

  /**
   * Draw a "loopback" curve (entry→entry) on the hex.
   */
  /**
   * Test function to add border anomalies for debugging
   */
  async addTestBorderAnomalies() {
    console.log('Adding test border anomalies...');
    const hexLabels = Object.keys(this.hexes);
    if (hexLabels.length < 2) {
      console.log('Not enough hexes to create border anomalies');
      return;
    }

    // Find first two adjacent hexes for testing
    const firstHex = hexLabels[0];
    const neighbors = getNeighbors(this.hexes[firstHex]);
    const secondHex = neighbors.find(n => this.hexes[n]);

    if (!secondHex) {
      console.log('No neighbor found for first hex');
      return;
    }

    // Add asteroid field border anomaly
    if (!this.hexes[firstHex].borderAnomalies) {
      this.hexes[firstHex].borderAnomalies = {};
    }

    // Find which side connects to the neighbor
    const dirs = [
      { q: 0, r: -1 }, // 0: NW
      { q: 1, r: -1 }, // 1: NE  
      { q: 1, r: 0 },  // 2: E
      { q: 0, r: 1 },  // 3: SE
      { q: -1, r: 1 }, // 4: SW
      { q: -1, r: 0 }  // 5: W
    ];

    const firstCoords = this.hexes[firstHex];
    const secondCoords = this.hexes[secondHex];
    const dq = secondCoords.q - firstCoords.q;
    const dr = secondCoords.r - firstCoords.r;

    let side = -1;
    for (let i = 0; i < 6; i++) {
      if (dirs[i].q === dq && dirs[i].r === dr) {
        side = i;
        break;
      }
    }

    if (side === -1) {
      console.log('Could not determine side between hexes');
      return;
    }

    // Add asteroid field anomaly
    this.hexes[firstHex].borderAnomalies[side] = { type: 'Asteroid Field' };
    console.log(`Added Asteroid Field border anomaly between ${firstHex} and ${secondHex} on side ${side}`);

    // Redraw border anomalies
    const { drawBorderAnomaliesLayer } = await import('../draw/borderAnomaliesDraw.js');
    drawBorderAnomaliesLayer(this);
  }

  drawLoopbackCurve(label, entry) {
    const hex = this.hexes[label];
    if (hex) {
      const loop = drawLoopbackCurve(this.svg, hex, entry, label);
      this.drawnSegments.push(loop);
      hex.matrix[entry][entry] = 1;
    }
  }
}
