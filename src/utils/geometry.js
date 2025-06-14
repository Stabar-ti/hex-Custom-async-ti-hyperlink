// Geometry utilities
// Functions: hexDistance, getNeighbors, axial math
export function hexDistance(a, b) {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.q + a.r - b.q - b.r),
    Math.abs(a.r - b.r)
  );
}

export const directions = [
  { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
  { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }
];

export function getNeighbors(q, r) {
  return directions.map(d => ({ q: q + d.q, r: r + d.r }));
}
