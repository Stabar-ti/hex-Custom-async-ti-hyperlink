// @ts-check
/**
 * Ask for one line of text in a small in-page dialog, where the native prompt() would be
 * jarring: a sector's name, say. Yes/no confirmations stay with window.confirm.
 *
 * It can also say what is wrong with what was typed and let it be fixed in place, which
 * prompt() cannot — that took a separate alert() and starting over.
 */

import { el, button } from './kit/index.js';
import { showPopup, hidePopup } from './popupUI.js';

const POPUP_ID = 'askTextPopup';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.label]      a line above the box
 * @param {string} [opts.value]      what the box starts with
 * @param {string} [opts.okLabel]
 * @param {(value: string) => string} [opts.normalize]  applied before validating and returning
 * @param {(value: string) => string|null} [opts.validate]  why the value will not do, or null
 * @returns {Promise<string|null>}  the accepted value, or null when cancelled
 */
export function askText({ title, label, value = '', okLabel = 'OK', normalize = v => v, validate = () => null }) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (/** @type {string|null} */ result) => {
            if (settled) return;
            settled = true;
            hidePopup(POPUP_ID);
            resolve(result);
        };

        const input = /** @type {HTMLInputElement} */ (el('input', {
            className: 'input-dark ask-text__input',
            attrs: { spellcheck: 'false', autocomplete: 'off' },
        }));
        input.value = value;
        const error = el('div', { className: 'ask-text__error' });
        const ok = button({ text: okLabel, variant: 'primary' });
        const cancel = button({ text: 'Cancel' });

        const submit = () => {
            const v = normalize(input.value);
            const problem = validate(v);
            if (problem) {
                error.textContent = problem;
                input.focus();
                return;
            }
            finish(v);
        };
        ok.addEventListener('click', submit);
        cancel.addEventListener('click', () => finish(null));
        input.addEventListener('keydown', (e) => {
            // Kept from the map's own key handlers: Escape there disarms tools, and letters
            // are shortcuts.
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { e.preventDefault(); finish(null); }
        });
        input.addEventListener('input', () => { error.textContent = ''; });

        const content = el('div', {
            className: 'ask-text ui-stack ui-stack--normal',
            children: [
                label && el('div', { className: 'ask-text__label', text: label }),
                input,
                error,
                el('div', { className: 'ui-btn-row', children: [ok, cancel] }),
            ],
        });

        showPopup({
            id: POPUP_ID,
            title,
            content,
            modal: true,
            draggable: true,
            dragHandleSelector: '.popup-ui-titlebar',
            style: { width: '320px' },
            onClose: () => finish(null),
        });
        // After the popup has taken focus for itself, so typing goes straight into the box.
        setTimeout(() => { input.focus(); input.select(); }, 0);
    });
}
