/**
 * Calculate BFS distances from a source tile on a TI4-style map,
 * handling rifts, wormholes, hyperlanes, nebulae, supernovae, asteroids, and voids.
 * 
 * - Supports all rift chaining rules, including rifts after wormholes/hyperlanes.
 * - Floods rift clusters at the correct minimal distance.
 * - Hyperlane and wormhole propagation is fully integrated.
 * - Optional: "one step out" of rift at max distance (TI4 rule).
 *
 * @param {Object} editor - Map editor context (must have .hexes, .edgeDirections, etc)
 * @param {string} sourceLabel - The starting tile label
 * @param {number} maxDist - Maximum distance (default 3)
 * @returns {Object} Map of { label: distance }
 */
// ───────────────────────────────────────────────────────────────
export function calculateDistancesFrom(editor, sourceLabel, maxDist = 3) {
  // --- 1. Read effect toggles from editor options (with sensible defaults)
  const useSupernova = editor.options?.useSupernova ?? true;
  const useRift = editor.options?.useRift ?? true;
  const useNebula = editor.options?.useNebula ?? true;
  const useAsteroid = editor.options?.useAsteroid ?? true;

  /**
   * Returns true if a hex is passable for movement (not supernova, void, etc).
   * Always allows leaving the source hex, but may block other hexes based on effect toggles.
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
   * Gets all neighbors of a hex, including:
   * - Axial/adjacent (the usual 6)
   * - All hexes connected via wormholes (matching types)
   * Each result: { label, hex, dirIdx }
   */
  function getNeighbors(hex) {
    const results = [];
    // Axial neighbors (0..5 directions)
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
    // Wormhole neighbors: connect if any wormhole type matches (dirIdx=null)
    for (const [label, h] of Object.entries(editor.hexes)) {
      if (h.wormholes?.size && hex.wormholes && [...hex.wormholes].some(type => h.wormholes.has(type))) {
        results.push({ label, hex: h, dirIdx: null });
      }
    }
    return results;
  }

  /**
   * For a hyperlane tile, returns all other tiles reachable via hyperlane links.
   * Supports chaining through hyperlane networks, including loopbacks.
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
      // Find all loopback (self-loop) entries for chaining
      const loopDirs = [];
      for (let d = 0; d < 6; d++) {
        if (tile.matrix[d][d] === 1) loopDirs.push(d);
      }
      // Gather all exit directions (excluding self-loop, unless chaining)
      const exits = [];
      for (let exit = 0; exit < 6; exit++) {
        if (tile.matrix[entryDir][exit] === 1 && exit !== entryDir) exits.push(exit);
      }
      // Allow chaining via self-loops/portals
      if (loopDirs.includes(entryDir)) {
        for (const other of loopDirs) {
          if (other !== entryDir) {
            exits.push(other);
            queue.push({ label, entryDir: other });
          }
        }
      }
      // Propagate to other tiles in hyperlane network
      const uniqueExits = Array.from(new Set(exits));
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
          reachable.add(farLabel);
        }
      }
    }
    reachable.delete(startLabel);
    return Array.from(reachable);
  }

  /**
   * Symmetrizes all hex matrices so hyperlane links are always bidirectional.
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
  const visited = new Map(); // Map: label → minDist
  const sourceHex = editor.hexes[sourceLabel];
  let effectiveMaxDist = maxDist;
  let shouldShift = false;
  // TI4 "rift shift": if we start on a rift, BFS one extra layer
  if (useRift && sourceHex?.effects.has('rift')) {
    shouldShift = true;
    effectiveMaxDist = maxDist + 1;
    visited.set(sourceLabel, 0);
  } else {
    visited.set(sourceLabel, 0);
  }
  let currentLayer = new Set([sourceLabel]);

  // --- 3. Main BFS loop: expand outwards up to maxDist layers ---
  for (let dist = 1; dist <= effectiveMaxDist; dist++) {
    const nextLayer = new Set();
    const riftToFlood = new Set();

    // Expand to all neighbor types, accounting for rifts, wormholes, and hyperlanes
    for (const label of currentLayer) {
      const current = editor.hexes[label];
      const isSource = (label === sourceLabel);

      // Blocked tile types (except for source)
      if (!isSource && ((useNebula && current.effects?.has('nebula')) || current.baseType === 'nebula')) continue;
      if (!isSource && ((useSupernova && current.effects?.has('supernova')) || current.baseType === 'supernova')) continue;

      for (const { label: nLabel, hex: neighbor, dirIdx } of getNeighbors(current)) {
        if (visited.has(nLabel)) continue;

        // If this neighbor is a rift, flood the whole cluster (later)
        if (useRift && neighbor.effects?.has('rift')) {
          riftToFlood.add(nLabel);
          continue;
        }

        // Standard BFS: step to passable neighbor or rift bridge
        const isRiftBridge = current.effects?.has('rift') && neighbor.effects?.has('rift');
        const allowSourcePass = isSource;
        if (isPassable(neighbor, allowSourcePass) || isRiftBridge) {
          visited.set(nLabel, dist);
          nextLayer.add(nLabel);
        }
        // Hyperlane expansion: traverse hyperlane connections
        else if (neighbor.matrix && neighbor.matrix.some(r => r.includes(1))) {
          const entryDir = (dirIdx + 3) % 6;
          const endpoints = mapHyperlaneReachables(nLabel, entryDir);
          for (const dest of endpoints) {
            const destHex = editor.hexes[dest];
            if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;
            if (useRift && destHex.effects?.has('rift')) {
              riftToFlood.add(dest);
              continue;
            }
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }

    // --- 4. Flood all connected rifts for every new rift reached ---
    const floodedRifts = new Set();
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
    for (const riftLabel of riftToFlood) {
      floodRiftCluster(riftLabel);
    }

    // 5. For each rift, add passable non-rift and hyperlane neighbors at same distance
    for (const riftLabel of floodedRifts) {
      const riftHex = editor.hexes[riftLabel];
      for (const { label: outLabel, hex: outNeighbor, dirIdx: outDirIdx } of getNeighbors(riftHex)) {
        if (visited.has(outLabel)) continue;
        // a) Passable non-rift neighbor
        if (!outNeighbor.effects?.has('rift') && isPassable(outNeighbor)) {
          visited.set(outLabel, dist);
          nextLayer.add(outLabel);
        }
        // b) Hyperlane expansion from rift
        if (outNeighbor.matrix && outNeighbor.matrix.some(r => r.includes(1))) {
          const entryDir = (outDirIdx + 3) % 6;
          const endpoints = mapHyperlaneReachables(outLabel, entryDir);
          for (const dest of endpoints) {
            const destHex = editor.hexes[dest];
            if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;
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

    // Move outwards one more layer in BFS
    currentLayer = nextLayer;
  }

  // --- 6. Optionally allow "one step out" of a rift at max distance (TI4 rules) ---
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

  // --- 7. Final adjustment: TI4 "rift shift" (start on rift = subtract 1 from all except source)
  const rawDistances = Object.fromEntries(visited);
  if (!shouldShift) return rawDistances;

  const shifted = {};
  for (const [label, d] of Object.entries(rawDistances)) {
    shifted[label] = d === 0 ? 0 : Math.max(1, d - 1);
  }
  return shifted;
}
