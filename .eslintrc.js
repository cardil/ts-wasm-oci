module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    curly: 'error',
    quotes: ['error', 'single'],
    semi: ['error', 'never'],
    'arrow-parens': ['error', 'as-needed'],
    'no-console': ['error', { allow: ['warn', 'error'] }]
  }
}
