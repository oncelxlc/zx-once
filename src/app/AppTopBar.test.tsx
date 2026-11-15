// @vitest-environment jsdom
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import capability from "../../src-tauri/capabilities/main.json";
import { SidebarProvider } from "../components/ui/sidebar";
import { AppTopBar } from "./AppTopBar";

afterEach(() => { cleanup(); clearMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount() {
  render(<StrictMode><SidebarProvider defaultOpen={false}><AppTopBar /></SidebarProvider></StrictMode>);
}

function desktop() {
  vi.stubGlobal("isTauri", true);
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Windows NT");
  mockWindows("main");
}

it.each([{ tauri: false, platform: "Windows NT" }, { tauri: true, platform: "Macintosh" }])(
  "leaves window controls to the host on $platform with Tauri=$tauri", ({ tauri, platform }) => {
    vi.stubGlobal("isTauri", tauri);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(platform);
    const ipc = vi.fn();
    mockIPC(ipc);
    mount();
    expect(screen.getAllByRole("button").map(item => item.getAttribute("aria-label"))).toEqual(["展开侧栏"]);
    expect(ipc).not.toHaveBeenCalled();
  });

it("handles Windows title bar actions with only the main window permissions", async () => {
  desktop();
  let maximized = false;
  const ipc = vi.fn((cmd: string) => {
    if (cmd === "plugin:window|toggle_maximize") maximized = !maximized;
    if (cmd === "plugin:window|is_maximized") return maximized;
  });
  mockIPC(ipc);
  mount();
  const maximize = await screen.findByRole("button", { name: "最大化窗口" });
  fireEvent.click(maximize);
  fireEvent.resize(window);
  expect(await screen.findByRole("button", { name: "还原窗口" })).toBe(maximize);
  const title = screen.getByText("zx-once");
  fireEvent.mouseDown(title, { buttons: 1, detail: 1 });
  fireEvent.mouseDown(title, { buttons: 1, detail: 2 });
  expect(maximized).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "最小化窗口" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭窗口" }));
  expect(ipc).toHaveBeenCalledWith("plugin:window|set_decorations", { label: "main", value: false });
  expect(ipc.mock.calls.filter(([cmd]) => cmd.endsWith("|set_decorations"))).toHaveLength(1);
  for (const op of ["start_dragging", "toggle_maximize", "minimize", "close"]) {
    expect(ipc).toHaveBeenCalledWith(`plugin:window|${op}`, { label: "main" });
  }
  const grants = new Set(ipc.mock.calls.map(([cmd]) => cmd.replace("plugin:window|", "core:window:allow-").replace(/_/g, "-")));
  expect(grants).toEqual(new Set(capability.permissions.filter(item => item.startsWith("core:window:"))));
  expect(capability.windows).toEqual(["main"]);
  expect(capability.platforms).toEqual(["windows"]);
});

it("keeps native decorations when the custom bar is unavailable", async () => {
  desktop();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  mockIPC(cmd => {
    if (cmd === "plugin:window|set_decorations") throw new Error("denied");
    return false;
  });
  mount();
  await waitFor(() => expect(warning).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "关闭窗口" })).toBeNull();
  expect(screen.getByRole("button", { name: "展开侧栏" })).toBeTruthy();
});

it("restores system controls if a window action is rejected", async () => {
  desktop();
  const ipc = vi.fn((cmd: string) => {
    if (cmd === "plugin:window|minimize") throw new Error("denied");
    return false;
  });
  mockIPC(ipc);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "最小化窗口" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "关闭窗口" })).toBeNull());
  expect(ipc).toHaveBeenCalledWith("plugin:window|set_decorations", { label: "main", value: true });
});
