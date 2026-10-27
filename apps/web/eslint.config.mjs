import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig, globalIgnores } from 'eslint/config';

// 4 nhóm rule bắt buộc (rule stack-ts § ESLint + Prettier)
const strictRules = {
  files: ['**/*.{ts,tsx}'],
  plugins: { 'unused-imports': unusedImports },
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'unused-imports/no-unused-imports': 'error',
  },
};

// Icon chỉ import qua wrapper
const ICON_IMPORT_MESSAGE = "Import icons from '@/components/custom/icon' instead.";

const iconImports = {
  files: ['**/*.{ts,tsx}'],
  ignores: ['src/components/ui/**', 'src/components/custom/icon.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [{ name: 'lucide-react', message: ICON_IMPORT_MESSAGE }],
        patterns: [{ group: ['lucide-react/*'], message: ICON_IMPORT_MESSAGE }],
      },
    ],
  },
};

// Chặn import { z } / default của Zod + export
const ZOD_SOURCE = String.raw`[source.value=/^(zod|zod\/mini|@\/lib\/zod-mini)$/]`;
const ZOD_SELECTOR = [
  `ImportDeclaration${ZOD_SOURCE} > :matches(ImportDefaultSpecifier, ImportSpecifier[imported.name='z'])`,
  `ExportNamedDeclaration${ZOD_SOURCE} > ExportSpecifier[local.name=/^(z|default)$/]`,
  `ExportAllDeclaration${ZOD_SOURCE}[exported!=null]`,
].join(', ');
const ZOD_IMPORT_MESSAGE = 'Use `import * as z` (zod, @/lib/zod-mini): `z` pulls every locale.';

const zodImports = {
  files: ['**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': ['error', { selector: ZOD_SELECTOR, message: ZOD_IMPORT_MESSAGE }],
  },
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  strictRules,
  iconImports,
  zodImports,
  prettier, // cuối mảng — tắt rule format xung đột Prettier
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/types/api*.gen.d.ts']),
]);
