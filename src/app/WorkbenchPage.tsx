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

  return <>
    <header data-slot="workbench-header"
      className="flex min-h-11 min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 px-3 py-1.5 min-[800px]:flex-nowrap min-[800px]:px-5">
      <h1 id="workbench-title" className="shrink-0 text-base leading-snug font-semibold">{title}</h1>
      {navigation}
      {actions && <div className="ml-auto">{actions}</div>}
    </header>
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <DetailPanelHost.Provider value={wide ? detailHost : null}>
        <SidebarInset ref={content} id="workbench-content" aria-labelledby="workbench-title" tabIndex={-1}
          className="min-h-0 min-w-0 gap-3 overflow-auto overscroll-contain p-3 [scrollbar-gutter:stable] min-[800px]:px-5 min-[800px]:py-4">
          {children}
        </SidebarInset>
      </DetailPanelHost.Provider>
      <div ref={setDetailHost} className="min-h-0 shrink-0 overflow-auto bg-popover empty:hidden" />
    </div>
  </>;
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
    // Deep links and Back/Forward can select a link beyond the visible part of the strip.
    selected.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);
  return <nav aria-label={label}
    className="order-last flex min-w-0 basis-full items-center gap-1 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:thin] min-[800px]:order-none min-[800px]:basis-auto min-[800px]:border-s min-[800px]:ps-3">
    {links.map(link => <Link key={link.label} ref={link.active ? selected : undefined} to={link.to}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }),
        "text-foreground/75 aria-[current=page]:border-primary/35 aria-[current=page]:font-semibold forced-colors:focus-visible:[outline:2px_solid_Highlight]")}
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
