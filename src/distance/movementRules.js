/**
 * Movement blockers and tile-occupancy rules.
 *
 * A blocker is `(ctx, fromHex, toHex, edge) => boolean`, where `edge` is
 * `{ dirIdx, isSource, fromLabel, toLabel }`. Returning true stops the move.
 *
 * Two distinct questions live here and are easy to confuse:
 *   isPassable  — may a ship END its move on this hex?
 *   blockers    — may a ship cross THIS edge, from that hex to this one?
 * Nebula is the reason both exist: you can enter a nebula but not leave it.
 */
import { dbg } from './debug.js';
import { borderAnomalyBlocks } from './borderAnomalyRules.js';

/** True when the hex has any hyperlane wiring at all. */
export function isHyperlane(hex) {
  return !!(hex?.matrix?.some(row => row.includes(1)));
}

/**
 * True when the hex is a pure hyperlane conduit — wiring, and no system.
 *
 * A conduit is not a system: ships pass through it for free and it never gets a
 * distance of its own. The two ways a conduit gets onto a map disagreed about
 * this for a long time. Tiles imported from AsyncTI4 keep `baseType: ''`, while
 * drawing links by hand sets `baseType: 'hyperlane'` (features/hyperlanes.js,
 * so the tile renders a darker grey). `isPassable` accepted the latter, so the
 * search stepped ONTO hand-drawn conduits — each one cost a movement point and
 * showed a number, and identical map geometry produced different distances
 * depending on how the hyperlane had been authored.
 */
export function isHyperlaneConduit(hex) {
  if (!isHyperlane(hex)) return false;
  return hex.baseType === '' || hex.baseType === 'hyperlane';
}

/**
 * Does this hex carry the given anomaly?
 *
 * An anomaly can be recorded two ways depending on how the hex was authored:
 * as an entry in `effects` (the effect-painting tools) or as the `baseType`
 * itself (importing a system whose type IS the anomaly). Both are the same
 * thing to a ship, so every rule has to ask about both — checking only one is
 * how a nebula ended up blocking movement on some maps and not others.
 */
export function hasAnomaly(hex, kind) {
  return !!hex && (hex.effects?.has(kind) || hex.baseType === kind);
}

/**
 * May a ship stop here?
 *
 * Deliberately has no "is this the source" escape hatch: the source hex is
 * seeded straight into the visited map and never tested. It used to take one,
 * and callers passed the flag belonging to the hex being expanded FROM rather
 * than the hex being tested — so on the first layer every neighbour of the
 * source skipped the anomaly check and a supernova next door looked reachable.
 */
export function isPassable(hex, opts) {
  if (!hex) return false;
  if (opts.useSupernova && hasAnomaly(hex, 'supernova')) return false;
  if (opts.useAsteroid && hasAnomaly(hex, 'asteroid')) return false;
  // Nebula is deliberately absent: it blocks leaving, not entering.
  if (hex.baseType === 'void') return false;
  // A conduit is crossed, not occupied — see isHyperlaneConduit.
  if (isHyperlaneConduit(hex)) return false;
  return hex.baseType !== '';
}

// ── blockers ──────────────────────────────────────────────────────────────────

export function borderAnomalyBlocker(ctx, fromHex, toHex, edge) {
  if (!ctx.opts.useBorderAnomalies) return false;
  if (!fromHex || !toHex) return false;
  return borderAnomalyBlocks(fromHex, toHex, edge?.dirIdx, ctx.anomalyRules);
}

/**
 * Nebula blocks moving OUT, not in — a ship that enters one is stuck there.
 * The source is exempt: a fleet already sitting in a nebula can still leave.
 */
export function nebulaBlocker(ctx, fromHex, toHex, edge) {
  if (!fromHex || !toHex) return false;
  return !edge?.isSource && ctx.opts.useNebula && hasAnomaly(fromHex, 'nebula');
}

/** Void tiles are not part of the map at all. */
export function voidBlocker(_ctx, fromHex, toHex) {
  if (!fromHex || !toHex) return false;
  return fromHex.baseType === 'void' || toHex.baseType === 'void';
}

/**
 * Supernova and asteroid fields need no blocker of their own: `isPassable`
 * already stops a ship ever standing on one, so there is no hex to be blocked
 * moving out of. There used to be such a blocker and it could never fire.
 */
export const DEFAULT_BLOCKERS = Object.freeze([
  borderAnomalyBlocker,
  nebulaBlocker,
  voidBlocker,
]);

/** True as soon as any blocker fires. */
export function isBlocked(ctx, fromHex, toHex, edge) {
  for (const blocker of ctx.ruleset.blockers) {
    if (blocker(ctx, fromHex, toHex, edge)) {
      dbg(`[BLOCKED] Move from ${edge?.fromLabel} to ${edge?.toLabel}` +
        (edge?.dirIdx != null ? ` (dir ${edge.dirIdx})` : ''),
      `by: ${blocker.name || 'anonymous'}`, 'edge:', edge);
      return true;
    }
  }
  return false;
}
