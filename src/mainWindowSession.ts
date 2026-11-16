import { invoke } from "@tauri-apps/api/core";
import { islandApi } from "./features/island/islandApi";
import type { IslandConfig } from "./features/island/types";

interface MainWindowSession {
  draft: IslandConfig | null;
}

declare global {
  interface Window {
    __zxMainSession?: MainWindowSession;
  }
}

export const mainWindowSession: MainWindowSession = { draft: null };

/**
 * Await restoration before mounting HashRouter so the route and settings draft start from the same snapshot.
 * The native close handler reads the shared draft from the WebView even if restoration failed at startup.
 */
export async function restoreMainWindow() {
  if (!islandApi.isDesktop()) return;
  try {
    const snapshot = await invoke<(MainWindowSession & { route: string }) | null>("main_window_restore");
    if (snapshot) {
      mainWindowSession.draft = snapshot.draft;
      window.history.replaceState(null, "", snapshot.route);
    }
  } finally {
    window.__zxMainSession = mainWindowSession;
  }
}
