import * as stylex from "@stylexjs/stylex";
import { Cable, Terminal } from "lucide-react";
import { Suspense, useEffect, useLayoutEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Outlet, useLocation } from "react-router";
import { version } from "../../package.json";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { SidebarProvider, useSidebar } from "../components/ui/sidebar";
import { TooltipProvider } from "../components/ui/tooltip";
import type { RootState } from "../store";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";
import { persistPreferences, setSidebar } from "./preferencesSlice";
import { shell } from "./shellStyles";

export function AppShell() {
  const preferences = useSelector((state: RootState) => state.preferences);
  const dispatch = useDispatch();

  useEffect(() => { persistPreferences(preferences); }, [preferences]);
  useLayoutEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = preferences.theme === "dark" || (preferences.theme === "system" && Boolean(query?.matches));
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    if (preferences.theme !== "system" || !query) return;
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [preferences.theme]);

  return <TooltipProvider>
    <SidebarProvider className="h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground"
      open={preferences.sidebar === "expanded"}
      onOpenChange={open => dispatch(setSidebar(open ? "expanded" : "collapsed"))}>
      <Button variant="outline" size="sm" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        onClick={() => document.getElementById("workbench-content")?.focus()}>跳到主内容</Button>
      <AppTopBar />
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
    <Suspense fallback={<p role="status" className="p-4">正在打开页面…</p>}><Outlet /></Suspense>
  </div>;
}

function StatusBar() {
  const connected = useSelector((state: RootState) => state.remote.connections.filter(item => item.connected).length);
  return <footer aria-label="工作台状态" {...stylex.props(shell.status)}>
    <span {...stylex.props(shell.statusItem)}><Terminal size={13} aria-hidden="true" />本地工作区</span>
    <Separator orientation="vertical" className="h-3" />
    <Button render={<Link to="/remote?tab=connections" />} nativeButton={false} variant="link" size="xs">
      <Cable aria-hidden="true" />演示连接 · {connected}
    </Button>
    <span {...stylex.props(shell.version)}>v{version}</span>
  </footer>;
}
