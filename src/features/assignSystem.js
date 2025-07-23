// features/assignSystem.js
import { toggleWormhole } from '../features/wormholes.js';
import { drawMatrixLinks } from '../features/hyperlanes.js';
import { updateTileImageLayer } from '../features/imageSystemsOverlay.js';
import { enforceSvgLayerOrder } from '../draw/enforceSvgLayerOrder.js';
import { createWormholeOverlay } from '../features/baseOverlays.js';

/**
 * Assigns a system object to a hex tile, updating all overlays, type, and state.
 * Call this only ONCE per assignment, always after saveState and within an undo group.
 * @param {HexEditor} editor
 * @param {Object} sys    - The system data (from sectorIDLookup)
 * @param {string} hexID  - The three-digit hex ID (e.g. '065')
 */
export function assignSystem(editor, sys, hexID) {
  const hex = editor.hexes[hexID];
  if (!hex) return;
  //console.log('assignSystem: called for', hexID, sys);

  // 1. Remove ALL old state/overlays before assignment.
  editor.clearAll(hexID);
  //console.log('assignSystem: after clearAll', { ...hex });

  // 2. Hyperlane tile? Draw links & SKIP baseType/overlays.
  if (sys.isHyperlane) {
    // console.log('isHyperlane');
    const id = sys.id?.toLowerCase?.();
    //console.log(editor.hyperlaneMatrices)
    if (editor.hyperlaneMatrices && id && editor.hyperlaneMatrices[id]) {
      const matrix = editor.hyperlaneMatrices[id];
      editor.deleteAllSegments(hexID);
      hex.matrix = matrix.map(row => [...row]); // deep copy for safety
      drawMatrixLinks(editor, hexID, hex.matrix);
      //   console.log('drawn hyperlanes');
    }
    // Assign realId for overlays (optional)
    hex.realId = sys.id;
    // No baseType assignment!
    // Still update DOM for realId overlays if needed
    const el = document.getElementById(hexID);
    if (el) el.dataset.realId = sys.id.toString();
    // Do not assign planets or overlays!
    return; // <- STOP HERE for hyperlane tiles!
  }

  // 3. Set new realID and planet data
  hex.realId = sys.id;
  hex.planets = sys.planets || [];
  //   console.log('assignSystem: after assigning realId and planets', {...hex});

  // 4. Update DOM for overlays if needed
  const el = document.getElementById(hexID);
  if (el) el.dataset.realId = sys.id.toString();

  // 5. Classify sector type for color and overlays
  let baseType;
  const planets = Array.isArray(sys.planets) ? sys.planets : [];
  if (planets.some(p => p.legendaryAbilityName && p.legendaryAbilityText)) {
    baseType = 'legendary planet';
  } else if (planets.some(p => p.planetType === 'FACTION')) {
    baseType = 'homesystem';
  } else if (planets.length >= 3) {
    baseType = '3 planet';
  } else if (planets.length >= 2) {
    baseType = '2 planet';
  } else if (planets.length >= 1) {
    baseType = '1 planet';
  } else if (sys.isAsteroidField || sys.isSupernova || sys.isNebula || sys.isGravityRift) {
    baseType = 'special';
  } else {
    baseType = 'empty';
  }
  editor.setSectorType(hexID, baseType, { skipSave: true });

  // 6. Effects overlays
  if (sys.isNebula) editor.applyEffect(hexID, 'nebula');
  if (sys.isGravityRift) editor.applyEffect(hexID, 'rift');
  if (sys.isSupernova) editor.applyEffect(hexID, 'supernova');
  if (sys.isAsteroidField) editor.applyEffect(hexID, 'asteroid');

  // 7. Inherent wormholes (always lowercase for key)
  // Only set inherentWormholes from system data. Clear customWormholes to prevent carry-over.
  const wormholes = Array.isArray(sys.wormholes) ? sys.wormholes : [];
  hex.inherentWormholes = new Set(
    wormholes.filter(w => typeof w === "string").map(w => w.toLowerCase())
  );
  // Always clear customWormholes when assigning a RealID system
  hex.customWormholes = new Set();
  // Always update the union
  if (typeof updateHexWormholes === 'function') {
    updateHexWormholes(hex);
    console.log('assignSystem: after updateHexWormholes', hexID, {
      inherentWormholes: Array.from(hex.inherentWormholes),
      customWormholes: Array.from(hex.customWormholes),
      wormholes: Array.from(hex.wormholes)
    });
  } else {
    hex.wormholes = new Set([...hex.inherentWormholes, ...(hex.customWormholes || [])]);
    console.log('assignSystem: after manual union', hexID, {
      inherentWormholes: Array.from(hex.inherentWormholes),
      customWormholes: Array.from(hex.customWormholes),
      wormholes: Array.from(hex.wormholes)
    });
  }
  // Draw overlays for all wormholes (inherent + custom)
  hex.wormholeOverlays?.forEach(o => { if (o.parentNode) o.parentNode.removeChild(o); });
  hex.wormholeOverlays = [];
  Array.from(hex.wormholes).forEach((w, i) => {
    const positions = editor.effectIconPositions;
    const len = positions.length;
    const reversedIndex = len - 1 - (i % len);
    const pos = positions[reversedIndex] || { dx: 0, dy: 0 };
    const overlay = (typeof createWormholeOverlay === 'function')
      ? createWormholeOverlay(hex.center.x + pos.dx, hex.center.y + pos.dy, w.toLowerCase())
      : null;
    if (overlay) {
      // Tag overlay group with hex label for easy removal
      overlay.setAttribute('data-label', hexID);
      const wormholeIconLayer = editor.svg.querySelector('#wormholeIconLayer');
      if (wormholeIconLayer) {
        wormholeIconLayer.appendChild(overlay);
      } else {
        editor.svg.appendChild(overlay);
      }
      hex.wormholeOverlays.push(overlay);
      console.log('assignSystem: drew overlay', hexID, w);
    } else {
      console.warn('assignSystem: failed to create overlay', hexID, w);
    }
  });

  console.log('assignSystem');

  updateTileImageLayer(editor);
  enforceSvgLayerOrder(editor.svg);

}
