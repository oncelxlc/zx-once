// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { HashRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import entryHtml from "../index.html?raw";
import App from "./App";
import { defaults } from "./app/navigation";
import { islandApi } from "./features/island/islandApi";
import { layoutKey } from "./features/overview/overviewLayout";
import { mainWindowSession, restoreMainWindow } from "./mainWindowSession";
import { createAppStore } from "./store";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage?.clear();
});

function renderAt(hash: string) {
  window.history.replaceState(null, "", hash);
  const store = createAppStore();
  render(
    <Provider store={store}>
      <HashRouter>
        <App />
      </HashRouter>
    </Provider>,
  );
  return store;
}

it("shows the six resource modules on the overview", () => {
  renderAt("#/");

  expect(screen.getByRole("heading", { level: 1, name: "工作台总览" })).toBeTruthy();
  const main = within(screen.getByRole("main"));
  expect(main.getAllByRole("heading", { level: 2 }).map(item => item.textContent)).toEqual([
    "最近项目", "开发环境", "Git 动态", "GitHub 待办", "远程连接", "活动记录",
  ]);
});

it("keeps the order and visibility of saved modules after removing shortcuts", async () => {
  mockLocalStorage();
  localStorage.setItem(layoutKey, JSON.stringify([
    { id: "activity", visible: true }, { id: "shortcuts", visible: true }, { id: "recent", visible: false },
  ]));
  renderAt("#/");
  const main = within(screen.getByRole("main"));
  expect(main.getAllByRole("heading", { level: 2 }).map(item => item.textContent)).toEqual([
    "活动记录", "开发环境", "Git 动态", "GitHub 待办", "远程连接",
  ]);

  const header = screen.getByRole("heading", { name: "工作台总览" }).closest("header");
  expect(header).toBeTruthy();
  expect(screen.getByRole("main").contains(header)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "自定义总览" }));
  const editor = within(await screen.findByRole("dialog", { name: "自定义总览" }));
  expect(editor.queryByRole("checkbox", { name: "快捷操作" })).toBeNull();
  expect(editor.getByRole("checkbox", { name: "最近项目", checked: false })).toBeTruthy();
});

it("keeps the sidebar toggle in place and reaches recent projects from the collapsed sidebar", async () => {
  vi.stubGlobal("innerWidth", 1280);
  mockLocalStorage();
  renderAt("#/");
  const nav = within(screen.getByRole("navigation", { name: "主导航" }));
  const toggle = screen.getByRole("button", { name: "展开导航", expanded: false });
  expect(toggle.closest("footer")).toBeTruthy();
  expect(nav.queryByRole("button", { name: "展开导航" })).toBeNull();
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "zx-once 总览" })).toBeNull();
  const groupLabel = nav.getByText("工作台");
  expect(nav.queryByRole("button", { name: "工作台" })).toBeNull();

  expect(groupLabel.getAttribute("aria-hidden")).toBe("true");
  fireEvent.click(toggle);
  expect(groupLabel.getAttribute("aria-hidden")).toBe("false");
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "展开导航", expanded: false })).toBe(toggle);
  expect(nav.getByText("工作台")).toBe(groupLabel);
  expect(groupLabel.getAttribute("aria-hidden")).toBe("true");
  fireEvent.click(nav.getByRole("link", { name: "最近使用" }));

  await waitFor(() => expect(window.location.hash).toBe("#/?section=recent"));
  expect(nav.getByRole("link", { name: "最近使用", current: "page" })).toBeTruthy();
  const recent = screen.getByRole("region", { name: "最近项目" });
  expect(document.activeElement).toBe(recent.closest("[tabindex]"));

  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "收起导航", expanded: true })).toBe(toggle);
  expect(nav.getByText("工作台")).toBe(groupLabel);
  expect(groupLabel.getAttribute("aria-hidden")).toBe("false");
  cleanup();
  renderAt("#/?section=recent");
  expect(screen.getByRole("button", { name: "收起导航", expanded: true })).toBeTruthy();
});

it("redirects an unknown hash route to the overview", async () => {
  renderAt("#/missing");

  await waitFor(() => expect(window.location.hash).toBe("#/"));
  expect(screen.getByRole("heading", { level: 1, name: "工作台总览" })).toBeTruthy();
});

it("opens the browser navigation without adding a toggle to the page header", async () => {
  vi.stubGlobal("innerWidth", 390);
  renderAt("#/");
  const header = screen.getByRole("banner");
  expect(within(header).queryByRole("button", { name: "展开导航" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "展开导航", expanded: false }));
  const drawer = await screen.findByRole("dialog", { name: "主导航" });
  fireEvent.click(within(drawer).getByRole("link", { name: "项目" }));

  await screen.findByRole("main", { name: "项目" });
  expect(screen.getByRole("button", { name: "展开导航", expanded: false })).toBeTruthy();
  fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  const reopened = await screen.findByRole("dialog", { name: "主导航" });
  fireEvent.click(within(reopened).getByRole("button", { name: "关闭导航" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "主导航" })).toBeNull());
});

it("opens island settings directly from the main navigation", async () => {
  renderAt("#/settings");
  const settings = within(await screen.findByRole("navigation", { name: "工作台设置" }));
  expect(settings.queryByRole("link", { name: /灵动岛/ })).toBeNull();
  const nav = within(screen.getByRole("navigation", { name: "主导航" }));
  fireEvent.click(nav.getByRole("link", { name: "灵动岛" }));
  expect(await screen.findByRole("heading", { level: 1, name: "灵动岛设置" })).toBeTruthy();
  expect(window.location.hash).toBe("#/island");
  expect(nav.getByRole("link", { name: "灵动岛", current: "page" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "设置" }).hasAttribute("aria-current")).toBe(false);
});

it("keeps the title, action and section navigation in the header as pages change", async () => {
  renderAt("#/projects");
  const primary = within(screen.getByRole("navigation", { name: "主导航" }));
  const footer = screen.getByRole("contentinfo", { name: "工作台状态" });
  const projects = await screen.findByRole("main", { name: "项目" });
  expect(screen.getAllByRole("navigation")).toHaveLength(1);
  expect(projects.contains(screen.getByRole("button", { name: "新增项目" }))).toBe(false);

  fireEvent.click(primary.getByRole("link", { name: "Git 工作区" }));
  const content = await screen.findByRole("main", { name: "Git 工作区" });
  const header = within(screen.getByRole("banner"));
  const title = header.getByRole("heading", { name: "Git 工作区", level: 1 });
  const sections = header.getByRole("navigation", { name: "Git 仓库视图" });
  expect(header.getByRole("button", { name: "克隆仓库" })).toBeTruthy();
  expect(content.contains(sections)).toBe(false);
  expect(content.contains(title)).toBe(false);
  content.scrollTop = 400;
  fireEvent.click(within(sections).getByRole("link", { name: "提交历史" }));
  await waitFor(() => expect(within(sections).getByRole("link", { name: "提交历史", current: "page" })).toBeTruthy());
  expect(screen.getByRole("main")).toBe(content);
  expect(content.scrollTop).toBe(0);
  expect(screen.getByRole("heading", { level: 1 })).toBe(title);
  expect(screen.getByRole("contentinfo", { name: "工作台状态" })).toBe(footer);
});

function mockLocalStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
}

it("adds the island to an existing customized navigation without resetting preferences", () => {
  mockLocalStorage();
  const groups = [...defaults.groups].reverse().map(group =>
    group.id === "workbench" ? { ...group, title: "常用" } : group);
  const expected = { ...defaults, sidebar: "collapsed", groups, pins: ["projects"] };
  const previous = groups.map(group => ({ ...group, items: group.items.filter(id => id !== "island") }));
  localStorage.setItem("zx-once.workbench.preferences.v1", JSON.stringify({ ...expected, translucency: undefined, groups: previous }));
  const store = renderAt("#/");
  expect(store.getState().preferences).toEqual(expected);
});

it.each([
  { saved: { titlebar: false, navigation: false, toolbar: false }, expected: { enabled: false, percent: 65 } },
  { saved: { titlebar: false, navigation: false }, expected: { enabled: true, percent: 65 } },
  { saved: { enabled: false, percent: 101 }, expected: { enabled: false, percent: 65 } },
  { saved: { enabled: true, percent: 0 }, expected: { enabled: true, percent: 0 } },
  { saved: { enabled: false, percent: 100 }, expected: { enabled: false, percent: 100 } },
])("restores frame translucency from $saved", ({ saved, expected }) => {
  mockLocalStorage();
  localStorage.setItem("zx-once.workbench.preferences.v1", JSON.stringify({ ...defaults, translucency: saved }));
  expect(createAppStore().getState().preferences.translucency).toEqual(expected);
});

it("keeps the frame transparency percentage when disabled and after reload", async ({ onTestFinished }) => {
  mockLocalStorage();
  // Base UI exposes the thumb once it measures the track, which jsdom leaves at zero width.
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 180, 12));
  onTestFinished(() => measure.mockRestore());
  localStorage.setItem("zx-once.workbench.preferences.v1", JSON.stringify({
    ...defaults, theme: "dark", pins: ["projects"], translucency: { titlebar: false, navigation: true, toolbar: false },
  }));
  const store = renderAt("#/settings/appearance");
  const panel = within(await screen.findByRole("region", { name: "半透明效果" }));
  const slider = panel.getByRole<HTMLInputElement>("slider", { name: "外框透明度" });
  expect(panel.getAllByRole("checkbox")).toHaveLength(1);
  expect(slider.getAttribute("aria-valuetext")).toBe("65%");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(store.getState().preferences.translucency).toEqual({ enabled: true, percent: 66 });
  fireEvent.click(panel.getByRole("checkbox", { name: "启用半透明效果", checked: true }));
  expect(slider.disabled).toBe(true);
  cleanup();
  const restored = renderAt("#/settings/appearance");
  expect(restored.getState().preferences).toMatchObject({
    theme: "dark", pins: ["projects"], translucency: { enabled: false, percent: 66 },
  });
  fireEvent.click(await screen.findByRole("checkbox", { name: "启用半透明效果", checked: false }));
  expect(screen.getByRole("slider", { name: "外框透明度" }).getAttribute("aria-valuetext")).toBe("66%");
});

it.each([
  { saved: '{"theme":"dark","groups":[]}', systemDark: false, theme: "dark", resolved: "dark" },
  { saved: '{"theme":"light","sidebar":false}', systemDark: true, theme: "light", resolved: "light" },
  { saved: '{"theme":"system"}', systemDark: true, theme: "system", resolved: "dark" },
  { saved: '{"theme":"invalid"}', systemDark: false, theme: "system", resolved: "light" },
  { saved: "malformed", systemDark: true, theme: "system", resolved: "dark" },
])("keeps the first-paint and mounted themes in sync for $saved", ({ saved, systemDark, theme, resolved }) => {
  mockLocalStorage();
  localStorage.setItem("zx-once.workbench.preferences.v1", saved);
  vi.stubGlobal("matchMedia", (media: string) => Object.assign(new EventTarget(), {
    matches: media === "(prefers-color-scheme: dark)" && systemDark,
  }));
  const entry = new DOMParser().parseFromString(entryHtml, "text/html");
  const bootstrap = entry.head.querySelector("script + link[rel=stylesheet]")?.previousElementSibling;
  if (!bootstrap?.textContent) throw new Error("Missing theme bootstrap before the stylesheet");
  document.documentElement.removeAttribute("data-theme");
  window.eval(bootstrap.textContent);
  expect(document.documentElement.dataset.theme).toBe(resolved);
  expect(document.documentElement.classList.contains("dark")).toBe(resolved === "dark");

  const store = renderAt("#/");
  expect(store.getState().preferences).toEqual({ ...defaults, theme });
  expect(document.documentElement.dataset.theme).toBe(resolved);
});

it("follows system changes, keeps explicit themes across reloads, and preserves workbench data", async () => {
  mockLocalStorage();
  const query = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal("matchMedia", (media: string) => media === "(prefers-color-scheme: dark)" ? query : new EventTarget());
  const store = renderAt("#/settings/appearance");
  const { preferences, ...business } = store.getState();
  const root = document.documentElement;
  const expectTheme = (theme: "light" | "dark") => {
    expect(root.dataset.theme).toBe(theme);
    expect(root.classList.contains("dark")).toBe(theme === "dark");
  };
  function changeSystem(dark: boolean) {
    query.matches = dark;
    act(() => { query.dispatchEvent(new Event("change")); });
  }

  expect(preferences.theme).toBe("system");
  expectTheme("dark");
  changeSystem(false);
  expectTheme("light");
  const dark = await screen.findByRole("button", { name: "深色" });
  fireEvent.click(dark);
  expectTheme("dark");
  changeSystem(false);
  expectTheme("dark");
  fireEvent.click(screen.getByRole("button", { name: "浅色" }));
  changeSystem(true);
  expectTheme("light");
  cleanup();
  const refreshed = renderAt("#/settings/appearance");
  expect(refreshed.getState().preferences).toEqual({ ...preferences, theme: "light" });
  expectTheme("light");
  fireEvent.click(await screen.findByRole("button", { name: "跟随系统" }));
  expectTheme("dark");
  changeSystem(false);
  expectTheme("light");
  expect(store.getState()).toEqual({ ...business, preferences: { ...preferences, theme: "light" } });
  expect(refreshed.getState()).toEqual({ ...business, preferences });
});

it("restores the settings group before mounting a rebuilt window", async () => {
  const route = "#/island?group=animation";
  window.history.replaceState(null, "", "#/");
  vi.spyOn(islandApi, "isDesktop").mockReturnValue(true);
  mockIPC(command => {
    expect(command).toBe("main_window_restore");
    return { route, draft: null };
  });
  try {
    await restoreMainWindow();
    expect(window.location.hash).toBe(route);
    expect(window.__zxMainSession).toBe(mainWindowSession);
  } finally {
    clearMocks();
    vi.restoreAllMocks();
    delete window.__zxMainSession;
  }
});
