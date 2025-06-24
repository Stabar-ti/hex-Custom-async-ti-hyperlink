// ─────────────── utils/matrix.js ───────────────

/**
 * Convert a 6×6 binary matrix to a compact hex string (9 hex chars)
 */
export function matrixToHex(matrix) {
  const binStr = matrix.flat().join('');
  return BigInt('0b' + binStr).toString(16).padStart(9, '0');
}

/**
 * Convert a hex string (up to 9 hex chars) to a 6×6 binary matrix
 */
export function hexToMatrix(hexStr) {
  const bin = BigInt('0x' + hexStr).toString(2).padStart(36, '0');
  return Array.from({ length: 6 }, (_, i) =>
    bin.slice(i * 6, i * 6 + 6).split('').map(ch => +ch)
  );
}

/**
 * Check if a matrix has any links (value === 1)
 */
export function hasLinks(matrix) {
  return matrix.flat().includes(1);
}


export function isMatrixEmpty(matrix) {
  if (!Array.isArray(matrix)) return true;
  return matrix.every(row => row.every(cell => cell === 0));
}
/*
export function getOppositeSide(side) {
    // 0-5 (hex sides): opposite is (side + 3) % 6
    return (parseInt(side) + 3) % 6;
}
    */