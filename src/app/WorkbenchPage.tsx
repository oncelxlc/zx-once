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

/**
 * The routed page supplies its resolved view so opening a detail or editing a filter
 * keeps the current section's scroll position and does not replay its entrance.
 */
export function WorkbenchPage({ title, actions, navigation, view, resource, children }: {
  title: string; actions?: ReactNode; navigation?: ReactNode; view?: string; resource?: readonly [string, string]; children: ReactNode;
}) {
  useRecordWorkbenchPage(view, resource);
  const wide = useSyncExternalStore(watchWidth, () => window.innerWidth >= 1440, () => false);
  const [detailHost, setDetailHost] = useState<HTMLDivElement | null>(null);
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const main = content.current;
    if (!main) return;
    main.scrollTop = 0;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Animate the existing element so focus and mounted form state survive a section change.
    const entrance = main.animate?.([
      { opacity: 0.65, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 180, easing: "ease-out" });
    return () => entrance?.cancel();
  }, [view]);

  return <>
    <header data-slot="workbench-header"
      className="flex min-h-11 min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 px-3 py-1.5 min-[800px]:px-5">
      <h1 id="workbench-title" className="shrink-0 text-base leading-snug font-semibold">{title}</h1>
      {actions && <div className="ml-auto">{actions}</div>}
    </header>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:flex-row">
      {navigation}
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
    // Deep links and Back/Forward can select an item outside the menu's scrollable viewport.
    selected.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);
  return <nav aria-label={label}
    className="flex max-h-[30dvh] min-h-0 shrink-0 flex-col gap-1 overflow-y-auto overscroll-y-contain border-b border-border/70 p-2 [scrollbar-width:thin] sm:max-h-none sm:w-36 sm:border-e sm:border-b-0">
    {links.map(link => <Link key={link.label} ref={link.active ? selected : undefined} to={link.to}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }),
        "h-auto min-h-11 justify-start py-1 text-start whitespace-normal text-foreground/75 transition-colors sm:min-h-8 aria-[current=page]:border-primary/35 aria-[current=page]:font-semibold motion-reduce:transition-none forced-colors:focus-visible:[outline:2px_solid_Highlight]")}
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
