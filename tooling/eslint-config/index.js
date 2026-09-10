// @ts-check
import { tanstackConfig } from '@tanstack/eslint-config';

// Repo rules (AGENTS.md): strict TypeScript, no `any`, types over interfaces, no default exports
// except where a framework requires one, no barrel files (SPEC 3.3 item 2).
//
// The TanStack config is type aware (parserOptions.project: true), so every linted .ts, .tsx and
// .js file must belong to a tsconfig project. Root config files and the tooling packages are not
// in any project and are ignored below; scripts/*.mjs are outside the TanStack file glob.

const repoRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
  '@typescript-eslint/array-type': 'off',
  '@typescript-eslint/require-await': 'off',
  'import/no-cycle': 'off',
  'import/order': 'off',
  'sort-imports': 'off',
  'no-restricted-syntax': [
    'error',
    {
      selector: 'ExportDefaultDeclaration',
      message: 'No default exports except where a framework requires one (AGENTS.md).',
    },
    {
      selector: 'ExportAllDeclaration',
      message:
        'No barrel re-exports; export TypeScript source through explicit subpaths (SPEC 3.3).',
    },
  ],
};

const frameworkDefaultExports = [
  '**/vite.config.ts',
  '**/vite.*.config.ts',
  '**/vitest.config.ts',
  '**/playwright.config.ts',
  '**/tsdown.config.ts',
];

/** @type {import('eslint').Linter.Config[]} */
export const turboslideConfig = [
  ...tanstackConfig.map((config) =>
    config.name === 'tanstack/javascript'
      ? { ...config, rules: { ...config.rules, ...repoRules } }
      : config,
  ),
  {
    files: frameworkDefaultExports,
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.tanstack/**',
      '**/.nitro/**',
      '.turbo/**',
      '.turboslide/**',
      'decks/**',
      '**/routeTree.gen.ts',
      '**/*.gen.ts',
      'packages/agent/generated/**',
      'eslint.config.js',
      'vitest.config.ts',
      'playwright.config.ts',
      'tooling/**',
    ],
  },
];
