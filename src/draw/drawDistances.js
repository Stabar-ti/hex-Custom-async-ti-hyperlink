// ---- DEBUGGING TOGGLE ----
const DEBUG_DIST = false; // Set to true to enable verbose pathfinding logs
const DEBUG_DISTANCES = false; // set to false to disable debug logs

function dbg(...args) {
  if (DEBUG_DIST) console.log(...args);
}

// ---- Pluggable neighbor providers & movement blockers ----

const neighborProviders = [];
const movementBlockers = [];

// Register a new neighbor provider
export function registerNeighborProvider(fn) {
  neighborProviders.push(fn);
}

// Register a new movement blocker
export function registerMovementBlocker(fn) {
  movementBlockers.push(fn);
}

// Use all providers to collect neighbors (removes dups)
function getNeighbors(editor, hex, currLabel, opts) {
  let results = [];
  for (const provider of neighborProviders) {
    const provided = provider(editor, hex, currLabel, opts);
    dbg(`[getNeighbors] Provider:`, provider.name || 'anonymous', 'from', currLabel, 'results:', provided?.length);
    results = results.concat(provided);
  }
  // Remove duplicates by label
  const seen = new Set();
  return results.filter(n => !seen.has(n.label) && seen.add(n.label));
}

// Use all blockers to see if movement should be blocked
function isBlocked(editor, fromHex, toHex, context, opts) {
  for (const blocker of movementBlockers) {
    const result = blocker(editor, fromHex, toHex, context, opts);
    if (result) {
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

// ---- Default core neighbor providers ----

// 1. Standard axial neighbors (0..5)
registerNeighborProvider((editor, hex, currLabel, opts) => {
  const arr = [];
  for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
    const dir = editor.edgeDirections[dirIdx];
    const q = hex.q + dir.q;
    const r = hex.r + dir.r;
    const neighbor = Object.values(editor.hexes).find(h => h.q === q && h.r === r);
    if (!neighbor) continue;
    const label = Object.keys(editor.hexes).find(k => editor.hexes[k] === neighbor);
    arr.push({ label, hex: neighbor, dirIdx });
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

// 3. Wormholes (as extra links)
registerNeighborProvider((editor, hex, currLabel, opts) => {
  if (!hex.wormholes?.size) return [];
  const arr = [];
  for (const [label, h] of Object.entries(editor.hexes)) {
    if (h === hex) continue;
    if (
      h.wormholes?.size &&
      [...hex.wormholes].some(type => h.wormholes.has(type))
    ) {
      arr.push({ label, hex: h, dirIdx: null, isWormhole: true });
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
    if (neighbor) {
      arr.push({ label: neighborLabel, hex: neighbor, dirIdx: null, isAdjOverride: true });
    }
  }
  return arr;
});

// ---- Default core movement blockers ----

// 1. Border anomalies (Spatial Tear & Gravity Wave)
registerMovementBlocker((editor, fromHex, toHex, ctx, opts) => {
  if (!opts.useBorderAnomalies) return false;
  if (!fromHex || !toHex) return false; // <--- fix
  // dirIdx = direction from fromHex to toHex (if present)
  const dirIdx = ctx?.dirIdx;
  if (dirIdx == null) return false;
  // Check spatial tear both ways
  if (
    (fromHex?.borderAnomalies && fromHex.borderAnomalies[dirIdx]?.type === "Spatial Tear") ||
    (toHex?.borderAnomalies && toHex.borderAnomalies[(dirIdx + 3) % 6]?.type === "Spatial Tear")
  ) {
    return true;
  }
  if (
    toHex?.borderAnomalies &&
    toHex.borderAnomalies[(dirIdx + 3) % 6]?.type === "Gravity Wave"
  ) {
    return true;
  }
  return false;
});

// 2. Supernova/asteroid (blocks movement out)
registerMovementBlocker((editor, fromHex, toHex, ctx, opts) => {
  if (!fromHex || !toHex) return false;
  if (!ctx?.isSource) {
    if (opts.useSupernova && fromHex.effects?.has('supernova')) return true;
    if (opts.useAsteroid && fromHex.effects?.has('asteroid')) return true;
    if (fromHex.baseType === 'supernova' || fromHex.baseType === 'asteroid') return true;
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
    // Do NOT block nebula here!
  }
  if (hex.baseType === 'void') return false;
  return hex.baseType !== '';
}

// ---- Main BFS with debug ----

export function calculateDistancesFrom(
  editor,
  sourceLabel,
  maxDist = 3,
  opts = {}
) {
  dbg('\n========== DISTANCE CALCULATION BEGIN ==========');
  opts = {
    useCustomLinks: editor.options?.useCustomLinks ?? true,
    useBorderAnomalies: editor.options?.useBorderAnomalies ?? true,
    useSupernova: editor.options?.useSupernova ?? true,
    useRift: editor.options?.useRift ?? true,
    useNebula: editor.options?.useNebula ?? true,
    useAsteroid: editor.options?.useAsteroid ?? true,
    ...opts,
  };

  // Hyperlane symmetrization (unchanged)
  for (const hex of Object.values(editor.hexes)) {
    if (!hex.matrix) continue;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (hex.matrix[i][j]) hex.matrix[j][i] = 1;
      }
    }
  }

  const visited = new Map();
  const sourceHex = editor.hexes[sourceLabel];
  let effectiveMaxDist = maxDist;
  let shouldShift = false;
  if (opts.useRift && sourceHex?.effects?.has('rift')) {
    shouldShift = true;
    effectiveMaxDist = maxDist + 1;
    visited.set(sourceLabel, 0);
  } else {
    visited.set(sourceLabel, 0);
  }
  let currentLayer = new Set([sourceLabel]);

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

        // RIFT cluster logic: only flood if passable (not nebula/supernova/asteroid/void)
        if (
          opts.useRift &&
          neighbor.effects?.has('rift') &&
          isPassable(neighbor, opts)
        ) {
          dbg(` [RIFT] Will flood rift at ${nLabel}`);
          riftToFlood.add(nLabel);
          continue;
        }

        // Check movement blockers!
        const context = { dirIdx, isSource, fromLabel: label, toLabel: nLabel, neighborObj };
        if (isBlocked(editor, current, neighbor, context, opts)) {
          dbg(` [Blocked] from ${label} to ${nLabel} (dir ${dirIdx})`);
          continue;
        }

        // Standard BFS: step to passable neighbor or rift bridge
        const isRiftBridge = current.effects?.has('rift') && neighbor.effects?.has('rift');
        if (isPassable(neighbor, opts, isSource) || isRiftBridge) {
          dbg(` [Step] ${label} → ${nLabel} (dir ${dirIdx})`);
          visited.set(nLabel, dist);
          nextLayer.add(nLabel);
        }
        // Hyperlane expansion: traverse hyperlane connections
        else if (neighbor.matrix && neighbor.matrix.some(r => r.includes(1)) && dirIdx != null) {
          const entryDir = (dirIdx + 3) % 6;
          dbg(` [Hyperlane] Begin expansion from ${nLabel} (entry ${entryDir})`);
          const endpoints = mapHyperlaneReachables(editor, nLabel, entryDir, opts);
          for (const { label: dest, fromLabel, entrySide } of endpoints) {
            const destHex = editor.hexes[dest];
            const fromHex = editor.hexes[fromLabel];
            if (!destHex || visited.has(dest) || !isPassable(destHex, opts)) continue;
            const contextHL = { dirIdx: entrySide, isSource: false, fromLabel, toLabel: dest };
            if (isBlocked(editor, fromHex, destHex, contextHL, opts)) {
              dbg(`  [Blocked Hyperlane] at ${fromLabel} to ${dest} (entrySide ${entrySide})`);
              continue;
            }
            if (
              opts.useRift &&
              destHex.effects?.has('rift') &&
              isPassable(destHex, opts)
            ) {
              dbg(`  [RIFT via HL] Will flood rift at ${dest}`);
              riftToFlood.add(dest);
              continue;
            }
            dbg(`  [HL Step] from ${fromLabel} to ${dest} (entrySide ${entrySide})`);
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }

    // RIFT cluster flooding (only if passable)
    const floodedRifts = new Set();
    function floodRiftCluster(label) {
      const hex = editor.hexes[label];
      if (!isPassable(hex, opts)) return;
      if (visited.has(label)) return;
      dbg(` [RIFT Flood] ${label}`);
      visited.set(label, dist);
      nextLayer.add(label);
      floodedRifts.add(label);
      for (const { label: nLabel, hex: neighbor } of getNeighbors(editor, hex, label, opts)) {
        if (neighbor.effects?.has('rift') && !visited.has(nLabel)) {
          floodRiftCluster(nLabel);
        }
      }
    }
    for (const riftLabel of riftToFlood) {
      floodRiftCluster(riftLabel);
    }

    // Outward from rifts
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
        if (outNeighbor.matrix && outNeighbor.matrix.some(r => r.includes(1)) && outDirIdx != null) {
          const entryDir = (outDirIdx + 3) % 6;
          dbg(` [RIFT Hyperlane] from ${outLabel} (entry ${entryDir})`);
          const endpoints = mapHyperlaneReachables(editor, outLabel, entryDir, opts);
          for (const { label: dest, fromLabel, entrySide } of endpoints) {
            const destHex = editor.hexes[dest];
            const fromHex = editor.hexes[fromLabel];
            if (!destHex || visited.has(dest) || !isPassable(destHex, opts)) continue;
            const contextHL = { dirIdx: entrySide, isSource: false, fromLabel, toLabel: dest };
            if (isBlocked(editor, fromHex, destHex, contextHL, opts)) {
              dbg(`  [Blocked HL from Rift] at ${fromLabel} to ${dest} (entrySide ${entrySide})`);
              continue;
            }
            if (
              opts.useRift &&
              destHex.effects?.has('rift') &&
              isPassable(destHex, opts)
            ) {
              floodRiftCluster(dest);
              continue;
            }
            dbg(`  [RIFT HL Step] from ${fromLabel} to ${dest} (entrySide ${entrySide})`);
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }
    currentLayer = nextLayer;
  }

  // 6. "One step out" of a rift at max distance
  for (const [label, distValue] of Object.entries(visited)) {
    if (distValue !== effectiveMaxDist) continue;
    const current = editor.hexes[label];
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

  // 7. Rift shift
  const rawDistances = Object.fromEntries(visited);
  if (!shouldShift) {
    dbg('=== DISTANCE CALC COMPLETE ===', rawDistances);
    return rawDistances;
  }
  const shifted = {};
  for (const [label, d] of Object.entries(rawDistances)) {
    shifted[label] = d === 0 ? 0 : Math.max(1, d - 1);
  }
  dbg('=== DISTANCE CALC COMPLETE ===', shifted);
  return shifted;

  // --- Nested helper with debug ---
  function mapHyperlaneReachables(editor, startLabel, startEntryDir, opts) {
    const seen = new Set();
    const reachable = [];
    const queue = [{ label: startLabel, entryDir: startEntryDir }];

    // Use the global debug toggle from your script
    const dbg = (...args) => DEBUG_DISTANCES && console.log('[HL]', ...args);

    while (queue.length) {
      const { label, entryDir } = queue.shift();
      const tile = editor.hexes[label];
      if (!tile?.matrix) continue;
      const key = `${label}:${entryDir}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Gather all exits from this entryDir
      const loopDirs = [];
      for (let d = 0; d < 6; d++) {
        if (tile.matrix[d][d] === 1) loopDirs.push(d);
      }

      // Find exits
      const exits = [];
      let hasNonLoopExit = false;
      for (let exit = 0; exit < 6; exit++) {
        if (tile.matrix[entryDir][exit] === 1) {
          if (exit !== entryDir) {
            exits.push(exit);
            hasNonLoopExit = true;
          }
        }
      }
      // Special case: only loopback available
      if (!hasNonLoopExit && tile.matrix[entryDir][entryDir] === 1) {
        exits.push(entryDir);
      }

      // Chain via self-loops
      if (loopDirs.includes(entryDir)) {
        for (const other of loopDirs) {
          if (other !== entryDir) {
            exits.push(other);
            queue.push({ label, entryDir: other });
          }
        }
      }

      const uniqueExits = Array.from(new Set(exits));
      for (const exit of uniqueExits) {
        const outDir = editor.edgeDirections[exit];
        const q2 = tile.q + outDir.q;
        const r2 = tile.r + outDir.r;
        const far = Object.values(editor.hexes).find(h => h.q === q2 && h.r === r2);
        const farLabel = far ? Object.keys(editor.hexes).find(k => editor.hexes[k] === far) : null;
        if (!far || !farLabel) continue;

        // -- Border anomaly check --
        let blocked = false;
        if (opts?.useBorderAnomalies && far.matrix && far.matrix.some(r => r.includes(1))) {
          const entrySide = (exit + 3) % 6;
          if (
            far.borderAnomalies &&
            (
              far.borderAnomalies[entrySide]?.type === "Spatial Tear" ||
              far.borderAnomalies[entrySide]?.type === "Gravity Wave"
            )
          ) {
            dbg(`[HL Blocked] ${label} → ${farLabel} (exit ${exit}) [entrySide ${entrySide}]`);
            blocked = true;
          }
          if (
            tile.borderAnomalies &&
            tile.borderAnomalies[exit]?.type === "Spatial Tear"
          ) {
            dbg(`[HL Blocked] ${label} → ${farLabel} (exit ${exit}) [Spatial Tear on origin]`);
            blocked = true;
          }
        }
        if (blocked) continue;

        if (far.matrix && far.matrix.some(r => r.includes(1))) {
          dbg(`[HL Chain] ${label} → ${farLabel} (exit ${exit})`);
          queue.push({ label: farLabel, entryDir: (exit + 3) % 6 });
        } else if (isPassable(far, opts)) {
          dbg(`[HL End] ${label} → ${farLabel} (exit ${exit})`);
          reachable.push({
            label: farLabel,
            fromLabel: label,
            entrySide: (exit + 3) % 6
          });
        }
      }
    }
    return reachable.filter(o => o.label !== startLabel);
  }

}