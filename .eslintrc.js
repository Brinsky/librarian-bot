module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': {'allowExpressions': true}
    '@typescript-eslint/indent': ['error', 2],
    '@typescript-eslint/no-parameter-properties': 'off',
    'indent': 'off',
    'max-len': ['error', {'code': 80}]
  },
}
