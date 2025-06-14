// ─────────────── core/HexEditor.js ───────────────
import { bindUI } from '../ui/uiBindings.js';
import { bindSvgHandlers } from '../ui/svgBindings.js';
import { drawHexGrid, drawHex, drawSpecialHexes, generateRings, autoscaleView } from '../draw/drawHexes.js';
import { exportMap, exportHyperlaneTilePositions, exportWormholePositions } from '../data/export.js';
import { importMap, importSectorTypes } from '../data/import.js';
import { toggleWormhole, updateWormholeVisibility } from '../features/wormholes.js';
import { hexDistance, getNeighbors } from '../utils/geometry.js';
import { edgeDirections, ringDirections, effectIconPositions, sectorColors, controlPositions, MAX_MAP_RINGS, wormholeTypes } from '../constants/constants.js';
import { applyEffectToHex, clearAllEffects, updateEffectsVisibility } from '../features/effects.js';
import { setSectorType } from '../features/sectorTypes.js';
import { drawCurveLink, drawLoopCircle, drawLoopbackCurve } from '../draw/links.js';
import { bindHyperlaneEditing } from '../features/hyperlanes.js';
import { registerClickHandler } from '../ui/uiEvents.js';
import { applySavedTheme } from '../ui/uiTheme.js';
import { calculateDistancesFrom } from '../draw/drawDistances.js';
import { unmarkRealIDUsed, clearRealIDUsage } from '../ui/uiFilters.js';
import { initRealIDFeatures, updateLayerVisibility, redrawAllRealIDOverlays } from '../features/realIDsOverlays.js';
import { loadSystemInfo } from '../data/import.js';

applySavedTheme();

export default class HexEditor {
  constructor({ svg, confirmReset = null }) {
    // ─── core state ───
    this.hexes = {};
    this.selectedPath = [];
    this.mode = 'hyperlane';
    this.hoveredHexLabel = null;
    this.fillCorners = false;
    this.showWormholes = true;
    this.wormholeLinksShown = false;
    this.showEffects = true;
    this.hexRadius = 40;
    this.sqrt3 = Math.sqrt(3);
    this.edgeDirections = edgeDirections;
    this.ringDirections = ringDirections;
    this.effectIconPositions = effectIconPositions;
    this.sectorColors = sectorColors;
    this._posIndex = 0;

    // UI + map grid
    this.svg = svg;
    this.confirmReset = confirmReset;
    bindUI(this);
    bindSvgHandlers(this);
    drawHexGrid(this, this.fillCorners);

    // corner toggle
    this.toggleCorners = (isChecked) => {
      this.fillCorners = isChecked;
      this.generateMap();
    };

    // escape key cleanup
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearWormholeLinks();
        if (typeof this.clearDistanceOverlays === 'function') {
          this.clearDistanceOverlays();
        }
      }
    });

    // hyperlane editing & clicks
    bindHyperlaneEditing(this);
    registerClickHandler(this);
    this.drawnSegments = [];
    this.linking = true;
    this.unlinking = false;

    // --- DO NOT CALL this.generateMap() here ---
    // Instead, wait for system info to load:
    loadSystemInfo(this)
      .then(() => {
        // allSystems and sectorIDLookup are set here
        this.generateMap();
        console.log("HexEditor fully initialized.");
      })
      .catch(err => {
        console.error("Could not load system info:", err);
        // You could call this.generateMap(); here for a fallback blank map
      });
}

setSectorType(label, type) {
  setSectorType(this, label, type);
}

applyEffect(label, effect) {
  applyEffectToHex(this, label, effect);
}

toggleWormhole(label, type) {
  toggleWormhole(this, label, type);
}

/**
   * Draw SVG lines between hexes that share a wormhole type.
   * Uses colors from constants.wormholeTypes.
   */
/**
* Draw SVG lines between hexes that share a wormhole type.
* Uses colors from constants.wormholeTypes.
*/
drawWormholeLinks() {
  // Clear existing lines
  this.clearWormholeLinks();
  //console.log("function triggered");
  // Find or create a dedicated group for wormhole lines
  let layer = this.svg.querySelector('#wormholeLineLayer');
  if (!layer) {
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('id', 'wormholeLineLayer');
    this.svg.appendChild(layer);
    console.log("layer tester");
  }
  // Group hexes by wormhole type
  const groups = {};
  //console.log("check groups");
  for (const [label, hex] of Object.entries(this.hexes)) {
    if (hex.wormholes && hex.wormholes.size) {
      hex.wormholes.forEach((type) => {
        if (!groups[type]) {
          groups[type] = [];
        }
        groups[type].push(hex);
      });
    }
  }
  //console.log('🐛 [drawWormholeLinks] groups =', groups);
  // For each type, draw lines between every pair of hexes in that group
  Object.keys(groups).forEach((type) => {
    const list = groups[type];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const hexA = list[i];
        const hexB = list[j];
        // Determine center for each hex, fallback to polygon bbox if needed
        let x1, y1, x2, y2;
        if (hexA.center && typeof hexA.center.x === 'number') {
          x1 = hexA.center.x;
          y1 = hexA.center.y;
        } else if (hexA.polygon) {
          const bboxA = hexA.polygon.getBBox();
          x1 = bboxA.x + bboxA.width / 2;
          y1 = bboxA.y + bboxA.height / 2;
        } else {
          continue; // no valid center for hexA
        }
        if (hexB.center && typeof hexB.center.x === 'number') {
          x2 = hexB.center.x;
          y2 = hexB.center.y;
        } else if (hexB.polygon) {
          const bboxB = hexB.polygon.getBBox();
          x2 = bboxB.x + bboxB.width / 2;
          y2 = bboxB.y + bboxB.height / 2;
        } else {
          continue; // no valid center for hexB
        }
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        // Use color from constants, fallback to gray
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
 * Remove any drawn wormhole link lines from the SVG
 */
clearWormholeLinks() {
  // Remove lines from the dedicated wormhole layer
  const layer = this.svg.querySelector('#wormholeLineLayer');
  if (layer && this.wormholeLinkLines.length) {
    this.wormholeLinkLines.forEach((line) => {
      if (layer.contains(line)) {
        layer.removeChild(line);
      }
    });
    this.wormholeLinkLines = [];
  }
  this.wormholeLinksShown = false;
}

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

cycleControlPanelPosition() {
  const container = document.getElementById('sectorControlsContainer');
  if (!container) return;

  controlPositions.forEach(cls => container.classList.remove(cls));
  const nextClass = controlPositions[this._posIndex % controlPositions.length];
  container.classList.add(nextClass);
  this._posIndex++;
}

generateMap() {
  if (this.confirmReset && this.confirmReset() === false) return;
  const rings = parseInt(document.getElementById('ringCount').value, 10);
  if (isNaN(rings) || rings < 1 || rings > MAX_MAP_RINGS) {
    alert(`Enter 1–${MAX_MAP_RINGS}`);
    return;
  }

  clearRealIDUsage();

  const svg = this.svg;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  this.hexes = {};
  this.drawnSegments.length = 0;
  this.selectedPath.length = 0;

  const count = this.fillCorners ? 14 : rings;
  const layout = generateRings(count, this.fillCorners);
  layout.forEach(h => drawHex(this, h.q, h.r, h.label));

 // ← HERE: merge JSON into this.hexes
 //const lookup = tileData.systems.reduce((m, sys) => {
 //  m[sys.tileId || sys.id] = sys;
 //  return m;
 //}, {});

  const lookup = this.sectorIDLookup || {};

 for (const [label, hex] of Object.entries(this.hexes)) {
   const sys = lookup[label.toUpperCase()];
   if (sys) {
     hex.planets   = sys.planets || [];
     hex.wormholes = new Set(sys.wormholes || []);
   }
 }

  drawSpecialHexes(this);
  updateEffectsVisibility(this);

  const wormholeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wormholeLayer.setAttribute('id', 'wormholeLineLayer');
  this.svg.appendChild(wormholeLayer);

  initRealIDFeatures(this);
  updateLayerVisibility(this, 'planetTypeLayer', this.showPlanetTypes);
  updateLayerVisibility(this, 'resInfLayer', this.showResInf);
  updateLayerVisibility(this, 'idealRILayer', this.showIdealRI);
  updateLayerVisibility(this, 'realIDLabelLayer', this.showRealID);

  autoscaleView(this);
}

setMode(mode) {
  this.mode = mode;
  this.selectedPath = [];
  Object.values(this.hexes).forEach(h => h.polygon?.classList.remove('selected'));
}

areNeighbors(a, b) {
  const dq = this.hexes[b].q - this.hexes[a].q;
  const dr = this.hexes[b].r - this.hexes[a].r;
  return this.edgeDirections.some(d => d.q === dq && d.r === dr);
}

toggleWormholeOnHex(hexId, type) {
  toggleWormhole(this, hexId, type);
  updateWormholeVisibility(this);
}

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

exportWormholePositions() {
  exportWormholePositions(this);
}

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

getDistance(hexA, hexB) {
  return hexDistance(this.hexes[hexA], this.hexes[hexB]);
}

getNeighborsOf(hexId) {
  const { q, r } = this.hexes[hexId];
  return getNeighbors(q, r);
}

clearAllEffects(label) {
  clearAllEffects(this, label);
}

// core/HexEditor.js

clearAll(label) {
  // 1) Hyperlane segments
  this.deleteAllSegments(label);

  // 2) Effect overlays
  this.clearAllEffects(label);

  // 3) Wormholes & realId
  const hex = this.hexes[label];
  if (hex) {
    // a) Remove SVG nodes
    hex.wormholeOverlays.forEach(o => {
      if (o.parentNode === this.svg) {
        this.svg.removeChild(o);
      }
    });
    // b) Reset data
    hex.wormholeOverlays = [];
    hex.wormholes.clear();
    // c) Clear the imported JSON Real ID
    //    and unmark it in your UI filters
    if (hex.realId != null) {
      unmarkRealIDUsed(hex.realId.toString());
      hex.planets = [];
      hex.realId = null;
      redrawAllRealIDOverlays(editor);
    } 
  }

  // 4) Sector fill back to blank
  this.setSectorType(label, '');

}

calculateDistancesFrom(sourceLabel, maxDist) {
  return calculateDistancesFrom(this, sourceLabel, maxDist);
}

drawCurveLink(from, to, entry, exit) {
  return drawCurveLink(this.svg, this.hexes[to], entry, exit, to, this.hexRadius);
}

drawLoopCircle(label) {
  const hex = this.hexes[label];
  if (hex?.center) {
    const { x, y } = hex.center;
    const loop = drawLoopCircle(this.svg, x, y, label);
    this.drawnSegments.push(loop);
  }
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