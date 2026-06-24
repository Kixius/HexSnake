/**
 * Desktop (Tauri) detection + app exit. The process plugin is statically
 * imported (Vite bundles it; it's tiny and never runs on web). On web
 * `isTauri()` is false, so `exitApp` is a no-op and the Exit button is hidden.
 */
import { exit } from '@tauri-apps/plugin-process';

export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

/** Exit the desktop app. No-op on web. */
export function exitApp(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return exit(0);
}
