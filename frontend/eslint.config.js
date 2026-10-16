import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'app',           pattern: 'src/app/**' },
        { type: 'design-system', pattern: 'src/design-system/**' },
        { type: 'features',      pattern: 'src/features/**' },
        { type: 'layouts',       pattern: 'src/layouts/**' },
        { type: 'services',      pattern: 'src/services/**' },
        { type: 'stores',        pattern: 'src/stores/**' },
        { type: 'hooks',         pattern: 'src/hooks/**' },
        { type: 'utils',         pattern: 'src/utils/**' },
        { type: 'i18n',          pattern: 'src/i18n/**' },
        { type: 'config',        pattern: 'src/config/**' },
        { type: 'mocks',         pattern: 'src/mocks/**' },
        { type: 'styles',        pattern: 'src/styles/**' },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          { from: 'app',           allow: ['app', 'design-system', 'features', 'layouts', 'services', 'stores', 'hooks', 'utils', 'i18n', 'config'] },
          { from: 'design-system', allow: ['design-system', 'utils'] },
          { from: 'features',      allow: ['design-system', 'services', 'stores', 'hooks', 'utils', 'i18n', 'config'] },
          { from: 'layouts',       allow: ['design-system', 'stores', 'hooks', 'utils', 'i18n', 'config'] },
          { from: 'services',      allow: ['config', 'utils', 'stores'] },
          { from: 'stores',        allow: ['config', 'utils'] },
          { from: 'hooks',         allow: ['design-system', 'services', 'stores', 'utils', 'i18n', 'config'] },
          { from: 'utils',         allow: ['utils'] },
          { from: 'i18n',          allow: ['config'] },
          { from: 'config',        allow: [] },
          { from: 'mocks',         allow: ['features', 'services', 'utils', 'config'] },
        ],
      }],
    },
  },
)
