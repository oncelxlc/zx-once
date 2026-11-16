// @vitest-environment jsdom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import { createAppStore } from "../store";
import { AppShell } from "./AppShell";
import { setTheme, setTranslucency, setTransparencyPercent } from "./preferencesSlice";

afterEach(() => { cleanup(); clearMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount() {
  const store = createAppStore();
  render(<Provider store={store}><MemoryRouter><AppShell /></MemoryRouter></Provider>);
  return store;
}

it("syncs one frame transparency with the theme and accessibility settings", async () => {
  vi.stubGlobal("isTauri", true);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT");
  const system = Object.assign(new EventTarget(), { matches: false });
  const contrast = Object.assign(new EventTarget(), { matches: false });
  const reduced = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", (query: string) => query === "(prefers-color-scheme: dark)" ? system
    : query === "(forced-colors: active)" ? contrast
    : query === "(prefers-reduced-transparency: reduce)" ? reduced : new EventTarget());
  const sheet = document.createElement("style");
  sheet.textContent = `
    :root { --sidebar: #fefefe; --sidebar-foreground: #123456; --sidebar-border: #dddddd; }
    :root.dark { --sidebar: #181818; --sidebar-foreground: #abcdef; --sidebar-border: #333333; }
  `;
  document.head.append(sheet);
  const ipc = vi.fn().mockResolvedValue(true);
  mockIPC((cmd, args) => { if (cmd === "set_main_window_chrome") return ipc(cmd, args); }, { shouldMockEvents: true });
  const store = mount();
  const light = { dark: false, transparencyPercent: 65, background: "#fefefe", foreground: "#123456", border: "#dddddd" };
  const dark = { dark: true, transparencyPercent: 65, background: "#181818", foreground: "#abcdef", border: "#333333" };
  const solid = { ...light, transparencyPercent: 0 };
  try {
    await waitFor(() => expect(ipc).toHaveBeenLastCalledWith("set_main_window_chrome", light));
    expect(document.documentElement.dataset.nativeBackdrop).toBe("true");
    ipc.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(document.documentElement.dataset.nativeBackdrop).toBe("true");
    expect(ipc).not.toHaveBeenCalled();
    system.matches = true;
    act(() => system.dispatchEvent(new Event("change")));
    await waitFor(() => expect(ipc).toHaveBeenLastCalledWith("set_main_window_chrome", dark));
    act(() => { store.dispatch(setTheme("light")); });
    await waitFor(() => expect(ipc).toHaveBeenLastCalledWith("set_main_window_chrome", light));
    ipc.mockClear();
    system.matches = false;
    act(() => system.dispatchEvent(new Event("change")));
    await waitFor(() => expect(ipc).toHaveBeenCalledExactlyOnceWith("set_main_window_chrome", light));
    for (const preference of [contrast, reduced]) {
      preference.matches = true;
      act(() => preference.dispatchEvent(new Event("change")));
      await waitFor(() => expect(ipc).toHaveBeenLastCalledWith("set_main_window_chrome", solid));
      expect(document.documentElement.dataset.nativeBackdrop).toBe("false");
      preference.matches = false;
      act(() => preference.dispatchEvent(new Event("change")));
      await waitFor(() => expect(document.documentElement.dataset.nativeBackdrop).toBe("true"));
    }
    act(() => { store.dispatch(setTransparencyPercent(33)); });
    // Moving the slider should keep the current native surface until the next tint is ready.
    expect(document.documentElement.dataset.nativeBackdrop).toBe("true");
    await waitFor(() => expect(ipc).toHaveBeenLastCalledWith("set_main_window_chrome", { ...light, transparencyPercent: 33 }));
    act(() => { store.dispatch(setTranslucency(false)); });
    await waitFor(() => expect(ipc).toHaveBeenLastCalledWith("set_main_window_chrome", solid));
    expect(document.documentElement.dataset.nativeBackdrop).toBe("false");
    ipc.mockResolvedValue(false);
    act(() => { store.dispatch(setTranslucency(true)); });
    await waitFor(() => expect(ipc).toHaveBeenLastCalledWith("set_main_window_chrome", { ...light, transparencyPercent: 33 }));
    expect(document.documentElement.dataset.nativeBackdrop).toBe("false");
  } finally {
    sheet.remove();
  }
});

it("applies browser appearance changes to the document, including portalled navigation", async () => {
  vi.stubGlobal("isTauri", false);
  const ipc = vi.fn();
  mockIPC(ipc);
  const store = mount();
  await act(async () => {
    store.dispatch(setTheme("dark"));
    store.dispatch(setTranslucency(true));
    store.dispatch(setTransparencyPercent(85));
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.dataset.nativeBackdrop).toBeUndefined();
  expect(document.documentElement.dataset.translucent).toBe("true");
  expect(document.documentElement.style.getPropertyValue("--frame-transparency")).toBe("85%");
  expect(ipc).not.toHaveBeenCalled();
});

it("routes native caption clicks and publishes enabled states without duplicating the controls in the page", async () => {
  vi.stubGlobal("isTauri", true);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT");
  const publish = vi.fn();
  mockIPC((cmd, args) => { if (cmd === "set_main_window_navigation") publish(args); }, { shouldMockEvents: true });
  const store = createAppStore();
  render(<Provider store={store}><MemoryRouter><App /></MemoryRouter></Provider>);
  const expectState = (canGoBack: boolean, canGoForward: boolean, sidebarOpen: boolean) =>
    waitFor(() => expect(publish).toHaveBeenLastCalledWith({ canGoBack, canGoForward, sidebarOpen }));
  const clickCaption = (action: string) => act(() => emit("window-navigation", action));

  await expectState(false, false, false);
  expect(screen.queryByRole("group", { name: "导航操作" })).toBeNull();
  expect(screen.queryByRole("button", { name: "展开导航" })).toBeNull();
  fireEvent.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("link", { name: "Git 工作区" }));
  const sections = await screen.findByRole("navigation", { name: "Git 仓库视图" });
  await expectState(true, false, false);
  await clickCaption("toggle-sidebar");
  await expectState(true, false, true);
  expect(store.getState().preferences.sidebar).toBe("expanded");
  expect(screen.getByRole("navigation", { name: "Git 仓库视图" })).toBe(sections);
  await clickCaption("back");
  await screen.findByRole("heading", { level: 1, name: "工作台总览" });
  await expectState(false, true, true);
  await clickCaption("forward");
  await screen.findByRole("heading", { level: 1, name: "Git 工作区" });
  await expectState(true, false, true);
});
