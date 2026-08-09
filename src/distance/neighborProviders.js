/**
 * Neighbour providers — every way one hex can be adjacent to another.
 *
 * A provider is `(ctx, hex, label) => Array<Edge>`, where an Edge is
 *
 *   { label, hex, dirIdx, kind }
 *
 * `dirIdx` is the physical side 0..5 the move crosses, or null for links that
 * are not geometric (wormholes, custom links, adjacency overrides). Border
 * anomalies sit on physical edges, so a null `dirIdx` means "cannot be blocked
 * by a border anomaly".
 *
 * `ctx` is `{ editor, opts, index, ruleset }` — see bfs.js.
 */
import { dbg } from './debug.js';
import { hasAxialCoords } from '../utils/hexGrid.js';
import { labelAt } from './mapIndex.js';

/**
 * The six physical grid edges.
 *
 * Hexes without axial coordinates have none. The four corner tiles (TL/TR/BL/BR)
 * sit outside the grid with `q: null, r: null`; arithmetic on those yields
 * `null + dir.q === dir.q`, which made a corner look adjacent to the six hexes
 * ringing the map's origin. A corner is still reachable through the non-geometric
 * providers below — it just has no physical neighbours.
 */
export function axialNeighbors(ctx, hex, _label) {
  const { editor, index } = ctx;
  if (!hasAxialCoords(hex)) return [];
  const out = [];
  for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
    const dir = editor.edgeDirections[dirIdx];
    const label = labelAt(index, hex.q + dir.q, hex.r + dir.r);
    if (!label) continue;
    out.push({ label, hex: editor.hexes[label], dirIdx, kind: 'axial' });
  }
  return out;
}

/**
 * User-drawn custom adjacency links (customLinksUI).
 *
 * Direction is already encoded by the storage shape: a one-way A->B writes an
 * entry on A only, a two-way writes one on each. So an entry on THIS hex is the
 * whole condition — the engine used to additionally require that the target had
 * no entry pointing back, which silently cancelled both edges when a user drew
 * A->B and B->A as two separate one-way links.
 */
export function customLinkNeighbors(ctx, hex, _label) {
  const { editor, opts } = ctx;
  if (!opts.useCustomLinks || !hex.customAdjacents) return [];
  const out = [];
  for (const targetLabel of Object.keys(hex.customAdjacents)) {
    // The target can be gone — a ring shrink deletes hexes without cleaning up
    // links that point at them.
    const target = editor.hexes[targetLabel];
    if (!target) continue;
    out.push({ label: targetLabel, hex: target, dirIdx: null, kind: 'custom' });
  }
  return out;
}

/** Every other hex sharing a wormhole type with this one. */
export function wormholeNeighbors(ctx, hex, label) {
  const { editor, index, opts } = ctx;
  if (!opts.useWormholes || !hex.wormholes?.size) return [];
  const out = [];
  for (const type of hex.wormholes) {
    const matching = index.wormholeIndex.get(type);
    if (!matching) continue;
    for (const other of matching) {
      if (other !== label) {
        out.push({ label: other, hex: editor.hexes[other], dirIdx: null, kind: 'wormhole' });
      }
    }
  }
  return out;
}

/** Explicit per-side adjacency overrides (bonus links; never blocked). */
export function adjacencyOverrideNeighbors(ctx, hex, _label) {
  const { editor, opts } = ctx;
  if (!opts.useAdjacencyOverrides || !hex.adjacencyOverrides) return [];
  const out = [];
  for (const neighborLabel of Object.values(hex.adjacencyOverrides)) {
    const neighbor = editor.hexes[neighborLabel];
    if (neighbor) out.push({ label: neighborLabel, hex: neighbor, dirIdx: null, kind: 'override' });
  }
  return out;
}

export const DEFAULT_PROVIDERS = Object.freeze([
  axialNeighbors,
  customLinkNeighbors,
  wormholeNeighbors,
  adjacencyOverrideNeighbors,
]);

/**
 * Run every provider and merge the results.
 *
 * Two hexes can be connected by more than one mechanism at once — adjacent on
 * the grid AND sharing a wormhole, say — and those connections are independent:
 * a Spatial Tear closes the physical border but says nothing about the wormhole.
 * So edges are deduped per (target, side, mechanism), not per target, and the
 * search tries each in turn until one is not blocked.
 *
 * Providers run in a fixed order, so the cheapest and most specific edge (the
 * physical one, which carries a side index and can be blocked) is always tried
 * before the non-geometric ones.
 */
export function collectNeighbors(ctx, hex, label) {
  const results = [];
  for (const provider of ctx.ruleset.providers) {
    const provided = provider(ctx, hex, label);
    dbg('[getNeighbors] Provider:', provider.name || 'anonymous', 'from', label, 'results:', provided?.length);
    for (const edge of provided) results.push(edge);
  }
  const seen = new Set();
  return results.filter(edge => {
    const key = `${edge.label}|${edge.dirIdx ?? 'x'}|${edge.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
