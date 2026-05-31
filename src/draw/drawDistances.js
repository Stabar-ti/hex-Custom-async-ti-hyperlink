// ---- DEBUGGING TOGGLE ----
const DEBUG_DIST = false; // Set to true to enable verbose pathfinding logs (covers BFS + hyperlanes)

function dbg(...args) {
  if (DEBUG_DIST) console.log(...args);
}

// ---- Pluggable neighbor providers & movement blockers ----

const neighborProviders = [];
const movementBlockers = [];

export function registerNeighborProvider(fn) {
  neighborProviders.push(fn);
}

export function registerMovementBlocker(fn) {
  movementBlockers.push(fn);
}

// Collect neighbors from all providers, deduplicate by label
function getNeighbors(editor, hex, currLabel, opts) {
  const results = [];
  for (const provider of neighborProviders) {
    const provided = provider(editor, hex, currLabel, opts);
    dbg(`[getNeighbors] Provider:`, provider.name || 'anonymous', 'from', currLabel, 'results:', provided?.length);
    for (const n of provided) results.push(n);
  }
  const seen = new Set();
  return results.filter(n => !seen.has(n.label) && seen.add(n.label));
}

// Return true if any blocker fires
function isBlocked(editor, fromHex, toHex, context, opts) {
  for (const blocker of movementBlockers) {
    if (blocker(editor, fromHex, toHex, context, opts)) {
      dbg(
        `[BLOCKED] Move from ${context?.fromLabel} to ${context?.toLabel}` +
        (context?.dirIdx !== undefined ? ` (dir ${context.dirIdx})` : ''),
        `by: ${blocker.name || 'anonymous'}`,
        'ctx:', context
      );
      return true;
    }
  }
  return false;
}

// ---- Hyperlane detection helper ----
function isHyperlane(hex) {
  return !!(hex?.matrix?.some(row => row.includes(1)));
}

// ---- Default core neighbor providers ----

// 1. Standard axial neighbors (0..5)
registerNeighborProvider((editor, hex, currLabel, opts) => {
  const arr = [];
  for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
    const dir = editor.edgeDirections[dirIdx];
    const label = opts?.coordToLabel?.get(`${hex.q + dir.q},${hex.r + dir.r}`);
    if (!label) continue;
    arr.push({ label, hex: editor.hexes[label], dirIdx });
  }
  return arr;
});

// 2. Custom adjacency links (if enabled)
registerNeighborProvider((editor, hex, currLabel, opts) => {
  if (!opts.useCustomLinks || !hex.customAdjacents) return [];
  const arr = [];
  for (const [targetLabel, info] of Object.entries(hex.customAdjacents)) {
    if (info.twoWay || !editor.hexes[targetLabel].customAdjacents?.[currLabel]) {
      arr.push({ label: targetLabel, hex: editor.hexes[targetLabel], dirIdx: null, isCustomLink: true });
    }
  }
  return arr;
});

// 3. Wormholes — uses pre-indexed wormholeIndex from opts for O(1) lookup
registerNeighborProvider((editor, hex, currLabel, opts) => {
  if (!hex.wormholes?.size) return [];
  const arr = [];
  for (const type of hex.wormholes) {
    const matching = opts?.wormholeIndex?.get(type);
    if (!matching) continue;
    for (const label of matching) {
      if (label !== currLabel) arr.push({ label, hex: editor.hexes[label], dirIdx: null, isWormhole: true });
    }
  }
  return arr;
});

// 4. Adjacency overrides (bonus links, no blocking)
registerNeighborProvider((editor, hex, currLabel, opts) => {
  if (!hex.adjacencyOverrides) return [];
  const arr = [];
  for (const neighborLabel of Object.values(hex.adjacencyOverrides)) {
    const neighbor = editor.hexes[neighborLabel];
    if (neighbor) arr.push({ label: neighborLabel, hex: neighbor, dirIdx: null, isAdjOverride: true });
  }
  return arr;
});

// ---- Default core movement blockers ----

// 1. Border anomalies (Spatial Tear & Gravity Wave)
// Stored type may be the ID ("SPATIALTEAR") or the legacy display name ("Spatial Tear") — normalize both.
function anomalyId(ba) { return (ba?.type ?? '').replace(/\s+/g, '').toUpperCase(); }

registerMovementBlocker((editor, fromHex, toHex, ctx, opts) => {
  if (!opts.useBorderAnomalies) return false;
  if (!fromHex || !toHex) return false;
  const dirIdx = ctx?.dirIdx;
  if (dirIdx == null) return false;
  const oppDir = (dirIdx + 3) % 6;

  // Spatial Tear: blocks both directions. Stored bidirectionally on both hexes.
  if (
    anomalyId(fromHex.borderAnomalies?.[dirIdx]) === 'SPATIALTEAR' ||
    anomalyId(toHex.borderAnomalies?.[oppDir]) === 'SPATIALTEAR'
  ) return true;

  // Gravity Wave: one-way. Stored only on the primary hex (first clicked).
  // Blocks ships from entering that hex through the wave edge (toHex has GW on its inbound side).
  if (anomalyId(toHex.borderAnomalies?.[oppDir]) === 'GRAVITYWAVE') return true;

  return false;
});

// 2. Supernova/asteroid (blocks movement out)
registerMovementBlocker((editor, fromHex, toHex, ctx, opts) => {
  if (!fromHex || !toHex) return false;
  if (!ctx?.isSource) {
    if (opts.useSupernova && (fromHex.effects?.has('supernova') || fromHex.baseType === 'supernova')) return true;
    if (opts.useAsteroid && (fromHex.effects?.has('asteroid') || fromHex.baseType === 'asteroid')) return true;
  }
  return false;
});

// 3. Nebula: block moving OUT, not IN
registerMovementBlocker((editor, fromHex, toHex, ctx, opts) => {
  if (!fromHex || !toHex) return false;
  if (!ctx?.isSource && opts.useNebula && fromHex.effects?.has('nebula')) return true;
  return false;
});

// 4. Void: block both ways
registerMovementBlocker((editor, fromHex, toHex, ctx, opts) => {
  if (!fromHex || !toHex) return false;
  if (fromHex.baseType === 'void' || toHex.baseType === 'void') return true;
  return false;
});

// ---- isPassable utility ----
function isPassable(hex, opts, isSource = false) {
  if (!hex) return false;
  if (!isSource) {
    if (opts.useSupernova && hex.effects?.has('supernova')) return false;
    if (opts.useAsteroid && hex.effects?.has('asteroid')) return false;
    // Do NOT block nebula here — nebula only blocks OUT (handled by movement blocker)
  }
  if (hex.baseType === 'void') return false;
  return hex.baseType !== '';
}

// ---- Main BFS ----

export function calculateDistancesFrom(
  editor,
  sourceLabel,
  maxDist = 3,
  opts = {}
) {
  dbg('\n========== DISTANCE CALCULATION BEGIN ==========');
  opts = {
    useCustomLinks:     editor.options?.useCustomLinks     ?? true,
    useBorderAnomalies: editor.options?.useBorderAnomalies ?? true,
    useSupernova:       editor.options?.useSupernova       ?? true,
    useRift:            editor.options?.useRift            ?? true,
    useNebula:          editor.options?.useNebula          ?? true,
    useAsteroid:        editor.options?.useAsteroid        ?? true,
    ...opts,
  };

  // Pre-build coordinate lookup, wormhole index, and symmetrize hyperlane matrices — all in one pass
  const coordToLabel = new Map();
  const wormholeIndex = new Map(); // wormhole type → Set<label>
  for (const [label, h] of Object.entries(editor.hexes)) {
    coordToLabel.set(`${h.q},${h.r}`, label);
    if (h.wormholes?.size) {
      for (const type of h.wormholes) {
        if (!wormholeIndex.has(type)) wormholeIndex.set(type, new Set());
        wormholeIndex.get(type).add(label);
      }
    }
    if (!h.matrix) continue;
    // Symmetrize hyperlane matrices in-place so traversal is bidirectional
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (h.matrix[i][j]) h.matrix[j][i] = 1;
      }
    }
  }
  opts.coordToLabel = coordToLabel;
  opts.wormholeIndex = wormholeIndex;

  const visited = new Map();
  const sourceHex = editor.hexes[sourceLabel];
  let effectiveMaxDist = maxDist;
  let shouldShift = false;
  visited.set(sourceLabel, 0);
  if (opts.useRift && sourceHex?.effects?.has('rift')) {
    shouldShift = true;
    effectiveMaxDist = maxDist + 1;
  }
  let currentLayer = new Set([sourceLabel]);

  // Rift cluster flood — defined once here; takes mutable state as parameters
  // so it doesn't implicitly capture loop-iteration variables.
  function floodRiftCluster(label, dist, nextLayer, floodedRifts) {
    const hex = editor.hexes[label];
    if (!isPassable(hex, opts)) return;
    if (visited.has(label)) return;
    dbg(` [RIFT Flood] ${label}`);
    visited.set(label, dist);
    nextLayer.add(label);
    floodedRifts.add(label);
    for (const { label: nLabel, hex: neighbor, dirIdx } of getNeighbors(editor, hex, label, opts)) {
      if (neighbor.effects?.has('rift') && !visited.has(nLabel)) {
        const context = { dirIdx, isSource: false, fromLabel: label, toLabel: nLabel };
        if (isBlocked(editor, hex, neighbor, context, opts)) continue;
        floodRiftCluster(nLabel, dist, nextLayer, floodedRifts);
      }
    }
  }

  // --- Main BFS ---
  for (let dist = 1; dist <= effectiveMaxDist; dist++) {
    dbg(`\n-- BFS Distance ${dist} --`);
    const nextLayer = new Set();
    const riftToFlood = new Set();

    for (const label of currentLayer) {
      const current = editor.hexes[label];
      const isSource = (label === sourceLabel);
      dbg(`[Expand] At ${label} (source: ${isSource})`);

      for (const neighborObj of getNeighbors(editor, current, label, opts)) {
        const { label: nLabel, hex: neighbor, dirIdx } = neighborObj;
        if (visited.has(nLabel)) continue;

        // Check movement blockers first — before rift detection, so e.g. Spatial Tears block rift entry
        const context = { dirIdx, isSource, fromLabel: label, toLabel: nLabel, neighborObj };
        if (isBlocked(editor, current, neighbor, context, opts)) {
          dbg(` [Blocked] from ${label} to ${nLabel} (dir ${dirIdx})`);
          continue;
        }

        // RIFT cluster: queue for flood (only if passable — not supernova/asteroid/void)
        if (opts.useRift && neighbor.effects?.has('rift') && isPassable(neighbor, opts)) {
          dbg(` [RIFT] Will flood rift at ${nLabel}`);
          riftToFlood.add(nLabel);
          continue;
        }

        // Standard step to passable neighbor
        if (isPassable(neighbor, opts, isSource)) {
          dbg(` [Step] ${label} → ${nLabel} (dir ${dirIdx})`);
          visited.set(nLabel, dist);
          nextLayer.add(nLabel);
        }
        // Hyperlane expansion
        else if (isHyperlane(neighbor) && dirIdx != null) {
          const entryDir = (dirIdx + 3) % 6;
          dbg(` [Hyperlane] Begin expansion from ${nLabel} (entry ${entryDir})`);
          const endpoints = mapHyperlaneReachables(nLabel, entryDir);
          for (const { label: dest, fromLabel, entrySide } of endpoints) {
            const destHex = editor.hexes[dest];
            const fromHex = editor.hexes[fromLabel];
            if (!destHex || visited.has(dest) || !isPassable(destHex, opts)) continue;
            // dirIdx = direction from fromHex to dest = opposite of entrySide
            const contextHL = { dirIdx: (entrySide + 3) % 6, isSource: false, fromLabel, toLabel: dest };
            if (isBlocked(editor, fromHex, destHex, contextHL, opts)) {
              dbg(`  [Blocked Hyperlane] at ${fromLabel} to ${dest}`);
              continue;
            }
            if (opts.useRift && destHex.effects?.has('rift') && isPassable(destHex, opts)) {
              dbg(`  [RIFT via HL] Will flood rift at ${dest}`);
              riftToFlood.add(dest);
              continue;
            }
            dbg(`  [HL Step] from ${fromLabel} to ${dest}`);
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }

    // Flood rift clusters reached this BFS layer
    const floodedRifts = new Set();
    for (const riftLabel of riftToFlood) {
      floodRiftCluster(riftLabel, dist, nextLayer, floodedRifts);
    }

    // Expand one step outward from each flooded rift
    for (const riftLabel of floodedRifts) {
      const riftHex = editor.hexes[riftLabel];
      for (const { label: outLabel, hex: outNeighbor, dirIdx: outDirIdx } of getNeighbors(editor, riftHex, riftLabel, opts)) {
        if (visited.has(outLabel)) continue;
        const context = { dirIdx: outDirIdx, isSource: false, fromLabel: riftLabel, toLabel: outLabel };
        if (isBlocked(editor, riftHex, outNeighbor, context, opts)) {
          dbg(` [Blocked from Rift] ${riftLabel} to ${outLabel}`);
          continue;
        }
        if (!outNeighbor.effects?.has('rift') && isPassable(outNeighbor, opts)) {
          dbg(` [RIFT Step] ${riftLabel} → ${outLabel} (dir ${outDirIdx})`);
          visited.set(outLabel, dist);
          nextLayer.add(outLabel);
        }
        if (isHyperlane(outNeighbor) && outDirIdx != null) {
          const entryDir = (outDirIdx + 3) % 6;
          dbg(` [RIFT Hyperlane] from ${outLabel} (entry ${entryDir})`);
          const endpoints = mapHyperlaneReachables(outLabel, entryDir);
          for (const { label: dest, fromLabel, entrySide } of endpoints) {
            const destHex = editor.hexes[dest];
            const fromHex = editor.hexes[fromLabel];
            if (!destHex || visited.has(dest) || !isPassable(destHex, opts)) continue;
            // dirIdx = direction from fromHex to dest = opposite of entrySide
            const contextHL = { dirIdx: (entrySide + 3) % 6, isSource: false, fromLabel, toLabel: dest };
            if (isBlocked(editor, fromHex, destHex, contextHL, opts)) {
              dbg(`  [Blocked HL from Rift] at ${fromLabel} to ${dest}`);
              continue;
            }
            if (opts.useRift && destHex.effects?.has('rift') && isPassable(destHex, opts)) {
              floodRiftCluster(dest, dist, nextLayer, floodedRifts);
              continue;
            }
            dbg(`  [RIFT HL Step] from ${fromLabel} to ${dest}`);
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }
    currentLayer = nextLayer;
  }

  // "One step out" of a rift at max distance — snapshot visited first to prevent cascading
  if (opts.useRift) {
    for (const [label, distValue] of [...visited]) {
      if (distValue !== effectiveMaxDist) continue;
      const current = editor.hexes[label];
      if (!current.effects?.has('rift')) continue;
      for (const { label: nLabel, hex: neighbor, dirIdx } of getNeighbors(editor, current, label, opts)) {
        if (visited.has(nLabel)) continue;
        const context = { dirIdx, isSource: false, fromLabel: label, toLabel: nLabel };
        if (isBlocked(editor, current, neighbor, context, opts)) continue;
        if (isPassable(neighbor, opts)) {
          dbg(`[RIFT "One Step Out"] ${label} → ${nLabel}`);
          visited.set(nLabel, effectiveMaxDist);
        }
      }
    }
  }

  // Rift shift: source-is-rift adds 1 to effectiveMaxDist, then subtract 1 from all non-zero distances
  if (!shouldShift) {
    dbg('=== DISTANCE CALC COMPLETE ===');
    return Object.fromEntries(visited);
  }
  const shifted = {};
  for (const [label, d] of visited) {
    shifted[label] = d === 0 ? 0 : Math.max(1, d - 1);
  }
  dbg('=== DISTANCE CALC COMPLETE (shifted) ===', shifted);
  return shifted;

  // --- Hyperlane traversal helper ---
  // Finds all regular-tile endpoints reachable by following the hyperlane chain from startLabel/startEntryDir.
  function mapHyperlaneReachables(startLabel, startEntryDir) {
    const seen = new Set();
    const reachable = [];
    const queue = [{ label: startLabel, entryDir: startEntryDir }];

    while (queue.length) {
      const { label, entryDir } = queue.shift();
      const tile = editor.hexes[label];
      if (!tile?.matrix) continue;
      const key = `${label}:${entryDir}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Self-loop directions at this tile
      const loopDirs = [];
      for (let d = 0; d < 6; d++) {
        if (tile.matrix[d][d] === 1) loopDirs.push(d);
      }

      // Find exits from this entryDir
      const exits = [];
      let hasNonLoopExit = false;
      for (let exit = 0; exit < 6; exit++) {
        if (tile.matrix[entryDir][exit] === 1 && exit !== entryDir) {
          exits.push(exit);
          hasNonLoopExit = true;
        }
      }
      // Special case: only loopback available
      if (!hasNonLoopExit && tile.matrix[entryDir][entryDir] === 1) exits.push(entryDir);

      // Chain via self-loops
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
        const farLabel = coordToLabel.get(`${tile.q + outDir.q},${tile.r + outDir.r}`) ?? null;
        const far = farLabel ? editor.hexes[farLabel] : null;
        if (!far || !farLabel) continue;

        // Border anomaly check for hyperlane-to-hyperlane transitions
        if (opts?.useBorderAnomalies && isHyperlane(far)) {
          const entrySide = (exit + 3) % 6;
          if (
            anomalyId(far.borderAnomalies?.[entrySide]) === 'SPATIALTEAR' ||
            anomalyId(far.borderAnomalies?.[entrySide]) === 'GRAVITYWAVE' ||
            anomalyId(tile.borderAnomalies?.[exit])     === 'SPATIALTEAR' ||
            anomalyId(tile.borderAnomalies?.[exit])     === 'GRAVITYWAVE'
          ) {
            dbg(`[HL Blocked] ${label} → ${farLabel} (exit ${exit})`);
            continue;
          }
        }

        if (isHyperlane(far)) {
          dbg(`[HL Chain] ${label} → ${farLabel} (exit ${exit})`);
          queue.push({ label: farLabel, entryDir: (exit + 3) % 6 });
        } else if (isPassable(far, opts)) {
          dbg(`[HL End] ${label} → ${farLabel} (exit ${exit})`);
          reachable.push({ label: farLabel, fromLabel: label, entrySide: (exit + 3) % 6 });
        }
      }
    }
    return reachable.filter(o => o.label !== startLabel);
  }

}
