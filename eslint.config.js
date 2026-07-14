import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';

const tsFiles = ['**/*.{ts,tsx}'];

const jsRecommendedForTs = {
  ...js.configs.recommended,
  files: tsFiles,
};

const tsRecommended = tseslint.configs.recommended.map((config) =>
  config.files ? config : { ...config, files: tsFiles },
);

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
      'src-tauri/rawler/**',
      'data/**',
    ],
  },
  jsRecommendedForTs,
  ...tsRecommended,
  {
    files: tsFiles,
    plugins: {
      react,
      'react-hooks': reactHooks,
      i18next,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'i18next/no-literal-string': [
        'warn',
        {
          markupOnly: true,
          ignoreAttribute: [
            'className',
            'style',
            'data-tooltip',
            'variant',
            'size',
            'color',
            'weight',
            'fillOrigin',
            'id',
            'name',
            'type',
            'value',
            'label',
            'placeholder',
            'stroke',
            'fill',
            'viewBox',
          ],
        },
      ],
    },
  },
];
