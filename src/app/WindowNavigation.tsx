import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { useSidebar } from "../components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { isWindowsDesktop } from "../lib/isWindowsDesktop";
import { useWorkbenchNavigation } from "./useWorkbenchNavigation";

type Action = "back" | "forward" | "toggle-sidebar";

interface NavigationProps extends ReturnType<typeof useWorkbenchNavigation> {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

/** Subscribe before installing the native controls so even the first click reaches this WebView. */
function NativeNavigation({ canGoBack, canGoForward, sidebarOpen, back, forward, toggleSidebar }: NavigationProps) {
  const [ready, setReady] = useState(false);
  const updates = useRef(Promise.resolve());
  const activate = useEffectEvent((action: Action) => {
    switch (action) {
      case "back": if (canGoBack) back(); break;
      case "forward": if (canGoForward) forward(); break;
      case "toggle-sidebar": toggleSidebar(); break;
    }
  });

  useEffect(() => {
    let active = true;
    const subscription = listen<Action>("window-navigation", ({ payload }) => {
      if (active) activate(payload);
    }, { target: "main" }).then(off => {
      if (active) setReady(true);
      return off;
    }).catch(error => console.warn("无法监听标题栏导航", error));
    return () => {
      active = false;
      void subscription.then(off => off?.()).catch(error => console.warn("无法取消标题栏导航监听", error));
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let current = true;
    updates.current = updates.current.then(() => {
      if (current) return invoke<void>("set_main_window_navigation", { canGoBack, canGoForward, sidebarOpen });
    }).catch(error => console.warn("无法同步标题栏导航", error));
    return () => { current = false; };
  }, [ready, canGoBack, canGoForward, sidebarOpen]);
  return null;
}

export function WindowNavigation() {
  const navigation = useWorkbenchNavigation();
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const sidebarOpen = isMobile ? openMobile : open;
  if (isWindowsDesktop()) return <NativeNavigation {...navigation} sidebarOpen={sidebarOpen} toggleSidebar={toggleSidebar} />;

  const actions = [
    { label: "返回", icon: ArrowLeft, click: navigation.back, disabled: !navigation.canGoBack },
    { label: "前进", icon: ArrowRight, click: navigation.forward, disabled: !navigation.canGoForward },
    { label: sidebarOpen ? "收起导航" : "展开导航", icon: PanelLeft, click: toggleSidebar, expanded: sidebarOpen },
  ];
  return <div role="group" aria-label="导航操作" className="flex shrink-0 items-center">
    {actions.map(({ label, icon: Icon, click, disabled, expanded }) => <Tooltip key={Icon.displayName}>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="w-8 aria-disabled:opacity-50"
        disabled={disabled} focusableWhenDisabled aria-label={label} aria-expanded={expanded} onClick={click} />}>
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>)}
  </div>;
}
