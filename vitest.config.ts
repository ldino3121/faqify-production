/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    env: { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-only', VITE_PUBLIC_APP_URL: 'https://example.com' },
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    pool: 'forks',
    maxWorkers: 1,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src'), 'npm:unpdf@1.4.0': 'unpdf', 'npm:mammoth@1.11.0': 'mammoth' },
  },
});
