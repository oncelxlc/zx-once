import { useCallback, useEffect, useLayoutEffect } from "react";
import { useSelector, useStore } from "react-redux";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import type { RootState } from "../store";
import { navigationHistory } from "./navigationHistory";

const viewParam: Record<string, string> = {
  "/": "section", "/island": "group", "/toolbox": "tool",
  "/environment": "tab", "/git": "tab", "/github": "tab", "/remote": "tab",
};

// HashRouter stamps its own entries with a key and index. Direct URL edits can have neither.
function routerPosition(key: string): number | null {
  const state: unknown = window.history.state;
  if (!state || typeof state !== "object" || !("idx" in state) ||
      typeof state.idx !== "number" || !Number.isSafeInteger(state.idx)) return null;
  return ("key" in state ? state.key : "default") === key ? state.idx : null;
}

/** Record a committed page using the view and resource already resolved by the routed component. */
export function useRecordWorkbenchPage(view?: string, resource?: readonly [string, string]) {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const store = useStore<RootState>();
  const [param, value] = resource ?? [];
  useLayoutEffect(() => {
    const { search, hash, key } = location;
    const pathname = location.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    const path = view?.startsWith("/") ? view : pathname;
    const page = JSON.stringify([path, view, value]);
    const query = new URLSearchParams(search);
    const stable = new URLSearchParams();
    const section = viewParam[pathname];
    if (section && view && view !== "overview" && (query.has(section) || (pathname === "/environment" && query.has("id")))) {
      stable.set(section, view);
    }
    if (param && value) stable.set(param, value);
    const to = pathname + (stable.size ? "?" + stable : "");
    const temporary = !!hash || [...query].some(([name, selected]) => stable.get(name) !== selected);
    const position = routerPosition(key);
    const history = store.getState().navigationHistory;
    const target = history.pending === null ? undefined : history.visits[history.pending];
    // Browser Back may reopen a drawer. An app traversal restores the page and its resource instead.
    if (target && (target.page !== page || temporary) && target.to !== pathname + search + hash &&
        target.stops.some(stop => stop.key === key && stop.position === position)) {
      void navigate(target.to, { replace: true });
      return;
    }
    store.dispatch(navigationHistory.actions.arrived({ page, to, key, position, action }));
  }, [location, action, view, param, value, store, navigate]);
}

/** Mount once in the shell. Only traverse native history positions previously observed by this store. */
export function useWorkbenchNavigation() {
  const store = useStore<RootState>();
  const navigate = useNavigate();
  const { key } = useLocation();
  const canGoBack = useSelector((state: RootState) => state.navigationHistory.cursor > 0 && state.navigationHistory.pending === null);
  const canGoForward = useSelector((state: RootState) => state.navigationHistory.cursor + 1 < state.navigationHistory.visits.length && state.navigationHistory.pending === null);

  const move = useCallback((direction: number) => {
    const { visits, cursor, position, pending } = store.getState().navigationHistory;
    const index = cursor + direction;
    const target = visits[index];
    if (pending !== null || !target) return;
    store.dispatch(navigationHistory.actions.requested(index));
    const positions = target.stops.flatMap(stop => stop.position === null ? [] : [stop.position]);
    const stop = direction < 0 ? positions[positions.length - 1] : positions[0];
    if (position !== null && stop !== undefined && stop !== position && routerPosition(key) === position) {
      void navigate(stop - position);
    } else {
      // Browser history can discard a forward stop when a drawer pushes a URL on the same page.
      void navigate(target.to);
    }
  }, [navigate, store, key]);
  const back = useCallback(() => move(-1), [move]);
  const forward = useCallback(() => move(1), [move]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.defaultPrevented) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // Cancel browser navigation even in an editor, where the current page must stay open.
      event.preventDefault();
      if (event.target instanceof Element && event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="log"]',
      )) return;
      move(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [move]);
  return { canGoBack, canGoForward, back, forward };
}
