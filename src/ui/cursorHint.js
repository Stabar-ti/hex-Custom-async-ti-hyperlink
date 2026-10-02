// @ts-check
/**
 * A short label that follows the mouse — "Click an adjacent tile" — for a one-shot step
 * whose instruction belongs where you are looking, not in a corner chip or the status bar.
 *
 * One at a time; showing another replaces the text. `flash` swaps in a warning for a
 * moment and then puts the instruction back.
 */

const OFFSET_X = 16;
const OFFSET_Y = 18;

/** @type {HTMLElement|null} */
let hint = null;
let text = '';
let flashTimer = 0;
let lastX = 0;
let lastY = 0;

/** @param {MouseEvent} e */
function follow(e) {
    lastX = e.clientX;
    lastY = e.clientY;
    position();
}

function position() {
    if (!hint) return;
    const { width, height } = hint.getBoundingClientRect();
    let x = lastX + OFFSET_X;
    let y = lastY + OFFSET_Y;
    if (x + width > window.innerWidth - 4) x = lastX - width - 8;
    if (y + height > window.innerHeight - 4) y = lastY - height - 8;
    hint.style.left = `${x}px`;
    hint.style.top = `${y}px`;
}

/**
 * @param {string} message
 * @param {{ x?: number, y?: number }} [at]  where the pointer is now, if known —
 *   otherwise the hint waits for the first mousemove to appear in the right place
 */
export function showCursorHint(message, at = {}) {
    text = message;
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'cursor-hint';
        hint.setAttribute('role', 'status');
        document.body.appendChild(hint);
        document.addEventListener('mousemove', follow, true);
    }
    clearTimeout(flashTimer);
    hint.classList.remove('is-warning');
    hint.textContent = message;
    if (typeof at.x === 'number' && typeof at.y === 'number') {
        lastX = at.x;
        lastY = at.y;
    }
    position();
}

/** Shows `message` as a warning for a moment, then the instruction again. */
export function flashCursorHint(message, ms = 1600) {
    if (!hint) return;
    clearTimeout(flashTimer);
    hint.classList.add('is-warning');
    hint.textContent = message;
    position();
    flashTimer = window.setTimeout(() => {
        if (!hint) return;
        hint.classList.remove('is-warning');
        hint.textContent = text;
        position();
    }, ms);
}

export function hideCursorHint() {
    clearTimeout(flashTimer);
    document.removeEventListener('mousemove', follow, true);
    hint?.remove();
    hint = null;
    text = '';
}
