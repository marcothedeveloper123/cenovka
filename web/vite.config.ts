import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // public/data is a symlink to ../../data/canonical so the dev server serves
  // /data/*.json straight from the scraper output with no copy step.
  //
  // For builds that symlink is a liability: Vite follows it and copies the whole
  // directory, including the 53 MB uncompressed latest.json and the gitignored
  // per-day metrics — a 69 MB dist, with one file over Cloudflare Pages' 25 MB
  // per-file limit. public/ holds nothing else, so builds skip it entirely and
  // scripts/copy-data.mjs copies the four gzipped files the SPA actually fetches.
  publicDir: command === 'serve' ? 'public' : false,
  server: { fs: { allow: ['..'] } },
}));
