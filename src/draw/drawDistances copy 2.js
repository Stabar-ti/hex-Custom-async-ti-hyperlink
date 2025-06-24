export function calculateDistancesFrom(
  editor,
  sourceLabel,
  maxDist = 3,
  opts = {}
) {
  const {
    useCustomLinks = true,
    useBorderAnomalies = true,
  } = opts;

  // --- 1. Read effect toggles from editor options (with sensible defaults)
  const useSupernova = editor.options?.useSupernova ?? true;
  const useRift = editor.options?.useRift ?? true;
  const useNebula = editor.options?.useNebula ?? true;
  const useAsteroid = editor.options?.useAsteroid ?? true;

  function isPassable(hex, isSource = false) {
    if (!hex) return false;
    if (!isSource) {
      if (useSupernova && hex.effects?.has('supernova')) return false;
      if (useAsteroid && hex.effects?.has('asteroid')) return false;
      //  if (useNebula && hex.effects?.has('nebula')) return false;
    }
    const type = hex.baseType || '';
    if (type === 'void') return false;
    return type !== '';
  }

  function getNeighbors(hex, currLabel) {
    const results = [];

    // 1. Standard axial neighbors (0..5)
    for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
      const dir = editor.edgeDirections[dirIdx];
      const q = hex.q + dir.q;
      const r = hex.r + dir.r;
      const neighbor = Object.values(editor.hexes).find(h => h.q === q && h.r === r);
      if (!neighbor) continue;
      const label = Object.keys(editor.hexes).find(k => editor.hexes[k] === neighbor);

      // Border anomalies (block movement)
      if (useBorderAnomalies) {
        // --- Spatial Tear: blocks both ways ---
        if (
          (hex.borderAnomalies && hex.borderAnomalies[dirIdx]?.type === "Spatial Tear") ||
          (neighbor.borderAnomalies && neighbor.borderAnomalies[(dirIdx + 3) % 6]?.type === "Spatial Tear")
        ) {
          continue; // Cannot cross this edge in any direction
        }
        // --- Gravity Wave: blocks only entering neighbor from this edge ---
        if (
          neighbor.borderAnomalies &&
          neighbor.borderAnomalies[(dirIdx + 3) % 6]?.type === "Gravity Wave"
        ) {
          continue; // Cannot enter neighbor via this edge
        }
      }

      results.push({ label, hex: neighbor, dirIdx });
    }

    // 2. Custom adjacency links (if enabled)
    if (useCustomLinks && hex.customAdjacents) {
      for (const [targetLabel, info] of Object.entries(hex.customAdjacents)) {
        // Add if twoWay or one-way out from this hex
        if (info.twoWay || !editor.hexes[targetLabel].customAdjacents?.[currLabel]) {
          // Prevent duplicates
          if (!results.some(n => n.label === targetLabel)) {
            results.push({ label: targetLabel, hex: editor.hexes[targetLabel], dirIdx: null, isCustomLink: true });
          }
        }
      }
    }

    // 3. Wormhole neighbors (extra links)
    for (const [label, h] of Object.entries(editor.hexes)) {
      if (
        h.wormholes?.size &&
        hex.wormholes &&
        [...hex.wormholes].some(type => h.wormholes.has(type))
      ) {
        if (!results.some(n => n.label === label)) {
          results.push({ label, hex: h, dirIdx: null, isWormhole: true });
        }
      }
    }

    // 4. Adjacency overrides: treat as extra links (just like custom double links)
    if (hex.adjacencyOverrides) {
      for (const neighborLabel of Object.values(hex.adjacencyOverrides)) {
        const neighbor = editor.hexes[neighborLabel];
        if (neighbor && !results.some(n => n.label === neighborLabel)) {
          results.push({ label: neighborLabel, hex: neighbor, dirIdx: null, isAdjOverride: true });
        }
      }
    }

    return results;
  }


  // --- Hyperlane symmetrization (unchanged) ---
  for (const hex of Object.values(editor.hexes)) {
    if (!hex.matrix) continue;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (hex.matrix[i][j]) hex.matrix[j][i] = 1;
      }
    }
  }

  // --- 2. Set up BFS state ---
  const visited = new Map();
  const sourceHex = editor.hexes[sourceLabel];
  let effectiveMaxDist = maxDist;
  let shouldShift = false;
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

    for (const label of currentLayer) {
      const current = editor.hexes[label];
      const isSource = (label === sourceLabel);

      // TI4 nebula: can't move OUT of nebula (except from source tile)
      if (!isSource && useNebula && current.effects?.has('nebula')) continue;
      if (!isSource && ((useSupernova && current.effects?.has('supernova')) || current.baseType === 'supernova')) continue;
      if (!isSource && ((useAsteroid && current.effects?.has('asteroid')) || current.baseType === 'asteroid')) continue;

      for (const { label: nLabel, hex: neighbor, dirIdx } of getNeighbors(current, label)) {
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
          const endpoints = mapHyperlaneReachables(nLabel, entryDir, opts);
          for (const { label: dest, fromLabel, entrySide } of endpoints) {
            const destHex = editor.hexes[dest];
            const fromHex = editor.hexes[fromLabel];
            if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;

            // --- BORDER ANOMALY CHECK before riftToFlood or visiting ---
            let blocked = false;
            if (useBorderAnomalies) {
              if (
                destHex.borderAnomalies &&
                (
                  destHex.borderAnomalies[entrySide]?.type === "Spatial Tear" ||
                  destHex.borderAnomalies[entrySide]?.type === "Gravity Wave"
                )
              ) {
                blocked = true;
              }
              if (
                fromHex &&
                fromHex.borderAnomalies &&
                fromHex.borderAnomalies[(entrySide + 3) % 6]?.type === "Spatial Tear"
              ) {
                blocked = true;
              }
            }
            if (blocked) continue;

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
      for (const { label: nLabel, hex: neighbor } of getNeighbors(hex, label)) {
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
      for (const { label: outLabel, hex: outNeighbor, dirIdx: outDirIdx } of getNeighbors(riftHex, riftLabel)) {
        if (visited.has(outLabel)) continue;
        // a) Passable non-rift neighbor
        if (!outNeighbor.effects?.has('rift') && isPassable(outNeighbor)) {
          visited.set(outLabel, dist);
          nextLayer.add(outLabel);
        }
        // b) Hyperlane expansion from rift
        if (outNeighbor.matrix && outNeighbor.matrix.some(r => r.includes(1))) {
          const entryDir = (outDirIdx + 3) % 6;
          const endpoints = mapHyperlaneReachables(outLabel, entryDir, opts);
          for (const { label: dest, fromLabel, entrySide } of endpoints) {
            const destHex = editor.hexes[dest];
            const fromHex = editor.hexes[fromLabel];
            if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;

            // --- BORDER ANOMALY CHECK before rift flood or visiting ---
            let blocked = false;
            if (useBorderAnomalies) {
              if (
                destHex.borderAnomalies &&
                (
                  destHex.borderAnomalies[entrySide]?.type === "Spatial Tear" ||
                  destHex.borderAnomalies[entrySide]?.type === "Gravity Wave"
                )
              ) {
                blocked = true;
              }
              if (
                fromHex &&
                fromHex.borderAnomalies &&
                fromHex.borderAnomalies[(entrySide + 3) % 6]?.type === "Spatial Tear"
              ) {
                blocked = true;
              }
            }
            if (blocked) continue;

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

    currentLayer = nextLayer;
  }

  // --- 6. Optionally allow "one step out" of a rift at max distance (TI4 rules) ---
  for (const [label, distValue] of Object.entries(visited)) {
    if (distValue !== effectiveMaxDist) continue;
    const current = editor.hexes[label];
    for (const { label: nLabel, hex: neighbor } of getNeighbors(current, label)) {
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

  // --- NESTED HELPER: hyperlane expansion with anomaly context ---
  function mapHyperlaneReachables(startLabel, startEntryDir, opts) {
    const seen = new Set();
    const reachable = [];
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
      //const exits = [];
      //for (let exit = 0; exit < 6; exit++) {
      //  if (tile.matrix[entryDir][exit] === 1 && exit !== entryDir) exits.push(exit);
      //}

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

      // If there's a loopback (entryDir→entryDir) but no other exits, treat the self-loop as a "real exit" (pop out in that direction)
      if (!hasNonLoopExit && tile.matrix[entryDir][entryDir] === 1) {
        exits.push(entryDir);
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

        // BORDER ANOMALY CHECK: only between hyperlane tiles
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
            blocked = true;
          }
          if (
            tile.borderAnomalies &&
            tile.borderAnomalies[exit]?.type === "Spatial Tear"
          ) {
            blocked = true;
          }
        }
        if (blocked) continue;

        if (far.matrix && far.matrix.some(r => r.includes(1))) {
          queue.push({ label: farLabel, entryDir: (exit + 3) % 6 });
        } else if (isPassable(far)) {
          reachable.push({
            label: farLabel,
            fromLabel: tile.label,
            entrySide: (exit + 3) % 6
          });
        }
      }
    }
    return reachable.filter(o => o.label !== startLabel);
  }
}
