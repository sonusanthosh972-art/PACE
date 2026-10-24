// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'android/*', 'ios/*', 'coverage/*', '.expo/*']),
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    // Test helper backed by Node's built-in SQLite, newer than the import resolver's builtin list.
    files: ['src/data/testing/**'],
    settings: { 'import/core-modules': ['node:sqlite'] },
  },
]);
