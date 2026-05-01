// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const securityPlugin = require('eslint-plugin-security');

module.exports = defineConfig([
  expoConfig,
  {
    plugins: {
      security: securityPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-script-url': 'error',
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      // P3-K Phase 2 — règles `eslint-plugin-security`. Niveau warn pour ne
      // pas bloquer le CI sur les faux positifs (regex non-litérales, etc.)
      // tout en attirant l'attention en review.
      'security/detect-eval-with-expression': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-object-injection': 'off',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
    },
  },
  {
    ignores: ["dist/*"],
  },
]);
