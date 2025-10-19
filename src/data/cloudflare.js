/**
 * Cloudflare Turnstile integration for secure map exports
 * Provides functionality to get Turnstile tokens and upload maps to Cloudflare Workers
 */

const API_ORIGIN = "https://gateway.stabarrabats.workers.dev"; // TODO: Replace with your gateway Worker URL

// Optimized Turnstile readiness check
let turnstileReady = false;

// Use requestIdleCallback for better performance
function initializeTurnstile() {
    if (window.turnstile && document.querySelector('.cf-turnstile')) {
        turnstileReady = true;
        console.log('Cloudflare.js: Turnstile integration ready');
    }
}

// Check readiness when browser is idle
if ('requestIdleCallback' in window) {
    window.addEventListener('load', () => requestIdleCallback(initializeTurnstile));
} else {
    window.addEventListener('load', initializeTurnstile);
}

// Minimal DOM check
document.addEventListener('DOMContentLoaded', () => {
    const widget = document.querySelector('.cf-turnstile');
    if (!widget) {
        console.warn('Cloudflare.js: Turnstile widget not found in DOM');
    }
});

/**
 * Get a one-time Turnstile token for verification
 * @returns {Promise<string>} The Turnstile token
 */
async function getTurnstileToken() {
    return new Promise((resolve, reject) => {
        const checkTurnstile = () => {
            if (!window.turnstile) {
                return reject(new Error("Turnstile SDK not loaded. Please refresh the page."));
            }

            const turnstileElement = document.querySelector(".cf-turnstile");
            if (!turnstileElement) {
                return reject(new Error("Turnstile widget not found"));
            }

            try {
                turnstile.execute(turnstileElement, {
                    callback: (token) => {
                        console.log('Turnstile verification completed');
                        resolve(token);
                    },
                    "error-callback": (error) => {
                        console.error('Turnstile verification failed:', error);
                        reject(new Error("Turnstile verification failed"));
                    }
                });
            } catch (error) {
                console.error('Error executing Turnstile:', error);
                reject(new Error("Failed to execute Turnstile: " + error.message));
            }
        };

        // Check immediately if ready, otherwise wait
        if (turnstileReady || window.turnstile) {
            checkTurnstile();
        } else {
            setTimeout(checkTurnstile, 1000);
        }
    });
}

/**
 * Save map data to Cloudflare with Turnstile verification
 * Creates a temporary download link valid for ~15 minutes
 * @param {Object} editor - The editor instance
 * @returns {Promise<string>} The signed download URL
 */
async function saveMapToCloudflare(editor) {
    try {
        // Get Turnstile token for verification
        const token = await getTurnstileToken();

        // Import the export function dynamically to avoid circular dependencies
        const { exportFullState } = await import('./export.js');

        // Get the JSON export data
        const json = exportFullState(editor);

        // Send to Cloudflare Worker
        const res = await fetch(`${API_ORIGIN}/upload`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-turnstile": token
            },
            body: json
        });

        const out = await res.json();

        if (!res.ok) {
            throw new Error(out.error || res.statusText);
        }

        return out.signed_url;
    } catch (error) {
        console.error('Failed to save map to Cloudflare:', error);
        throw error;
    }
}

/**
 * Save map info data to Cloudflare with Turnstile verification
 * Creates a temporary download link valid for ~15 minutes
 * @param {Object} editor - The editor instance
 * @returns {Promise<string>} The signed download URL
 */
async function saveMapInfoToCloudflare(editor) {
    try {
        // Get Turnstile token for verification
        const token = await getTurnstileToken();

        // Import the export function dynamically to avoid circular dependencies
        const { exportMapInfo } = await import('./export.js');

        // Get the JSON export data - this returns { mapInfo: [...] }
        const mapInfoData = exportMapInfo(editor);
        
        console.log('Sending map info to server:', {
            dataSize: JSON.stringify(mapInfoData).length,
            hexCount: mapInfoData.mapInfo ? mapInfoData.mapInfo.length : 0
        });

        // Send to Cloudflare Worker
        const res = await fetch(`${API_ORIGIN}/upload-mapinfo`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-turnstile": token
            },
            body: JSON.stringify(mapInfoData, null, 2)
        });

        const out = await res.json();

        if (!res.ok) {
            throw new Error(out.error || res.statusText);
        }

        console.log('Map info uploaded successfully:', out);
        return out.signed_url;
    } catch (error) {
        console.error('Failed to save map info to Cloudflare:', error);
        throw error;
    }
}

/**
 * Show the download link to the user with manual copy option
 * @param {string} url - The signed download URL
 * @param {string} type - Type of export (for display purposes)
 */
function showDownloadLink(url, type = 'map') {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: var(--bg-main, #1e1e1e);
        color: var(--text-main, #e0e0e0);
        padding: 30px;
        border-radius: 8px;
        max-width: 600px;
        width: 90%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    // Create content HTML
    modal.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: var(--accent, #4CAF50);">
            ${type.charAt(0).toUpperCase() + type.slice(1)} Download Ready
        </h3>
        <p style="margin: 0 0 15px 0;">
            Your download link is ready and valid for approximately 15 minutes.
        </p>
        <div style="
            background: var(--bg-secondary, #2d2d2d);
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 15px;
            border: 1px solid var(--border, #444);
        ">
            <input 
                type="text" 
                id="download-link-input"
                readonly
                value="${url}"
                style="
                    width: 100%;
                    background: transparent;
                    border: none;
                    color: var(--text-main, #e0e0e0);
                    font-family: monospace;
                    font-size: 12px;
                    outline: none;
                    cursor: text;
                "
            />
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="copy-link-btn" style="
                padding: 8px 16px;
                background: var(--accent, #4CAF50);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">
                Copy Link
            </button>
            <button id="download-now-btn" style="
                padding: 8px 16px;
                background: var(--accent-secondary, #2196F3);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">
                Download Now
            </button>
            <button id="close-modal-btn" style="
                padding: 8px 16px;
                background: var(--bg-secondary, #555);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">
                Close
            </button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Get elements
    const input = document.getElementById('download-link-input');
    const copyBtn = document.getElementById('copy-link-btn');
    const downloadBtn = document.getElementById('download-now-btn');
    const closeBtn = document.getElementById('close-modal-btn');

    // Auto-select text when clicking input
    input.addEventListener('click', () => {
        input.select();
    });

    // Copy button handler
    copyBtn.addEventListener('click', async () => {
        input.select();
        
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                copyBtn.textContent = '✓ Copied!';
                copyBtn.style.background = '#4CAF50';
            } else {
                // Fallback for older browsers
                document.execCommand('copy');
                copyBtn.textContent = '✓ Copied!';
                copyBtn.style.background = '#4CAF50';
            }
            
            setTimeout(() => {
                copyBtn.textContent = 'Copy Link';
                copyBtn.style.background = 'var(--accent, #4CAF50)';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            copyBtn.textContent = '✗ Failed';
            setTimeout(() => {
                copyBtn.textContent = 'Copy Link';
            }, 2000);
        }
    });

    // Download button handler
    downloadBtn.addEventListener('click', () => {
        window.open(url, '_blank');
    });

    // Close button handler
    const closeModal = () => {
        document.body.removeChild(overlay);
    };
    
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    // Auto-copy to clipboard on show (as before)
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).catch(err => {
            console.warn('Auto-copy to clipboard failed:', err);
        });
    }

    // Auto-select the text for easy manual copy
    setTimeout(() => input.select(), 100);
}

/**
 * Main function to save map and show download link
 * This should be wired to your "Save (48 h link)" button
 * @param {Object} editor - The editor instance
 */
async function saveMap(editor) {
    try {
        const url = await saveMapToCloudflare(editor);
        showDownloadLink(url, 'map');
    } catch (error) {
        alert(`Failed to save map: ${error.message}`);
    }
}

/**
 * Main function to save map info and show download link
 * @param {Object} editor - The editor instance
 */
async function saveMapInfo(editor) {
    try {
        const url = await saveMapInfoToCloudflare(editor);
        showDownloadLink(url, 'map info');
    } catch (error) {
        alert(`Failed to save map info: ${error.message}`);
    }
}

export {
    getTurnstileToken,
    saveMapToCloudflare,
    saveMapInfoToCloudflare,
    saveMap,
    saveMapInfo,
    showDownloadLink
};