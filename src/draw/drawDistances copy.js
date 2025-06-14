export function calculateDistancesFrom(editor, sourceLabel, maxDist = 3) {
  // 1) Options for tile effects
  const useSupernova = editor.options?.useSupernova ?? true;
  const useRift = editor.options?.useRift ?? true;
  const useNebula = editor.options?.useNebula ?? true;
  const useAsteroid = editor.options?.useAsteroid ?? true;

  // "Passable" helper
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

  // Neighbors (axial + wormhole)
  function getNeighbors(hex) {
    const results = [];
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
    for (const [label, h] of Object.entries(editor.hexes)) {
      if (h.wormholes?.size && hex.wormholes && [...hex.wormholes].some(type => h.wormholes.has(type))) {
        results.push({ label, hex: h, dirIdx: null });
      }
    }
    return results;
  }

  // Hyperlane reachability (virtual portal logic)
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
      const loopDirs = [];
      for (let d = 0; d < 6; d++) {
        if (tile.matrix[d][d] === 1) loopDirs.push(d);
      }
      const exits = [];
      for (let exit = 0; exit < 6; exit++) {
        if (tile.matrix[entryDir][exit] === 1 && exit !== entryDir) exits.push(exit);
      }
      if (loopDirs.includes(entryDir)) {
        for (const other of loopDirs) {
          if (other !== entryDir) exits.push(other);
        }
      }
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
          queue.push({ label: farLabel, entryDir: (exit + 3) % 6 });
        } else if (isPassable(far)) {
          reachable.add(farLabel);
        }
      }
    }
    reachable.delete(startLabel);
    return Array.from(reachable);
  }

  // 2) Symmetrize hyperlane matrices (defensive)
  for (const hex of Object.values(editor.hexes)) {
    if (!hex.matrix) continue;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (hex.matrix[i][j]) hex.matrix[j][i] = 1;
      }
    }
  }

  // 3) BFS with correct rift chaining logic
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

  for (let dist = 1; dist <= effectiveMaxDist; dist++) {
    const nextLayer = new Set();
    for (const label of currentLayer) {
      const current = editor.hexes[label];
      // ... nebula/supernova check ...
      for (const { label: nLabel, hex: neighbor, dirIdx } of getNeighbors(current)) {
        if (visited.has(nLabel)) continue;

        // RIFT PATCH: Flood rift network and adjacent non-rift, add all to nextLayer
        if (useRift && neighbor.effects?.has('rift')) {
          const riftFlooded = [];
          function riftFloodFrom(label) {
            if (visited.has(label)) return;
            visited.set(label, dist);
            nextLayer.add(label);
            riftFlooded.push(label);
            const hex = editor.hexes[label];
            for (const { label: nLabel, hex: neighbor } of getNeighbors(hex)) {
              if (neighbor.effects?.has('rift') && !visited.has(nLabel)) {
                riftFloodFrom(nLabel);
              }
            }
          }
          riftFloodFrom(nLabel);

          // Adjacent non-rift, add to nextLayer
          for (const riftLabel of riftFlooded) {
            const riftHex = editor.hexes[riftLabel];
            // 1. Adjacency: Add all passable non-rift neighbors
            for (const { label: outLabel, hex: outNeighbor, dirIdx } of getNeighbors(riftHex)) {
              if (visited.has(outLabel)) continue;
              if (!outNeighbor.effects?.has('rift') && isPassable(outNeighbor)) {
                visited.set(outLabel, dist);
                nextLayer.add(outLabel);
              }
              // 2. Hyperlane: Propagate to all reachable by hyperlane from this rift
              if (outNeighbor.matrix && outNeighbor.matrix.some(r => r.includes(1))) {
                const entryDir = (dirIdx + 3) % 6;
                const endpoints = mapHyperlaneReachables(outLabel, entryDir);
                for (const dest of endpoints) {
                  const destHex = editor.hexes[dest];
                  if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;
                  visited.set(dest, dist);
                  nextLayer.add(dest);
                }
              }
            }
          }
          continue; // Done for this neighbor
        }

        // --- BFS continues as before, including hyperlanes ---
        const isRiftBridge = current.effects?.has('rift') && neighbor.effects?.has('rift');
        const allowSourcePass = (label === sourceLabel);
        if (isPassable(neighbor, allowSourcePass) || isRiftBridge) {
          visited.set(nLabel, dist);
          nextLayer.add(nLabel);
        } else if (neighbor.matrix && neighbor.matrix.some(r => r.includes(1))) {
          const entryDir = (dirIdx + 3) % 6;
          const endpoints = mapHyperlaneReachables(nLabel, entryDir);
          for (const dest of endpoints) {
            const destHex = editor.hexes[dest];
            if (!destHex || visited.has(dest) || !isPassable(destHex)) continue;
            visited.set(dest, dist);
            nextLayer.add(dest);
          }
        }
      }
    }
    currentLayer = nextLayer;
  }

  // Optional: from each rift, expand to 1-layer of passable non-rifts at maxDist (TI4 rules: optional, comment/uncomment as needed)
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

  // --- Return result (with rift-shift fix for starting on rift)
  const rawDistances = Object.fromEntries(visited);
  if (!shouldShift) return rawDistances;

  const shifted = {};
  for (const [label, d] of Object.entries(rawDistances)) {
    shifted[label] = d === 0 ? 0 : Math.max(1, d - 1);
  }
  return shifted;
}
