import { Settings, X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation } from "react-router";
import { Button } from "../components/ui/button";
import { SheetClose } from "../components/ui/sheet";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from "../components/ui/context-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../components/ui/sidebar";
import type { RootState } from "../store";
import { activeDestination, destinations, type NavId } from "./navigation";
import { moveItem, resetNavigation, toggleHidden, togglePin } from "./preferencesSlice";

function SidebarItem({ id, current, onNavigate }: { id: NavId; current: boolean; onNavigate: () => void }) {
  const dispatch = useDispatch();
  const { open, isMobile } = useSidebar();
  const compact = !isMobile && !open;
  const { pins, groups } = useSelector((state: RootState) => state.preferences);
  const { icon: Icon, label, to } = destinations[id];
  return <SidebarMenuItem>
    <ContextMenu>
      <ContextMenuTrigger>
        <SidebarMenuButton render={<Link to={to} />} isActive={current} tooltip={label}
          aria-label={label} aria-current={current ? "page" : undefined} onClick={onNavigate}>
          <Icon aria-hidden="true" />{!compact && <span>{label}</span>}
        </SidebarMenuButton>
      </ContextMenuTrigger>
      <ContextMenuContent aria-label={label}>
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => dispatch(togglePin(id))}>{pins.includes(id) ? "取消收藏" : "固定到收藏"}</ContextMenuItem>
          <ContextMenuItem onClick={() => dispatch(toggleHidden(id))}>隐藏导航项</ContextMenuItem>
          {groups.filter(group => !group.items.includes(id)).map(group =>
            <ContextMenuItem key={group.id} onClick={() => dispatch(moveItem({ id, groupId: group.id }))}>移到 · {group.title}</ContextMenuItem>)}
          <ContextMenuItem onClick={() => dispatch(resetNavigation())}>恢复默认导航</ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  </SidebarMenuItem>;
}

export function AppSidebar() {
  const { groups, pins, hidden } = useSelector((state: RootState) => state.preferences);
  const { isMobile, open, setOpenMobile } = useSidebar();
  const compact = !isMobile && !open;
  const { pathname, search } = useLocation();
  const visibleGroups = groups.filter(group => !group.hidden);
  const visible = visibleGroups.flatMap(group => group.items.filter(id => !hidden.includes(id)));
  const favorites = pins.filter(id => visible.includes(id));
  const current = activeDestination(pathname, search, visible);
  const settings = pathname.startsWith("/settings");
  const leave = () => { if (isMobile) setOpenMobile(false); };

  function renderGroup(id: string, title: string, items: NavId[]) {
    if (!items.length) return null;
    return <SidebarGroup key={id}>
      <SidebarGroupLabel aria-hidden={compact}>{title}</SidebarGroupLabel>
      <SidebarGroupContent><SidebarMenu>
        {items.map(item => <SidebarItem key={item} id={item} current={item === current} onNavigate={leave} />)}
      </SidebarMenu></SidebarGroupContent>
    </SidebarGroup>;
  }
  return <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
    {isMobile && <SheetClose render={<Button variant="ghost" size="icon" className="m-1 self-end" />}
      aria-label="关闭导航"><X aria-hidden="true" /></SheetClose>}
    <SidebarContent role="navigation" aria-label="主导航">
      {renderGroup("favorites", "收藏", favorites)}
      {visibleGroups.map(group => renderGroup(group.id, group.title, group.items.filter(id => visible.includes(id) && !favorites.includes(id))))}
    </SidebarContent>
    <SidebarFooter className="shrink-0">
      <SidebarMenu><SidebarMenuItem>
        <SidebarMenuButton render={<Link to="/settings" />} isActive={settings} tooltip="设置"
          aria-label="设置" aria-current={settings ? "page" : undefined} onClick={leave}>
          <Settings aria-hidden="true" />{!compact && <span>设置</span>}
        </SidebarMenuButton>
      </SidebarMenuItem></SidebarMenu>
    </SidebarFooter>
  </Sidebar>;
}
