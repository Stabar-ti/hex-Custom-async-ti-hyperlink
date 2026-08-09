/**
 * Gravity rift movement rules.
 *
 * A rift grants +1 movement to anything leaving it, which the layered BFS models
 * three ways:
 *
 *   1. A whole connected cluster of rifts shares ONE distance (flood), because
 *      once you are in the cluster the bonus carries you across it.
 *   2. Every flooded rift immediately expands one step further at the same
 *      distance — that is the bonus itself.
 *   3. A rift sitting exactly at max distance still reaches one hex beyond it.
 *
 * A source ON a rift gets the bonus for every path, which is handled by running
 * the whole search one layer deeper and shifting the answers back down.
 */
import { dbg } from './debug.js';
import { oppositeSide } from '../utils/hexGrid.js';
import { collectNeighbors } from './neighborProviders.js';
import { isBlocked, isPassable, isHyperlaneConduit, hasAnomaly } from './movementRules.js';
import { expandHyperlaneEndpoints } from './hyperlaneTraversal.js';

/**
 * Give `label` and every rift connected to it the same distance.
 * Recursive; `floodedRifts` collects everything it touched so the caller can
 * expand outward from each one.
 */
export function floodRiftCluster(ctx, state, label, dist, nextLayer, floodedRifts) {
  const { editor, opts } = ctx;
  const { visited } = state;
  const hex = editor.hexes[label];

  if (!isPassable(hex, opts)) return;
  if (visited.has(label)) return;

  dbg(` [RIFT Flood] ${label}`);
  visited.set(label, dist);
  nextLayer.add(label);
  floodedRifts.add(label);

  for (const { label: nLabel, hex: neighbor, dirIdx } of collectNeighbors(ctx, hex, label)) {
    if (hasAnomaly(neighbor, 'rift') && !visited.has(nLabel)) {
      const edge = { dirIdx, isSource: false, fromLabel: label, toLabel: nLabel };
      if (isBlocked(ctx, hex, neighbor, edge)) continue;
      floodRiftCluster(ctx, state, nLabel, dist, nextLayer, floodedRifts);
    }
  }
}

/**
 * The rift bonus: one free step out of every rift reached this layer.
 *
 * NOTE: `floodedRifts` is deliberately iterated while it is still being added
 * to — a hyperlane out of a rift can land in another rift, which floods and
 * appends here. Set iteration observes those appends, and that is load-bearing:
 * snapshotting the set first would silently drop rift-through-hyperlane-into-rift.
 */
export function expandFromFloodedRifts(ctx, state, dist, nextLayer, floodedRifts) {
  const { editor, opts } = ctx;
  const { visited } = state;

  for (const riftLabel of floodedRifts) {
    const riftHex = editor.hexes[riftLabel];

    for (const { label: outLabel, hex: outNeighbor, dirIdx } of collectNeighbors(ctx, riftHex, riftLabel)) {
      if (visited.has(outLabel)) continue;

      const edge = { dirIdx, isSource: false, fromLabel: riftLabel, toLabel: outLabel };
      if (isBlocked(ctx, riftHex, outNeighbor, edge)) {
        dbg(` [Blocked from Rift] ${riftLabel} to ${outLabel}`);
        continue;
      }

      if (!hasAnomaly(outNeighbor, 'rift') && isPassable(outNeighbor, opts)) {
        dbg(` [RIFT Step] ${riftLabel} -> ${outLabel} (dir ${dirIdx})`);
        visited.set(outLabel, dist);
        nextLayer.add(outLabel);
      }

      if (isHyperlaneConduit(outNeighbor) && dirIdx != null) {
        dbg(` [RIFT Hyperlane] from ${outLabel} (entry ${oppositeSide(dirIdx)})`);
        expandHyperlaneEndpoints(ctx, state, {
          entryLabel: outLabel,
          entryDir: oppositeSide(dirIdx),
          dist,
          nextLayer,
          onRift: dest => floodRiftCluster(ctx, state, dest, dist, nextLayer, floodedRifts),
        });
      }
    }
  }
}

/**
 * Backstop for a rift sitting exactly at max distance.
 *
 * READ THIS BEFORE "FIXING" IT. Unlike `expandFromFloodedRifts` above, this does
 * not handle hyperlane conduits — and it does not need to. The main loop runs
 * `dist <= effectiveMaxDist`, and every layer ends by flooding the rifts reached
 * in it and calling `expandFromFloodedRifts`, conduits included. So a rift at the
 * limit has already taken its free step, through a conduit or otherwise, before
 * this ever runs. Every path that visits a rift goes through `floodRiftCluster`,
 * which always records it in `floodedRifts`, so there is nothing left over.
 *
 * It is kept as a cheap guard in case a future provider visits a rift by some
 * other route. Instrumented across the whole suite it fires zero times; the
 * rift-at-the-limit-through-a-conduit cases are pinned in test-distances.js §10.
 *
 * `visited` is snapshotted first so this cannot cascade into a second layer.
 */
export function riftOneStepOut(ctx, state, effectiveMaxDist) {
  const { editor, opts } = ctx;
  const { visited } = state;
  if (!opts.useRift) return;

  for (const [label, distValue] of [...visited]) {
    if (distValue !== effectiveMaxDist) continue;
    const current = editor.hexes[label];
    if (!hasAnomaly(current, 'rift')) continue;

    for (const { label: nLabel, hex: neighbor, dirIdx } of collectNeighbors(ctx, current, label)) {
      if (visited.has(nLabel)) continue;
      const edge = { dirIdx, isSource: false, fromLabel: label, toLabel: nLabel };
      if (isBlocked(ctx, current, neighbor, edge)) continue;
      if (isPassable(neighbor, opts)) {
        dbg(`[RIFT "One Step Out"] ${label} -> ${nLabel}`);
        visited.set(nLabel, effectiveMaxDist);
      }
    }
  }
}

/**
 * When the source is itself a rift the search runs one layer deeper; pull every
 * non-zero answer back down by one to compensate.
 */
export function applyRiftSourceShift(visited) {
  const shifted = {};
  for (const [label, d] of visited) {
    shifted[label] = d === 0 ? 0 : Math.max(1, d - 1);
  }
  return shifted;
}
