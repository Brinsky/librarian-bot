const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error', {'allowExpressions': true}],
      // typescript-eslint's recommended set makes this an error as of v8;
      // it was a warning under v5, which is how we still treat it.
      '@typescript-eslint/no-explicit-any': 'warn',
      'indent': ['error', 2, {'SwitchCase': 1}],
      'max-len': ['error', {'code': 80}],
    },
  },
);
