import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the bundle loads correctly inside Tauri's WebView.
  base: './',
  server: {
    port: 5173,
    // Fail loudly instead of silently moving ports (Tauri's devUrl is pinned to 5173).
    strictPort: true,
    // Tauri opens its own window; don't also pop a browser tab during `tauri dev`.
    open: false,
  },
  build: { target: 'esnext' },
});
