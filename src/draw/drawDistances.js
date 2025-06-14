/**
 * Calculate BFS distances from a source tile on a TI4-style map,
 * handling rifts, wormholes, hyperlanes, nebulae, supernovae, asteroids, and voids.
 * 
 * - Supports all rift chaining rules, including rifts after wormholes/hyperlanes.
 * - Floods rift clusters at the correct minimal distance.
 * - Hyperlane and wormhole propagation is fully integrated.
 * - Optional: "one step out" of rift at max distance.
 *
 * @param {Object} editor - Map editor context (must have .hexes, .edgeDirections, etc)
 * @param {string} sourceLabel - The starting tile label
 * @param {number} maxDist - Maximum distance (default 3)
 * @returns {Object} Map of { label: distance }
 */
export function calculateDistancesFrom(editor, sourceLabel, maxDist = 3) {
  // --- 1. Read effect toggles from editor options (with sensible defaults)
  const useSupernova = editor.options?.useSupernova ?? true;
  const useRift = editor.options?.useRift ?? true;
  const useNebula = editor.options?.useNebula ?? true;
  const useAsteroid = editor.options?.useAsteroid ?? true;

  /**
   * Returns true if you can move into/through this hex.
   * Source tile is always passable for "leaving."
   */
  function isPassable(hex, isSource = false) {
    if (!hex) return false;
    if (!isSource) {
      if (useSupernova && hex.effects?.has('supernova')) return false;
      if (useAsteroid && hex.effects?.has('asteroid')) return false;
      if (useNebula && hex.effects?.has('nebula')) return false;
    }
    const type = hex.baseType || '';
    if (type === 'void') return false;
    return type !== '';
  }

  /**
   * Returns all neighbors of a hex:
   * - axial (adjacent)
   * - wormhole-connected (any matching wormhole symbol)
   * Each result is: { label, hex, dirIdx }
   */
  function getNeighbors(hex) {
    const results = [];
    // Axial neighbors (dirIdx 0..5)
    for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
      const dir = editor.edgeDirections[dirIdx];
      const q = hex.q + dir.q;
      const r = hex.r + dir.r;
      const neighbor = Object.values(editor.hexes).find(h => h.q === q && h.r === r);
      if (neighbor) {
        const label = Object.keys(editor.hexes).find(k => editor.hexes[k] === neighbor);
        if (label) results.push({ label, hex: neighbor, dirIdx });
      }
    }
    // Wormhole neighbors (dirIdx: null)
    for (const [label, h] of Object.entries(editor.hexes)) {
      if (h.wormholes?.size && hex.wormholes && [...hex.wormholes].some(type => h.wormholes.has(type))) {
        results.push({ label, hex: h, dirIdx: null });
      }
    }
    return results;
  }

  /**
   * For a hyperlane tile, returns all other tiles reachable via hyperlane links/portals.
   * Handles all looped-arc/portal logic (no mutation).
   */
  function mapHyperlaneReachables(startLabel, startEntryDir) {
    const seen = new Set();
    const reachable = new Set();
    const queue = [{ label: startLabel, entryDir: startEntryDir }];
    while (queue.length) {
      const { label, entryDir } = queue.shift();
      const key = `${label}:${entryDir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tile = editor.hexes[label];
      if (!tile?.matrix) continue;
      // Collect all looped entry directions (self-loops)
      const loopDirs = [];
      for (let d = 0; d < 6; d++) {
        if (tile.matrix[d][d] === 1) loopDirs.push(d);
      }
      // Build all possible exits for this entry
      const exits = [];
      for (let exit = 0; exit < 6; exit++) {
        if (tile.matrix[entryDir][exit] === 1 && exit !== entryDir) exits.push(exit);
      }
      // Add portal connections between all self-loops
      if (loopDirs.includes(entryDir)) {
        for (const other of loopDirs) {
          if (other !== entryDir) exits.push(other);
        }
      }
      const uniqueExits = Array.from(new Set(exits));
      // Propagate out to all valid exits
      for (const exit of uniqueExits) {
        const outDir = editor.edgeDirections[exit];
        const q2 = tile.q + outDir.q;
        const r2 = tile.r + outDir.r;
        const far = Object.values(editor.hexes).find(h => h.q === q2 && h.r === r2);
        if (!far) continue;
        const farLabel = Object.keys(editor.hexes).find(k => editor.hexes[k] === far);
        if (!farLabel) continue;
        if (far.matrix && far.matrix.some(r => r.includes(1))) {
          // Chain through another hyperlane tile
          queue.push({ label: farLabel, entryDir: (exit + 3) % 6 });
        } else if (isPassable(far)) {
          // Stop at passable destination tile
          reachable.add(farLabel);
        }
      }
    }
    reachable.delete(startLabel); // Don't list self
    return Array.from(reachable);
  }

  /**
   * Defensive: Symmetrize all hyperlane matrices (bidirectional propagation).
   */
  for (const hex of Object.values(editor.hexes)) {
    if (!hex.matrix) continue;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (hex.matrix[i][j]) hex.matrix[j][i] = 1;
      }
    }
  }

  // --- 2. Set up BFS state ---
  const visited = new Map(); // { label: minDist }
  const sourceHex = editor.hexes[sourceLabel];
  let effectiveMaxDist = maxDist;
  let shouldShift = false;
  // If we start on a rift, add a bonus step for "rift shift" TI4 rule
  if (useRift && sourceHex?.effects.has('rift')) {
    shouldShift = true;
    effectiveMaxDist = maxDist + 1;
    visited.set(sourceLabel, 0);
  } else {
    visited.set(sourceLabel, 0);
  }
  let currentLayer = new Set([sourceLabel]); // Tiles at the current BFS distance

  // --- 3. Main BFS loop (1 layer per distance) ---
  for (let dist = 1; dist <= effectiveMaxDist; dist++) {
    const nextLayer = new Set();     // Tiles to visit at dist+1
    const riftToFlood = new Set();   // New rifts reached this round

    // Step 1: For every tile at this distance, expand to neighbors/hyperlanes/wormholes
    for (const label of currentLayer) {
      const current = editor.hexes[label];
      const isSource = (label === sourceLabel);

      // Blocked tile types (except for source tile)
      if (!isSource && ((useNebula && current.effects?.has('nebula')) || current.baseType === 'nebula')) continue;
      if (!isSource && ((useSupernova && current.effects?.has('supernova')) || current.baseType === 'supernova')) continue;

      for (const { label: nLabel, hex: neighbor, dirIdx } of getNeighbors(current)) {
        if (visited.has(nLabel)) continue;

        // --- 3a. If we reach a rift this round (by any means), mark it for full cluster flood
        if (useRift && neighbor.effects?.has('rift')) {
          riftToFlood.add(nLabel);
          continue;
        }

        // --- 3b. Standard BFS expansion ---
        const isRiftBridge = current.effects?.has('rift') && neighbor.effects?.has('rift');
        const allowSourcePass = isSource;
        if (isPassable(neighbor, allowSourcePass) || isRiftBridge) {
          visited.set(nLabel, dist);
          nextLayer.add(nLabel);
        }
        // --- 3c. Hyperlane expansion: for any neighbor that is a hyperlane tile
        else if (neighbor.matrix && neighbor.matrix.some(r => r.includes(1))) {
          const entryDir = (dirIdx + 3) % 6;
          const endpoints = mapHyperlaneReachables(nLabel, entryDir);
          for (const dest of endpoints) {
            const destHex = editor.hexes[dest];
            if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;
            if (useRift && destHex.effects?.has('rift')) {
              // Any rift reached by hyperlane: mark for flooding
              riftToFlood.add(dest);
              continue;
            }
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }

    // --- 4. After neighbor loop: Flood all connected rifts (and adjacent) for every new rift reached
    const floodedRifts = new Set();
    // Recursive helper: marks all rifts in a cluster at same distance, and adds them to nextLayer
    function floodRiftCluster(label) {
      if (visited.has(label)) return;
      visited.set(label, dist);
      nextLayer.add(label);
      floodedRifts.add(label);
      const hex = editor.hexes[label];
      for (const { label: nLabel, hex: neighbor } of getNeighbors(hex)) {
        if (neighbor.effects?.has('rift') && !visited.has(nLabel)) {
          floodRiftCluster(nLabel);
        }
      }
    }
    // Start flooding from every rift hit at this distance
    for (const riftLabel of riftToFlood) {
      floodRiftCluster(riftLabel);
    }

    // --- 5. For each rift in the cluster, mark all passable non-rift and hyperlane neighbors at this distance
    for (const riftLabel of floodedRifts) {
      const riftHex = editor.hexes[riftLabel];
      for (const { label: outLabel, hex: outNeighbor, dirIdx: outDirIdx } of getNeighbors(riftHex)) {
        if (visited.has(outLabel)) continue;
        // a) Adjacency to passable non-rift
        if (!outNeighbor.effects?.has('rift') && isPassable(outNeighbor)) {
          visited.set(outLabel, dist);
          nextLayer.add(outLabel);
        }
        // b) Hyperlane expansion from the rift
        if (outNeighbor.matrix && outNeighbor.matrix.some(r => r.includes(1))) {
          const entryDir = (outDirIdx + 3) % 6;
          const endpoints = mapHyperlaneReachables(outLabel, entryDir);
          for (const dest of endpoints) {
            const destHex = editor.hexes[dest];
            if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;
            // If the destination is a rift, flood it as well
            if (useRift && destHex.effects?.has('rift')) {
              floodRiftCluster(dest);
              continue;
            }
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }

    // Prepare for next BFS layer
    currentLayer = nextLayer;
  }

  // --- 6. Optionally: allow "one step out" of a rift at max distance (TI4 rules, optional)
  for (const [label, dist] of Object.entries(visited)) {
    if (dist !== effectiveMaxDist) continue;
    const current = editor.hexes[label];
    for (const { label: nLabel, hex: neighbor } of getNeighbors(current)) {
      if (visited.has(nLabel)) continue;
      if (isPassable(neighbor)) {
        visited.set(nLabel, effectiveMaxDist);
      }
    }
  }

  // --- 7. Final return (with rift shift if started on rift)
  const rawDistances = Object.fromEntries(visited);
  if (!shouldShift) return rawDistances;

  // TI4 rules: if starting on a rift, adjust all distances down by 1 (except source)
  const shifted = {};
  for (const [label, d] of Object.entries(rawDistances)) {
    shifted[label] = d === 0 ? 0 : Math.max(1, d - 1);
  }
  return shifted;
}
