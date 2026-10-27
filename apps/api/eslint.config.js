// Flat config, 4 nhóm rule bắt buộc theo rule `stack-ts` § ESLint + Prettier
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const strictRules = {
  files: ['**/*.ts'],
  extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked], // type-aware — cần cho no-unsafe-*
  plugins: { 'unused-imports': unusedImports },
  languageOptions: {
    globals: globals.node,
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    // Code app log qua logger của Fastify (rule `policy-log`); script CLI nới ở block dưới
    'no-console': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'unused-imports/no-unused-imports': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
  },
};

// Script chạy tay (vd `src/scripts/send-ipn.ts`) in kết quả ra terminal
const cliScripts = {
  files: ['src/scripts/**/*.ts'],
  rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] },
};

// Zod chỉ import dạng namespace `import * as z from 'zod'`
const ZOD_SOURCE = String.raw`[source.value=/^zod(\/mini)?$/]`;
const zodImports = {
  files: ['**/*.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: [
          `ImportDeclaration${ZOD_SOURCE} > :matches(ImportDefaultSpecifier, ImportSpecifier[imported.name='z'])`,
          `ExportNamedDeclaration${ZOD_SOURCE} > ExportSpecifier[local.name=/^(z|default)$/]`,
          `ExportAllDeclaration${ZOD_SOURCE}[exported!=null]`,
        ].join(', '),
        message: "Use `import * as z from 'zod'`.",
      },
    ],
  },
};

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules']),
  {
    // File config JS không nằm trong project TS
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  strictRules,
  cliScripts,
  zodImports,
  prettier, // cuối mảng — tắt rule format xung đột Prettier
]);
