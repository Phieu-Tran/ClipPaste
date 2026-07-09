import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Lint only the frontend sources — Rust lives in src-tauri (clippy) and the
// local test suite has its own tooling.
export default tseslint.config({
  files: ['frontend/src/**/*.{ts,tsx}'],
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  plugins: { 'react-hooks': reactHooks },
  languageOptions: {
    globals: {
      window: 'readonly',
      document: 'readonly',
      navigator: 'readonly',
      console: 'readonly',
      setTimeout: 'readonly',
      clearTimeout: 'readonly',
      setInterval: 'readonly',
      clearInterval: 'readonly',
      requestAnimationFrame: 'readonly',
      URLSearchParams: 'readonly',
      URL: 'readonly',
      Blob: 'readonly',
      File: 'readonly',
      FileReader: 'readonly',
      Image: 'readonly',
      HTMLElement: 'readonly',
      HTMLInputElement: 'readonly',
      HTMLTextAreaElement: 'readonly',
      HTMLDivElement: 'readonly',
      HTMLButtonElement: 'readonly',
      KeyboardEvent: 'readonly',
      MouseEvent: 'readonly',
      DragEvent: 'readonly',
      Node: 'readonly',
      atob: 'readonly',
      btoa: 'readonly',
      fetch: 'readonly',
      localStorage: 'readonly',
      React: 'readonly',
    },
  },
  rules: {
    // Classic hook rules only. react-hooks v7 "recommended" also ships the React
    // Compiler checks (refs, set-state-in-effect, purity, …) — this codebase
    // doesn't use the compiler and those flag ~40 working patterns, so enable
    // them deliberately later if the compiler is ever adopted.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // The codebase intentionally swallows errors from fire-and-forget Tauri calls.
    'no-empty': ['error', { allowEmptyCatch: true }],
    // tsc (noUnusedLocals) already enforces this; _-prefixed names are deliberate.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
});
