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
import { symmetrised } from '../modules/Hyperlanes/hyperlaneModel.js';

/**
 * @param {object} editor
 * @returns {{
 *   coordToLabel: Map<string,string>,
 *   wormholeIndex: Map<string,Set<string>>,
 *   matrixOf: (label:string) => number[][]|null,
 * }}
 */
export function buildMapIndex(editor) {
  // Corner hexes (TL/TR/BL/BR) have q/r of null and are deliberately absent
  // from this index — see buildCoordIndex.
  const coordToLabel = buildCoordIndex(editor.hexes);
  const wormholeIndex = new Map();      // wormhole type -> Set<label>
  const symCache = new Map();           // label -> symmetrized matrix, or null

  for (const [label, h] of Object.entries(editor.hexes)) {
    if (h.wormholes?.size) {
      for (const type of h.wormholes) {
        if (!wormholeIndex.has(type)) wormholeIndex.set(type, new Set());
        wormholeIndex.get(type).add(label);
      }
    }
  }

  /**
   * Hyperlane matrices may be stored one way round (older saves, and imports that
   * predate symmetric writing) but a conduit is traversable in both directions,
   * so the walk needs the symmetric closure.
   *
   * `symmetrised` returns a fresh matrix and never touches `hex.matrix`. That
   * matters: this used to symmetrize in place, so a read-only distance query
   * silently rewrote map data — and since export.js handed out the same array by
   * reference, the damage reached saved maps.
   */
  function matrixOf(label) {
    if (symCache.has(label)) return symCache.get(label);
    const m = editor.hexes[label]?.matrix;
    const sym = m ? symmetrised(m) : null;
    symCache.set(label, sym);
    return sym;
  }

  return { coordToLabel, wormholeIndex, matrixOf };
}

/** Label at the given axial coordinate, or null. */
export function labelAt(index, q, r) {
  return index.coordToLabel.get(`${q},${r}`) ?? null;
}
