import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '.docusaurus/',
      '.cache/',
      '**/*.d.ts',
      'docs/',
      'examples/',
    ],
  },

  // Base TypeScript config
  ...tseslint.configs.recommended,

  // Prettier integration (must come after other configs)
  eslintConfigPrettier,
  eslintPluginPrettier,

  // Main source files
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // ── Prettier ──
      'prettier/prettier': 'error',

      // ── TypeScript best practices ──
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        {
          'ts-ignore': 'allow-with-description',
          'ts-expect-error': 'allow-with-description',
        },
      ],

      // ── NestJS best practices ──

      // Prefer const for immutable bindings
      'prefer-const': 'error',

      // No console.log in production code (use NestJS Logger instead)
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Consistent return statements
      'consistent-return': 'off',

      // No duplicate imports
      'no-duplicate-imports': 'error',

      // Prefer template literals over string concatenation
      'prefer-template': 'warn',

      // No var declarations
      'no-var': 'error',

      // Require === instead of ==
      eqeqeq: ['error', 'always'],

      // No unused expressions (catches missing awaits on promises)
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],

      // Enforce consistent interface/type naming
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'interface',
          format: ['PascalCase'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
      ],

      // No floating promises (important for async NestJS handlers)
      '@typescript-eslint/no-floating-promises': 'error',

      // Require await in async functions
      '@typescript-eslint/require-await': 'warn',

      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // Prefer optional chaining
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // No unnecessary type assertions
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',

      // No misused promises (e.g. forgetting to await in conditionals)
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Scripts — no type-aware rules (not in main tsconfig)
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'prettier/prettier': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  // Test files — use test/tsconfig.json and relax rules
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './test/tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off',
    },
  },
);
