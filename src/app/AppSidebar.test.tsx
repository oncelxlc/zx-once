// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { SidebarProvider } from "../components/ui/sidebar";
import { TooltipProvider } from "../components/ui/tooltip";
import { createAppStore } from "../store";
import { AppSidebar } from "./AppSidebar";
import { defaults } from "./navigation";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps customized groups and pins when migrating the former automatic sidebar width", () => {
  const saved = { ...defaults, sidebar: "auto", groups: [...defaults.groups].reverse(), pins: ["projects"] };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "zx-once.workbench.preferences.v1" ? JSON.stringify(saved) : null,
  });
  expect(createAppStore().getState().preferences).toEqual({ ...saved, sidebar: "collapsed" });
});

it.each(["focus", "hover"])("labels collapsed links and reveals their tooltips on %s", async interaction => {
  const store = createAppStore();
  render(<Provider store={store}><MemoryRouter initialEntries={["/projects"]}>
    <TooltipProvider><SidebarProvider defaultOpen={false}><AppSidebar /></SidebarProvider></TooltipProvider>
  </MemoryRouter></Provider>);
  const projects = screen.getByRole("link", { name: "项目", current: "page" });
  expect(projects.textContent).toBe("项目");
  expect(screen.getByRole("link", { name: "设置" })).toBeTruthy();
  if (interaction === "focus") {
    act(() => projects.focus());
  } else {
    fireEvent.pointerEnter(projects, { pointerType: "mouse" });
    fireEvent.mouseEnter(projects);
  }
  expect(await screen.findByText("项目", { selector: '[data-slot="tooltip-content"]' })).toBeTruthy();
});
