// @ts-check
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
import { bridgeExitsFrom } from '../modules/Hyperlanes/bridgeModel.js';
import { letsShipsLeave } from '../modules/Hyperlanes/portalModel.js';

/**
 * Whether a ship arriving on a roundabout spoke `side` is on (or, leaving, can leave) the
 * ring: the side loops to itself, and a one-way spoke only counts the way it runs
 * (GridRule.ringSpokes, movement — not both ways).
 */
export function isRingSpoke(matrix, side, leavingTheRing) {
  if (!matrix || matrix[side]?.[side] !== 1) return false;
  let into = false, outOf = false;
  for (let other = 0; other < 6; other++) {
    if (other === side) continue;
    into ||= matrix[side][other] === 1;
    outOf ||= matrix[other][side] === 1;
  }
  return into === outOf || (leavingTheRing ? outOf : into);
}

/**
 * The side of `label` a ship crossing side `dirIdx` (of the hex it comes from) enters
 * through, when that side is one of the hex's bridge lane sides — or null. Entering there,
 * the ship does not stop in the system: it runs on along the bridge (GridRule.enter).
 */
export function bridgeEntrySide(ctx, label, dirIdx) {
  if (dirIdx == null) return null;
  const side = oppositeSide(dirIdx);
  return ctx.index.laneSidesOf(label).includes(side) ? side : null;
}

/**
 * Every ordinary tile reachable by following the conduit chain that starts at
 * `startLabel`, entered through `startEntryDir`.
 *
 * The chain is made of three kinds of step, all free:
 *   - a hyperlane tile: its matrix says where the entry side leads;
 *   - a bridged system entered by a lane side: its bridge says (the system itself is not
 *     reached that way — GridRule.passThrough);
 *   - a portal ring: a ship on a roundabout's ring (or arriving at an interchange) can jump
 *     to every other ring with the same letter, then leave by that ring's spokes or its
 *     other portals (GridRule.throughPortals / fromTheRing).
 *
 * Border anomalies only count where a lane starts or ends: not between a hyperlane or a
 * bridge and the bridge lane it runs on into.
 *
 * @returns {Array<{label:string, fromLabel:string, entrySide:number, alongBridge:boolean}>}
 *   `fromLabel` is the conduit the ship exits from and `entrySide` the side of
 *   the destination it arrives through — the caller needs both to run the
 *   border-anomaly check on that final hop. `alongBridge`: `fromLabel` is a bridged
 *   system the ship only ran along the rim of, never entered.
 */
export function mapHyperlaneReachables(ctx, startLabel, startEntryDir) {
  const { editor, opts, index } = ctx;
  const seen = new Set();
  const reachable = [];
  const startsOnBridge = !isHyperlaneConduit(editor.hexes[startLabel])
    && index.laneSidesOf(startLabel).includes(startEntryDir);
  /** @type {Array<{label: string, entryDir: number, kind: string}>} */
  const queue = [{ label: startLabel, entryDir: startEntryDir, kind: startsOnBridge ? 'bridge' : 'lane' }];

  /** Ships on `label`'s ring jump to every other ring sharing a letter they may use. */
  const jumpThroughPortals = (label) => {
    seen.add(`${label}#portal`);
    for (const departure of index.portalsOf(label)) {
      if (!letsShipsLeave(departure)) continue;
      for (const target of index.portalTargets(departure.letter)) {
        if (seen.has(`${target}#portal`)) continue;
        dbg(`[Portal] ${label} -${departure.letter}-> ${target}`);
        queue.push({ label: target, entryDir: -1, kind: 'ring' });
        seen.add(`${target}#portal`);
      }
    }
  };

  while (queue.length) {
    const { label, entryDir, kind } = /** @type {{label: string, entryDir: number, kind: string}} */ (queue.shift());
    const tile = editor.hexes[label];
    // A conduit has to sit on the grid for "the tile across side N" to mean
    // anything — corner hexes have no coordinates.
    if (!tile || !hasAxialCoords(tile)) continue;

    const key = `${label}:${entryDir}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const matrix = index.matrixOf(label);
    const exits = [];
    if (kind === 'bridge') {
      const bridge = index.bridgeOf(label);
      if (bridge) exits.push(...bridgeExitsFrom(bridge, entryDir));
    } else if (kind === 'ring') {
      // Arrived through a portal: leave by the ring's spokes, or chain through its portals.
      for (let side = 0; side < 6; side++) if (isRingSpoke(matrix, side, true)) exits.push(side);
      jumpThroughPortals(label);
    } else {
      if (!matrix) continue;
      // Sides of this tile that loop back on themselves.
      const loopDirs = [];
      for (let d = 0; d < 6; d++) {
        if (matrix[d][d] === 1) loopDirs.push(d);
      }

      // Where this entry side wires to.
      let hasNonLoopExit = false;
      for (let exit = 0; exit < 6; exit++) {
        if (matrix[entryDir][exit] === 1 && exit !== entryDir) {
          exits.push(exit);
          hasNonLoopExit = true;
        }
      }
      // A side wired only to itself sends the ship straight back out.
      if (!hasNonLoopExit && matrix[entryDir][entryDir] === 1) exits.push(entryDir);

      // Self-loops on the same tile chain to one another — but only on a roundabout drawn
      // the old way, with its diagonal cells alone. One written the bot's way carries every
      // entry → exit cell itself (connectRoundabout), one-way sides included, so it is
      // followed as written, as the bot's GridRule does.
      const explicitRoundabout = loopDirs.some(i => loopDirs.some(j => i !== j && matrix[i][j] === 1));
      if (!explicitRoundabout && loopDirs.includes(entryDir)) {
        for (const other of loopDirs) {
          if (other !== entryDir) {
            exits.push(other);
            queue.push({ label, entryDir: other, kind: 'lane' });
          }
        }
      }

      // Onto the ring by a spoke: its portals are open too.
      if (index.portalsOf(label).length && isRingSpoke(matrix, entryDir, false)) jumpThroughPortals(label);
    }

    for (const exit of [...new Set(exits)]) {
      const outDir = editor.edgeDirections[exit];
      const farLabel = labelAt(index, tile.q + outDir.q, tile.r + outDir.r);
      const far = farLabel ? editor.hexes[farLabel] : null;
      if (!far || !farLabel) continue;
      const farEntry = oppositeSide(exit);

      // On along a bridge: no border check, the lane runs straight on (GridRule.step and
      // laneContinuesInto).
      if (!isHyperlaneConduit(far) && index.laneSidesOf(farLabel).includes(farEntry)) {
        dbg(`[Bridge] ${label} -> ${farLabel} (enters ${farEntry})`);
        queue.push({ label: farLabel, entryDir: farEntry, kind: 'bridge' });
        continue;
      }

      // Hop from one conduit to the next. The final hop onto an ordinary tile
      // is checked by the caller through the normal blocker chain. A bridge running on
      // into a hyperlane is one lane, so no border counts there either.
      if (opts.useBorderAnomalies && isHyperlaneConduit(far) && kind !== 'bridge'
        && borderAnomalyBlocks(tile, far, exit, ctx.anomalyRules)) {
        dbg(`[HL Blocked] ${label} -> ${farLabel} (exit ${exit})`);
        continue;
      }

      if (isHyperlaneConduit(far)) {
        dbg(`[HL Chain] ${label} -> ${farLabel} (exit ${exit})`);
        queue.push({ label: farLabel, entryDir: farEntry, kind: 'lane' });
      } else if (isPassable(far, opts)) {
        dbg(`[HL End] ${label} -> ${farLabel} (exit ${exit})`);
        reachable.push({ label: farLabel, fromLabel: label, entrySide: farEntry, alongBridge: kind === 'bridge' });
      }
    }
  }

  // A conduit start is never a destination; a bridged system can be one, by another side.
  return startsOnBridge ? reachable : reachable.filter(o => o.label !== startLabel);
}

/**
 * Walk the conduit chain entered at `entryLabel`/`entryDir` and record every
 * ordinary tile it opens up at distance `dist`.
 *
 * Crossing conduits is free, so the endpoints get the SAME distance as the hex
 * that entered the chain rather than one more.
 *
 * @param {object} state  - `{ visited }`, mutated in place
 * @param {object} opts   - the chain to walk, and where to put what it finds
 * @param {string} opts.entryLabel - conduit the chain is entered at
 * @param {number} opts.entryDir   - side of that conduit the ship enters through
 * @param {number} opts.dist       - distance recorded on every endpoint found
 * @param {Array}  opts.nextLayer  - BFS frontier the endpoints are appended to
 * @param {Function} opts.onRift   - called with a destination that is a gravity rift,
 *                                   instead of visiting it directly; the two callers
 *                                   handle rifts differently.
 */
export function expandHyperlaneEndpoints(ctx, state, { entryLabel, entryDir, dist, nextLayer, onRift }) {
  const { editor, opts } = ctx;
  const { visited } = state;

  for (const { label: dest, fromLabel, entrySide, alongBridge } of mapHyperlaneReachables(ctx, entryLabel, entryDir)) {
    const destHex = editor.hexes[dest];
    const exitHex = editor.hexes[fromLabel];
    if (!destHex || visited.has(dest) || !isPassable(destHex, opts)) continue;

    // The ship arrives at `dest` through `entrySide`, so it leaves the last
    // conduit across the opposite side.
    const edge = { dirIdx: oppositeSide(entrySide), isSource: false, fromLabel, toLabel: dest, alongBridge };
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
