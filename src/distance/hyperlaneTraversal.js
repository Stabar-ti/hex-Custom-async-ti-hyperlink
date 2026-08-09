/**
 * Walking hyperlane conduits.
 *
 * A conduit tile carries a 6x6 matrix where `matrix[entry][exit] === 1` wires
 * one edge to another; `matrix[d][d] === 1` is a self-loop. Conduits are not
 * systems, so crossing a chain of them costs no movement — the walk below finds
 * every ordinary tile you pop out at, and the caller gives them all the distance
 * of the hex that entered the chain.
 */
import { dbg } from './debug.js';
import { oppositeSide, hasAxialCoords } from '../utils/hexGrid.js';
import { labelAt } from './mapIndex.js';
import { isHyperlaneConduit, isPassable, isBlocked, hasAnomaly } from './movementRules.js';
import { borderAnomalyBlocks } from './borderAnomalyRules.js';

/**
 * Every ordinary tile reachable by following the conduit chain that starts at
 * `startLabel`, entered through `startEntryDir`.
 *
 * @returns {Array<{label:string, fromLabel:string, entrySide:number}>}
 *   `fromLabel` is the conduit the ship exits from and `entrySide` the side of
 *   the destination it arrives through — the caller needs both to run the
 *   border-anomaly check on that final hop.
 */
export function mapHyperlaneReachables(ctx, startLabel, startEntryDir) {
  const { editor, opts, index } = ctx;
  const seen = new Set();
  const reachable = [];
  const queue = [{ label: startLabel, entryDir: startEntryDir }];

  while (queue.length) {
    const { label, entryDir } = queue.shift();
    const tile = editor.hexes[label];
    const matrix = index.matrixOf(label);
    // A conduit has to sit on the grid for "the tile across side N" to mean
    // anything — corner hexes have no coordinates.
    if (!tile || !matrix || !hasAxialCoords(tile)) continue;

    const key = `${label}:${entryDir}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Sides of this tile that loop back on themselves.
    const loopDirs = [];
    for (let d = 0; d < 6; d++) {
      if (matrix[d][d] === 1) loopDirs.push(d);
    }

    // Where this entry side wires to.
    const exits = [];
    let hasNonLoopExit = false;
    for (let exit = 0; exit < 6; exit++) {
      if (matrix[entryDir][exit] === 1 && exit !== entryDir) {
        exits.push(exit);
        hasNonLoopExit = true;
      }
    }
    // A side wired only to itself sends the ship straight back out.
    if (!hasNonLoopExit && matrix[entryDir][entryDir] === 1) exits.push(entryDir);

    // Self-loops on the same tile chain to one another.
    if (loopDirs.includes(entryDir)) {
      for (const other of loopDirs) {
        if (other !== entryDir) {
          exits.push(other);
          queue.push({ label, entryDir: other });
        }
      }
    }

    for (const exit of [...new Set(exits)]) {
      const outDir = editor.edgeDirections[exit];
      const farLabel = labelAt(index, tile.q + outDir.q, tile.r + outDir.r);
      const far = farLabel ? editor.hexes[farLabel] : null;
      if (!far || !farLabel) continue;

      // Hop from one conduit to the next. The final hop onto an ordinary tile
      // is checked by the caller through the normal blocker chain.
      if (opts.useBorderAnomalies && isHyperlaneConduit(far)
        && borderAnomalyBlocks(tile, far, exit, ctx.anomalyRules)) {
        dbg(`[HL Blocked] ${label} -> ${farLabel} (exit ${exit})`);
        continue;
      }

      if (isHyperlaneConduit(far)) {
        dbg(`[HL Chain] ${label} -> ${farLabel} (exit ${exit})`);
        queue.push({ label: farLabel, entryDir: oppositeSide(exit) });
      } else if (isPassable(far, opts)) {
        dbg(`[HL End] ${label} -> ${farLabel} (exit ${exit})`);
        reachable.push({ label: farLabel, fromLabel: label, entrySide: oppositeSide(exit) });
      }
    }
  }

  return reachable.filter(o => o.label !== startLabel);
}

/**
 * Walk the conduit chain entered at `entryLabel`/`entryDir` and record every
 * ordinary tile it opens up at distance `dist`.
 *
 * Crossing conduits is free, so the endpoints get the SAME distance as the hex
 * that entered the chain rather than one more.
 *
 * @param {object} state    - `{ visited }`, mutated in place
 * @param {Function} onRift - called with a destination that is a gravity rift,
 *                            instead of visiting it directly; the two callers
 *                            handle rifts differently.
 */
export function expandHyperlaneEndpoints(ctx, state, { entryLabel, entryDir, dist, nextLayer, onRift }) {
  const { editor, opts } = ctx;
  const { visited } = state;

  for (const { label: dest, fromLabel, entrySide } of mapHyperlaneReachables(ctx, entryLabel, entryDir)) {
    const destHex = editor.hexes[dest];
    const exitHex = editor.hexes[fromLabel];
    if (!destHex || visited.has(dest) || !isPassable(destHex, opts)) continue;

    // The ship arrives at `dest` through `entrySide`, so it leaves the last
    // conduit across the opposite side.
    const edge = { dirIdx: oppositeSide(entrySide), isSource: false, fromLabel, toLabel: dest };
    if (isBlocked(ctx, exitHex, destHex, edge)) {
      dbg(`  [Blocked Hyperlane] at ${fromLabel} to ${dest}`);
      continue;
    }

    if (opts.useRift && hasAnomaly(destHex, 'rift') && isPassable(destHex, opts)) {
      onRift(dest);
      continue;
    }

    dbg(`  [HL Step] from ${fromLabel} to ${dest}`);
    visited.set(dest, dist);
    nextLayer.add(dest);
  }
}
