// ───────────────────────────────────────────────────────────────
// ui/uiFilters.js
//
// Which tile ids are currently placed on the map.
//
// This file used to be 1,168 lines: the filter definitions, the column definitions, the
// table renderers, the sorters, and four copy-pasted versions of the same filter
// predicate, all reading their state back out of button elements. All of that now lives
// in src/modules/SystemPicker/, which owns the picker's UI and its state.
//
// What is left is the part that was never about filtering: a reference-counted set of
// placed tile ids. It stays here, at this path, for two reasons. It is map state rather
// than picker state — history, import, the copy/paste wizard and both auto-builders all
// maintain it, and it has to outlive any particular UI. And keeping the path means none
// of those eight modules needed editing.
//
// The name is now a small lie. Renaming it to usedTiles.js is a tidy-up worth doing, but
// it touches every one of those imports and belongs in its own commit.
// ───────────────────────────────────────────────────────────────

import { emitUsedIdsChanged } from '../modules/SystemPicker/pickerEvents.js';
import { passesFilter, autoMapperFilter } from '../modules/SystemPicker/pickerSelect.js';
import { getFilter } from '../modules/SystemPicker/pickerState.js';

/**
 * realID -> how many hexes currently carry it.
 *
 * A count rather than a Set because the same tile can legitimately be placed twice, and
 * removing one copy must not mark the other as free.
 */
export const usedRealIDs = new Map();

// Suspends the change notification during a bulk import, so loading a 60-hex map fires
// one update instead of sixty.
let _batchMode = false;

/** Call before a bulk import/reset to suspend UI updates. */
export function beginBatch() {
  _batchMode = true;
}

/**
 * Call after a bulk import/reset. Triggers one refresh.
 * @param {Function=} renderFn Optional custom renderer (defaults to refreshSystemList)
 */
export function endBatch(renderFn) {
  _batchMode = false;
  (renderFn || refreshSystemList)();
}

/**
 * Announce that the set of placed tile ids changed.
 *
 * Subscribers get the specific id that moved. This used to call window.renderSystemList(),
 * a global the old picker installed from inside its own constructor closure — so exactly
 * one view could ever react, and only while it happened to be open. Any number of
 * listeners can now, and none of them has to be reachable through a global.
 */
function announceUsedChange(detail) {
  emitUsedIdsChanged(detail);
}

/** Mark a realID as used, incrementing its reference count. */
export function markRealIDUsed(id) {
  usedRealIDs.set(id, (usedRealIDs.get(id) || 0) + 1);
  if (!_batchMode) announceUsedChange({ id, used: true });
}

/**
 * Decrement a realID's reference count, only clearing it from the used set once the last
 * copy of that tile is removed from the map.
 */
export function unmarkRealIDUsed(id) {
  const count = usedRealIDs.get(id) || 0;
  if (count <= 1) {
    usedRealIDs.delete(id);
  } else {
    usedRealIDs.set(id, count - 1);
  }
  if (!_batchMode) announceUsedChange({ id, used: usedRealIDs.has(id) });
}

/** Returns true if a realID is in use on the map. */
export function isRealIDUsed(id) {
  return usedRealIDs.has(id);
}

/** Clear all tracked realIDs (usually on map reset/import). */
export function clearRealIDUsage() {
  usedRealIDs.clear();
  if (!_batchMode) announceUsedChange({});
}

/**
 * "Something changed, re-render whatever is showing the tile list."
 *
 * Kept because history, the Milty builder and the AutoMapper all call it. It is now just
 * the event — the old body rebuilt the entire filtered-and-searched list and then threw
 * both results away, so every tile placement, every undo and every step of a map import
 * paid for a full 671-system filter pass whose output was unreachable.
 */
export function refreshSystemList() {
  announceUsedChange({});
}

/**
 * Whether a system may be placed automatically by the AutoMapper or the Milty builder.
 *
 * This is the picker's live filter, projected: the user's source and faction-homeworld
 * choices are respected, but weird/FOW/blank tiles and hyperlanes are forced off no
 * matter what the picker shows — one of those landing in a generated map is always a bug,
 * never a request. See pickerSelect.autoMapperFilter.
 *
 * The old version read the filter buttons out of the DOM, so it silently allowed
 * everything whenever the picker was closed — which is the normal state of affairs while
 * generating a map.
 */
export function passesAutoMapperFilters(sys) {
  return passesFilter(sys, autoMapperFilter(getFilter()));
}

/** @deprecated Use passesAutoMapperFilters instead */
export const passesSourceFilter = passesAutoMapperFilters;
