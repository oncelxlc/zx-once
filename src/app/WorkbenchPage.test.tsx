// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { HashRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import { createAppStore } from "../store";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openPage(route: string) {
  window.history.replaceState(null, "", route);
  render(<Provider store={createAppStore()}><HashRouter><App /></HashRouter></Provider>);
}

it("selects the environment detail's category and clears the detail when changing views", async () => {
  vi.stubGlobal("innerWidth", 1600);
  openPage("#/environment?id=pnpm");
  expect(await screen.findByRole("dialog", { name: "pnpm" })).toBeTruthy();
  const nav = within(screen.getByRole("navigation", { name: "环境类别" }));
  expect(nav.getByRole("link", { name: "包管理器", current: "page" })).toBeTruthy();
  const main = screen.getByRole("main", { name: "开发环境" });
  main.scrollTop = 250;
  fireEvent.click(nav.getByRole("link", { name: "工具链" }));
  expect(await screen.findByRole("link", { name: "Visual Studio Code" })).toBeTruthy();
  expect(window.location.hash).toBe("#/environment?tab=toolchain");
  expect(screen.queryByRole("dialog", { name: "pnpm" })).toBeNull();
  expect(main.scrollTop).toBe(0);
});

it("keeps a linked repository's account in the next GitHub view after reload", async () => {
  vi.stubGlobal("innerWidth", 1600);
  openPage("#/github?repo=web-client");
  expect(await screen.findByRole("dialog", { name: "web-client" })).toBeTruthy();
  const nav = within(screen.getByRole("navigation", { name: "GitHub 资源" }));
  fireEvent.click(nav.getByRole("link", { name: "Issues" }));
  expect(await screen.findByText("补充空列表反馈")).toBeTruthy();
  const route = window.location.hash;
  cleanup();
  openPage(route);
  expect(await screen.findByText("补充空列表反馈")).toBeTruthy();
  expect(within(screen.getByRole("combobox", { name: "演示账户" })).getByText("Demo Lab")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps the selected host when navigating to its Docker resources", async () => {
  openPage("#/remote?host=build");
  const nav = within(await screen.findByRole("navigation", { name: "远程主机功能" }));
  fireEvent.click(nav.getByRole("link", { name: "Docker" }));
  expect(await screen.findByText("build-agent")).toBeTruthy();
  expect(nav.getByRole("link", { name: "Docker", current: "page" })).toBeTruthy();
  expect(window.location.hash).toBe("#/remote?host=build&tab=docker");
});

it("records tools opened from secondary navigation and preserves the directory search", async () => {
  openPage("#/toolbox");
  const nav = within(await screen.findByRole("navigation", { name: "工具导航" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索工具" }), { target: { value: "Base64" } });
  fireEvent.click(nav.getByRole("link", { name: "JSON 格式化" }));
  fireEvent.change(await screen.findByLabelText("输入"), { target: { value: '{"a":1}' } });
  fireEvent.click(screen.getByRole("button", { name: "格式化" }));
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "输出" }).value).toBe(JSON.stringify({ a: 1 }, null, 2));
  fireEvent.click(nav.getByRole("link", { name: "全部工具" }));
  expect(await screen.findByDisplayValue("Base64")).toBeTruthy();
  const main = within(screen.getByRole("main", { name: "工具箱" }));
  expect(main.getByRole("link", { name: "JSON 格式化" })).toBeTruthy();
  expect(main.queryByRole("link", { name: /时间戳/ })).toBeNull();
});
