// src/modules/Milty/miltyBuilder.js
// Re-export main function for backward compatibility

import { showMiltyBuilderUI } from './miltyBuilderUI.js';
import { showMiltyHelp, showImportSlicesPopup } from './miltyBuilderPopups.js';

// Export the main function that specialModePopup.js expects
export { showMiltyBuilderUI, showMiltyHelp, showImportSlicesPopup };
