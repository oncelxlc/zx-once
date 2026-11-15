import { isTauri } from "@tauri-apps/api/core";

export function isWindowsDesktop() {
  return typeof window !== "undefined" && isTauri() && /Windows/i.test(window.navigator.userAgent);
}
