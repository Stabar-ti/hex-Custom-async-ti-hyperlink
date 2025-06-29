// features/assignSystem.js
import { toggleWormhole } from '../features/wormholes.js';

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
  // console.log('assignSystem: called for', hexID, sys);

  // 1. Remove ALL old state/overlays before assignment.
  editor.clearAll(hexID);
  // console.log('assignSystem: after clearAll', {...hex});

  // 2. Set new realID and planet data
  hex.realId = sys.id;
  hex.planets = sys.planets || [];
  //   console.log('assignSystem: after assigning realId and planets', {...hex});

  // 3. Update DOM for overlays if needed
  const el = document.getElementById(hexID);
  if (el) el.dataset.realId = sys.id.toString();

  // 4. Classify sector type for color and overlays
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

  // 5. Effects overlays
  if (sys.isNebula) editor.applyEffect(hexID, 'nebula');
  if (sys.isGravityRift) editor.applyEffect(hexID, 'rift');
  if (sys.isSupernova) editor.applyEffect(hexID, 'supernova');
  if (sys.isAsteroidField) editor.applyEffect(hexID, 'asteroid');

  // 6. Inherent wormholes (always lowercase for key)
  // Make sure sys.wormholes is always an array for the rest of the function
  const wormholes = Array.isArray(sys.wormholes) ? sys.wormholes : [];
  hex.inherentWormholes = new Set(
    wormholes.filter(w => typeof w === "string").map(w => w.toLowerCase())
  );
  wormholes.forEach(wh => {
    if (typeof wh === "string") {
      toggleWormhole(editor, hexID, wh.toLowerCase());
    }
  });

}
