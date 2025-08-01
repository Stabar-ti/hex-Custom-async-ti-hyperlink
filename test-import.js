// Simple test to check if the module can be imported
console.log('Starting import test...');

import('./src/modules/Milty/miltyBuilderRandomTool.js')
    .then(module => {
        console.log('✅ Module imported successfully');
        console.log('Available exports:', Object.keys(module));
        console.log('generateMiltySlices type:', typeof module.generateMiltySlices);
        console.log('setCurrentSettings type:', typeof module.setCurrentSettings);
    })
    .catch(error => {
        console.error('❌ Import failed:', error);
        console.error('Error details:', error.message);
        console.error('Stack:', error.stack);
    });
