import globals from 'globals';
import { baseConfig } from '@kent360/config/eslint';

export default [
  { ignores: ['dist/**', 'coverage/**', 'src/generated/**'] },
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
];
