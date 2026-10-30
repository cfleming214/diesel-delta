// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'dist-e2e/*', 'design/*', '.expo/*', 'supabase/functions/*'],
  },
  {
    // The phosphor index bundles every icon (~6 MB); icons come from src/ui/icons.ts.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phosphor-react-native',
              message: "Import icons from '@/ui/icons'.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
]);
