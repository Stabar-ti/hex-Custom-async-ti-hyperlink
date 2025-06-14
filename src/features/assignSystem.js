// features/assignSystem.js

import { toggleWormhole } from '../features/wormholes.js';

/**
 * Assigns a system (from JSON) to a specific hex tile, reusing import-sector-type logic.
 * - Clears existing overlays/effects
 * - Applies base type, effects, and inherent wormholes
 * @param {HexEditor} editor
 * @param {Object} sys  System object from sectorIDLookup
 * @param {string} hexID  Three-digit hex identifier (e.g. '065')
 */
export function assignSystem(editor, sys, hexID) {
  const hex = editor.hexes[hexID];
  if (!hex) return;

  // 1) Clear existing visuals
  editor.clearAll(hexID);

  // 2) Attach realId and DOM attribute
  hex.realId = sys.id;
  hex.planets = sys.planets || [];

  const el = document.getElementById(hexID);
  if (el) el.dataset.realId = sys.id.toString();

  // 3) Determine and set baseType
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
  editor.setSectorType(hexID, baseType);

  // 4) Apply effects from JSON flags
  if (sys.isNebula)        editor.applyEffect(hexID, 'nebula');
  if (sys.isGravityRift)   editor.applyEffect(hexID, 'rift');
  if (sys.isSupernova)     editor.applyEffect(hexID, 'supernova');
  if (sys.isAsteroidField) editor.applyEffect(hexID, 'asteroid');

  hex.inherentWormholes = new Set(sys.wormholes || []); 

  // 5) Add inherent wormholes
  (sys.wormholes || []).forEach(wh => {
    toggleWormhole(editor, hexID, wh.toLowerCase());
  });
}