import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useSearchParams, type To } from "react-router";
import { buttonVariants } from "../components/ui/button";
import { SidebarInset } from "../components/ui/sidebar";
import { cn } from "../lib/utils";
import { DetailPanelHost } from "./WorkbenchDialog";
import { useRecordWorkbenchPage } from "./useWorkbenchNavigation";

function watchWidth(update: () => void) {
  window.addEventListener("resize", update);
  return () => window.removeEventListener("resize", update);
}

export function WorkbenchPage({ title, actions, navigation, view, resource, children }: {
  title: string; actions?: ReactNode; navigation?: ReactNode; view?: string; resource?: readonly [string, string]; children: ReactNode;
}) {
  useRecordWorkbenchPage(view, resource);
  const wide = useSyncExternalStore(watchWidth, () => window.innerWidth >= 1440, () => false);
  const [detailHost, setDetailHost] = useState<HTMLDivElement | null>(null);
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [view]);

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 min-[800px]:px-6">
      <h1 id="workbench-title" className="text-xl font-semibold tracking-tight">{title}</h1>
      {actions}
    </header>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden min-[800px]:flex-row">
      {navigation}
      <DetailPanelHost.Provider value={wide ? detailHost : null}>
        <SidebarInset ref={content} id="workbench-content" aria-labelledby="workbench-title" tabIndex={-1}
          className="min-h-0 min-w-0 gap-4 overflow-auto overscroll-contain p-4 [scrollbar-gutter:stable] min-[800px]:p-6">
          {children}
        </SidebarInset>
      </DetailPanelHost.Provider>
      <div ref={setDetailHost} className="min-h-0 shrink-0 overflow-auto border-l bg-card empty:hidden" />
    </div>
  </div>;
}

interface SectionLink {
  label: string;
  to: To;
  active: boolean;
  onClick?: () => void;
}

export function SecondaryNav({ label, links }: { label: string; links: SectionLink[] }) {
  const selected = useRef<HTMLAnchorElement>(null);
  const active = links.find(link => link.active)?.label;
  useLayoutEffect(() => {
    selected.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);
  return <nav aria-label={label} className="flex min-h-0 min-w-0 shrink-0 gap-1 overflow-x-auto overscroll-contain border-b p-2 min-[800px]:w-48 min-[800px]:flex-col min-[800px]:overflow-x-hidden min-[800px]:overflow-y-auto min-[800px]:border-r min-[800px]:border-b-0 min-[800px]:p-3">
    {links.map(link => <Link key={link.label} ref={link.active ? selected : undefined} to={link.to}
      className={cn(buttonVariants({ variant: "ghost" }), "justify-start aria-[current=page]:border-transparent aria-[current=page]:font-semibold")}
      aria-current={link.active ? "page" : undefined} onClick={link.onClick}>{link.label}</Link>)}
  </nav>;
}

export function QueryNavigation<T extends string>({ label, items, current, param = "tab", clear = [], omitDefault }: {
  label: string; items: readonly (readonly [T, string])[]; current: T; param?: string;
  clear?: readonly string[]; omitDefault?: boolean;
}) {
  const [params] = useSearchParams();
  const links = items.map(([value, text], index) => {
    const search = new URLSearchParams(params);
    for (const key of clear) search.delete(key);
    if (omitDefault && index === 0) search.delete(param);
    else search.set(param, value);
    return { label: text, to: { search: search.toString() }, active: current === value };
  });
  return <SecondaryNav label={label} links={links} />;
}
