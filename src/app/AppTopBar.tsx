import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { SidebarTrigger, useSidebar } from "../components/ui/sidebar";
import { isWindowsDesktop } from "../lib/isWindowsDesktop";
import { notify } from "./toasts";

export function AppTopBar() {
  const { isMobile, open, openMobile } = useSidebar();
  const [nativeWindow, setNativeWindow] = useState<ReturnType<typeof getCurrentWindow> | null>(null);
  const [maximized, setMaximized] = useState(false);
  const navLabel = isMobile ? "打开导航" : open ? "收起侧栏" : "展开侧栏";
  const maximizeLabel = maximized ? "还原窗口" : "最大化窗口";

  useEffect(() => {
    if (!isWindowsDesktop()) return;
    let active = true;
    async function enableTitleBar() {
      const win = getCurrentWindow();
      const initial = await win.isMaximized();
      if (!active) return;
      // Keep the system buttons available until the main window accepts the custom title bar.
      await win.setDecorations(false);
      if (active) {
        setMaximized(initial);
        setNativeWindow(win);
      }
    }
    void enableTitleBar().catch(error => { if (active) console.warn("无法启用自定义窗口栏", error); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!nativeWindow) return;
    let sequence = 0;
    const syncMaximized = () => {
      const current = ++sequence;
      void nativeWindow.isMaximized().then(value => {
        if (sequence === current) setMaximized(value);
      }).catch(error => console.warn("无法读取窗口状态", error));
    };
    window.addEventListener("resize", syncMaximized);
    return () => { sequence++; window.removeEventListener("resize", syncMaximized); };
  }, [nativeWindow]);

  async function runWindowAction(action: Promise<void>) {
    try {
      await action;
    } catch (error) {
      notify(`窗口操作失败：${String(error)}`, true);
      try {
        await nativeWindow?.setDecorations(true);
        setNativeWindow(null);
      } catch (restoreError) {
        console.warn("无法恢复系统窗口栏", restoreError);
      }
    }
  }

  return <header aria-label="窗口栏" className="flex h-10 shrink-0 items-center border-b border-sidebar-border bg-sidebar text-sidebar-foreground select-none">
    <SidebarTrigger className="mx-2.5" size="icon" aria-label={navLabel} title={navLabel} aria-expanded={isMobile ? openMobile : open} />
    <span className="flex h-full min-w-0 flex-1 items-center text-xs font-medium"
      onMouseDown={event => {
        if (nativeWindow && event.buttons === 1) {
          void runWindowAction(event.detail === 2 ? nativeWindow.toggleMaximize() : nativeWindow.startDragging());
        }
      }}>zx-once</span>
    {nativeWindow && <div className="flex h-full">
      <Button variant="ghost" size="icon" className="h-full w-11 rounded-none" aria-label="最小化窗口" title="最小化窗口"
        onClick={() => void runWindowAction(nativeWindow.minimize())}><Minus aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon" className="h-full w-11 rounded-none" aria-label={maximizeLabel} title={maximizeLabel}
        onClick={() => void runWindowAction(nativeWindow.toggleMaximize())}>
        {maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-full w-11 rounded-none hover:bg-destructive hover:text-destructive-foreground"
        aria-label="关闭窗口" title="关闭窗口" onClick={() => void runWindowAction(nativeWindow.close())}><X aria-hidden="true" /></Button>
    </div>}
  </header>;
}
