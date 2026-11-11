// @ts-check
/**
 * A per-query, read-only snapshot of the map.
 *
 * Building this once per call is what keeps neighbour lookup O(1) — the rest of
 * the codebase still resolves neighbours with `Object.values(hexes).find(...)`,
 * which is O(n) per side.
 *
 * IMPORTANT: the index is per query. Do not hoist it to module scope — the
 * hyperlane editor mutates `hex.matrix` between calls and a shared cache would
 * serve stale links.
 */
import { buildCoordIndex } from '../utils/hexGrid.js';
import { cloneMatrix } from '../modules/Hyperlanes/hyperlaneModel.js';
import { parseWormholeKey, wormholeArrives } from '../constants/constants.js';
import { bridgeSides, hasBridge, normalizedBridge } from '../modules/Hyperlanes/bridgeModel.js';
import { canHoldPortals, hasPortals, letsShipsArrive } from '../modules/Hyperlanes/portalModel.js';
import { isHyperlaneConduit } from './movementRules.js';

/**
 * `wormholeIndex` maps a wormhole type to the labels a link of that type can ARRIVE at.
 *
 * @param {object} editor
 * @returns {{
 *   coordToLabel: Map<string,string>,
 *   wormholeIndex: Map<string,Set<string>>,
 *   matrixOf: (label:string) => number[][]|null,
 *   bridgeOf: (label:string) => number[][]|null,
 *   laneSidesOf: (label:string) => number[],
 *   portalsOf: (label:string) => Array<{slot:number, letter:string, flow:string}>,
 *   portalTargets: (letter:string) => string[],
 * }}
 */
export function buildMapIndex(editor) {
  // Corner hexes (TL/TR/BL/BR) have q/r of null and are deliberately absent
  // from this index — see buildCoordIndex.
  const coordToLabel = buildCoordIndex(editor.hexes);
  const wormholeIndex = new Map();      // wormhole type -> Set<label> it can arrive at
  const matrixCache = new Map();        // label -> matrix copy, or null

  // An exit-only wormhole ('alpha:out') is somewhere a link can end, never start; an
  // entry-only one ('alpha:in') the reverse. Departures are read off the source hex in
  // wormholeNeighbors, so only arrivals are indexed here.
  for (const [label, h] of Object.entries(editor.hexes)) {
    if (h.wormholes?.size) {
      for (const key of h.wormholes) {
        if (!wormholeArrives(key)) continue;
        const { type } = parseWormholeKey(key);
        if (!type) continue;
        if (!wormholeIndex.has(type)) wormholeIndex.set(type, new Set());
        wormholeIndex.get(type).add(label);
      }
    }
  }

  /**
   * A hex's hyperlane matrix as it is stored: a lane set in one direction only is one-way,
   * and the traversal follows it that way only, as the bot's movement does. (It used to be
   * symmetrised here, from when every lane was meant two-way; saves from that time are
   * mirrored on load instead — see importFullState.)
   *
   * Returns a fresh copy and never touches `hex.matrix`. That matters: this used to
   * symmetrize in place, so a read-only distance query silently rewrote map data — and
   * since export.js handed out the same array by reference, the damage reached saved maps.
   */
  function matrixOf(label) {
    if (matrixCache.has(label)) return matrixCache.get(label);
    const m = editor.hexes[label]?.matrix;
    const copy = m ? cloneMatrix(m) : null;
    matrixCache.set(label, copy);
    return copy;
  }

  // Bridges: lanes through a SYSTEM (a conduit's own lanes are its matrix). Portals: on a
  // hyperlane that can hold them (a roundabout, or an empty interchange), as the bot's
  // HyperlanePortals.slotsOf. `portalArrivals` maps a letter to where a ship can arrive.
  const bridges = new Map();
  const portals = new Map();
  const portalArrivals = new Map();
  for (const [label, h] of Object.entries(editor.hexes)) {
    if (hasBridge(h) && !isHyperlaneConduit(h)) {
      const b = normalizedBridge(h.bridge);
      if (b) bridges.set(label, { matrix: b, sides: bridgeSides(b) });
    }
    if (hasPortals(h) && isHyperlaneConduit(h) && canHoldPortals(h.matrix)) {
      portals.set(label, h.portals);
      for (const p of h.portals) {
        if (!letsShipsArrive(p)) continue;
        if (!portalArrivals.has(p.letter)) portalArrivals.set(p.letter, []);
        portalArrivals.get(p.letter).push(label);
      }
    }
  }
  const bridgeOf = (label) => bridges.get(label)?.matrix ?? null;
  const laneSidesOf = (label) => bridges.get(label)?.sides ?? [];
  const portalsOf = (label) => portals.get(label) ?? [];
  const portalTargets = (letter) => portalArrivals.get(letter) ?? [];

  return { coordToLabel, wormholeIndex, matrixOf, bridgeOf, laneSidesOf, portalsOf, portalTargets };
}

/** Label at the given axial coordinate, or null. */
export function labelAt(index, q, r) {
  return index.coordToLabel.get(`${q},${r}`) ?? null;
}
