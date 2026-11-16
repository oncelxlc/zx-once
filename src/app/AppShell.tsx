import * as stylex from "@stylexjs/stylex";
import { invoke } from "@tauri-apps/api/core";
import { Cable, Terminal } from "lucide-react";
import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Outlet, useLocation } from "react-router";
import { version } from "../../package.json";
import { Button } from "../components/ui/button";
import { SidebarProvider, useSidebar } from "../components/ui/sidebar";
import { TooltipProvider } from "../components/ui/tooltip";
import { isWindowsDesktop } from "../lib/isWindowsDesktop";
import type { RootState } from "../store";
import { AppSidebar } from "./AppSidebar";
import { WindowNavigation } from "./WindowNavigation";
import { persistPreferences, setSidebar } from "./preferencesSlice";
import { shell } from "./shellStyles";

export function AppShell() {
  const preferences = useSelector((state: RootState) => state.preferences);
  const dispatch = useDispatch();
  const captionUpdate = useRef(Promise.resolve());
  const { enabled, percent } = preferences.translucency;
  const transparencyPercent = enabled ? percent : 0;

  useEffect(() => { persistPreferences(preferences); }, [preferences]);
  useLayoutEffect(() => {
    // The mobile navigation is portalled outside the shell and inherits appearance from the document.
    const root = document.documentElement;
    root.dataset.translucent = String(enabled);
    root.style.setProperty("--frame-transparency", `${percent}%`);
    return () => {
      delete root.dataset.translucent;
      root.style.removeProperty("--frame-transparency");
    };
  }, [enabled, percent]);
  useLayoutEffect(() => {
    if (!isWindowsDesktop()) return;
    const root = document.documentElement;
    // Keep the confirmed backdrop visible between slider updates. Only unmount releases this marker.
    root.dataset.nativeBackdrop = "false";
    return () => { delete root.dataset.nativeBackdrop; };
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    const desktop = isWindowsDesktop();
    const forcedColors = desktop ? window.matchMedia?.("(forced-colors: active)") : undefined;
    const reducedTransparency = desktop ? window.matchMedia?.("(prefers-reduced-transparency: reduce)") : undefined;
    let revision = 0;
    const apply = () => {
      const dark = preferences.theme === "dark" || (preferences.theme === "system" && Boolean(systemTheme?.matches));
      root.classList.toggle("dark", dark);
      root.dataset.theme = dark ? "dark" : "light";
      if (!desktop) return;
      const request = ++revision;
      const effectivePercent = forcedColors?.matches || reducedTransparency?.matches ? 0 : transparencyPercent;
      if (effectivePercent === 0) root.dataset.nativeBackdrop = "false";
      // Serialize HWND changes and use only the current reply to expose the WebView's transparent canvas.
      captionUpdate.current = captionUpdate.current.then(async () => {
        if (request !== revision) return;
        const colors = getComputedStyle(root);
        const available = await invoke<boolean>("set_main_window_chrome", {
          dark,
          transparencyPercent: effectivePercent,
          background: colors.getPropertyValue("--sidebar").trim(),
          foreground: colors.getPropertyValue("--sidebar-foreground").trim(),
          border: colors.getPropertyValue("--sidebar-border").trim(),
        });
        if (request !== revision) return;
        root.dataset.nativeBackdrop = String(available === true && effectivePercent > 0);
      }).catch(error => {
        if (request !== revision) return;
        root.dataset.nativeBackdrop = "false";
        console.warn("无法同步原生窗口外观", error);
      });
    };
    apply();
    systemTheme?.addEventListener("change", apply);
    forcedColors?.addEventListener("change", apply);
    reducedTransparency?.addEventListener("change", apply);
    return () => {
      revision++;
      systemTheme?.removeEventListener("change", apply);
      forcedColors?.removeEventListener("change", apply);
      reducedTransparency?.removeEventListener("change", apply);
    };
  }, [preferences.theme, transparencyPercent]);

  return <TooltipProvider>
    <SidebarProvider className="h-dvh min-h-0 flex-col overflow-hidden bg-sidebar text-foreground"
      open={preferences.sidebar === "expanded"}
      onOpenChange={open => dispatch(setSidebar(open ? "expanded" : "collapsed"))}>
      <Button variant="outline" size="sm" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        onClick={() => document.getElementById("workbench-content")?.focus()}>跳到主内容</Button>
      <Workspace />
      <StatusBar />
    </SidebarProvider>
  </TooltipProvider>;
}

function Workspace() {
  const { isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  useEffect(() => { setOpenMobile(false); }, [isMobile, location.key, setOpenMobile]);
  return <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
    <AppSidebar />
    <div className="m-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background md:m-1.5 md:ml-0">
      <Suspense fallback={<p role="status" className="flex-1 bg-background p-4">正在打开页面…</p>}><Outlet /></Suspense>
    </div>
  </div>;
}

function StatusBar() {
  const connected = useSelector((state: RootState) => state.remote.connections.filter(item => item.connected).length);
  return <footer data-slot="workbench-status" aria-label="工作台状态" {...stylex.props(shell.status)}>
    <WindowNavigation />
    <span title="本地工作区" {...stylex.props(shell.statusItem)}><Terminal size={13} aria-hidden="true" />
      <span className="max-[359px]:sr-only">本地工作区</span></span>
    <Button render={<Link to="/remote?tab=connections" />} nativeButton={false} variant="link" size="xs" className="text-sidebar-foreground">
      <Cable aria-hidden="true" />演示连接 · {connected}
    </Button>
    <span {...stylex.props(shell.version)}>v{version}</span>
  </footer>;
}
