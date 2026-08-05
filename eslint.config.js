// ESLint flat config.
//
// This project has no bundler: index.html loads src/ as native ES modules, so a bad import
// path or a named import that doesn't exist is a blank page at runtime with nothing to catch
// it. That is what this config is mainly for — import/no-unresolved and import/named do the
// job a bundler would otherwise do at build time.
//
// Linting does NOT change how the app runs. `python server.py` (or opening index.html)
// still works exactly as before; nothing is compiled and no output directory is produced.

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
    {
        ignores: [
            'src/Depricated/**',          // dead code, imported by nothing
            'src/features/history_original.js', // pre-refactor copy, kept for reference
            'node_modules/**',
            'public/**',
            'html test/**',
            '.VSCodeCounter/**'
        ]
    },

    js.configs.recommended,

    {
        files: ['src/**/*.js'],
        plugins: { import: importPlugin },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Cross-module escape hatches this codebase deliberately hangs off window.
                editor: 'writable',
                loreManager: 'writable',
                tokenManager: 'writable',
                tokenOverlay: 'writable'
            }
        },
        settings: {
            'import/resolver': {
                node: { extensions: ['.js'] }
            }
        },
        rules: {
            // The point of the exercise: catch what a bundler would catch.
            'import/no-unresolved': 'error',
            'import/named': 'error',
            'import/default': 'error',
            'import/export': 'error',
            'import/no-duplicates': 'warn',

            // Genuine bug classes, not style.
            'no-unused-vars': ['warn', {
                args: 'none',
                varsIgnorePattern: '^_',
                caughtErrors: 'none'
            }],
            'no-console': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    }
];
