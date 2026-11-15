// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { HashRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import App from "../App";
import { createAppStore } from "../store";

afterEach(cleanup);

function open(hash: string) {
  window.history.replaceState(null, "", hash);
  const store = createAppStore();
  render(<Provider store={store}><HashRouter><App /></HashRouter></Provider>);
  return store;
}

function primary(name: string) {
  fireEvent.click(within(screen.getByRole("navigation", { name: "主导航" })).getByRole("link", { name }));
}

const action = (name: "返回" | "前进") => screen.getByRole("button", { name });
const at = (hash: string) => waitFor(() => expect(window.location.hash).toBe(hash));
const visitCount = (store: ReturnType<typeof open>) => store.getState().navigationHistory.visits.length;

it("keeps the disabled back button focusable for its tooltip", async () => {
  const store = open("#/");
  const back = action("返回");
  expect(back.textContent).toBe("");
  act(() => back.focus());
  expect(await screen.findByText("返回")).toBeTruthy();
  fireEvent.click(back);
  expect(window.location.hash).toBe("#/");
  expect(visitCount(store)).toBe(1);
});

it("shares route traversal with the browser, skips duplicate views and drops a forward branch on new navigation", async () => {
  const store = open("#/island?group=startup");
  expect(action("返回").getAttribute("aria-disabled")).toBe("true");
  const groups = within(screen.getByRole("navigation", { name: "设置分组" }));
  fireEvent.click(groups.getByRole("link", { name: "外观" }));
  await at("#/island?group=appearance");
  fireEvent.click(groups.getByRole("link", { name: "外观" }));
  expect(visitCount(store)).toBe(2);
  primary("项目");
  await screen.findByRole("main", { name: "项目" });

  fireEvent.click(action("返回"));
  await at("#/island?group=appearance");
  act(() => window.history.back());
  await at("#/island?group=startup");
  fireEvent.click(action("前进"));
  await at("#/island?group=appearance");
  act(() => window.history.forward());
  await at("#/projects");
  fireEvent.click(action("返回"));
  await at("#/island?group=appearance");
  primary("工具箱");
  await screen.findByRole("main", { name: "工具箱" });
  expect(action("前进").getAttribute("aria-disabled")).toBe("true");
  expect(visitCount(store)).toBe(3);
});

it.each([
  ["#/projects?new=1", "项目", "#/projects"],
  ["#/git?action=clone&source=web-client", "Git 工作区", "/git"],
  ["#/github?tab=issues&q=missing&extra=discard", "GitHub", "/github"],
  ["#/environment?id=pnpm", "开发环境", "#/environment?tab=package"],
])("restores the page behind %s without replaying its temporary controls", async (initial, title, expected) => {
  const store = open(initial);
  await screen.findByRole("heading", { level: 1, name: title, hidden: true });
  // Trigger the real router link even when the page's sheet makes the sidebar inert to pointer input.
  const island = document.querySelector<HTMLAnchorElement>('a[href="#/island"]');
  if (!island) throw new Error("Missing island route");
  fireEvent.click(island);
  await screen.findByRole("heading", { level: 1, name: "灵动岛设置" });
  fireEvent.click(action("返回"));
  await waitFor(() => {
    if (expected.startsWith("#")) expect(window.location.hash).toBe(expected);
    else expect(window.location.hash.startsWith("#" + expected + "?")).toBe(true);
    expect(store.getState().navigationHistory.pending).toBeNull();
  });
  expect(window.location.hash).not.toMatch(/new=|action=|source=|&?q=|extra=|id=/);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(visitCount(store)).toBe(2);
  fireEvent.click(action("前进"));
  await at("#/island");
});

it("does not traverse stale router indices after an externally edited hash", async () => {
  const store = open("#/");
  primary("项目");
  await screen.findByRole("main", { name: "项目" });
  primary("开发环境");
  await screen.findByRole("main", { name: "开发环境" });
  act(() => { window.location.hash = "/island?group=appearance"; });
  await screen.findByRole("main", { name: "灵动岛设置" });
  primary("工具箱");
  await screen.findByRole("main", { name: "工具箱" });
  const button = action("返回");
  act(() => { button.click(); button.click(); });
  await at("#/island?group=appearance");
  fireEvent.click(action("返回"));
  await at("#/environment");
  await waitFor(() => expect(store.getState().navigationHistory.pending).toBeNull());
  fireEvent.click(action("返回"));
  await at("#/projects");
});

it("preserves app-forward after opening a temporary view and protects editor shortcuts", async () => {
  const store = open("#/projects");
  await screen.findByRole("main", { name: "项目" });
  primary("灵动岛");
  await at("#/island");
  fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
  await at("#/projects");
  const input = await screen.findByRole("searchbox", { name: "搜索项目" });
  expect(fireEvent.keyDown(input, { key: "ArrowRight", altKey: true })).toBe(false);
  expect(window.location.hash).toBe("#/projects");
  fireEvent.click(screen.getByRole("button", { name: "新增项目" }));
  fireEvent.click(await screen.findByRole("button", { name: "取消" }));
  await at("#/projects");
  expect(visitCount(store)).toBe(2);
  fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true });
  await at("#/island");
  expect(action("前进").getAttribute("aria-disabled")).toBe("true");
});

it("keeps later browser entries when app-back cleans a visited URL", async () => {
  const store = open("#/github?tab=issues&q=missing");
  await screen.findByRole("main", { name: "GitHub" });
  primary("项目");
  await screen.findByRole("main", { name: "项目" });
  primary("灵动岛");
  await screen.findByRole("main", { name: "灵动岛设置" });
  fireEvent.click(action("返回"));
  await at("#/projects");
  fireEvent.click(action("返回"));
  await waitFor(() => expect(window.location.hash).toMatch(/^#\/github\?tab=issues&account=/));
  act(() => window.history.forward());
  await at("#/projects");
  expect(visitCount(store)).toBe(3);
  fireEvent.click(action("前进"));
  await at("#/island");
});

it("starts at the resolved deep link on load and on refresh", async () => {
  const store = open("#/settings/island?group=animation");
  await at("#/island?group=animation");
  expect(visitCount(store)).toBe(1);
  primary("最近使用");
  await at("#/?section=recent");
  cleanup();
  const refreshed = open(window.location.hash);
  expect(visitCount(refreshed)).toBe(1);
  expect(action("返回").getAttribute("aria-disabled")).toBe("true");
});
