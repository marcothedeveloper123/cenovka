import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // public/data is a symlink to ../../data/canonical so the dev server serves
  // /data/latest.json and /data/groups.json straight from the scraper output.
  // For production builds, the prebuild script copies the same files in.
  server: { fs: { allow: ['..'] } },
});
