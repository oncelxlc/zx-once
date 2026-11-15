// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, it, onTestFinished } from "vitest";

it("resolves the dark workbench palette and sidebar aliases to neutral graphite", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/styles.css", "utf8");
  document.head.append(style);
  document.documentElement.classList.add("dark");
  onTestFinished(() => {
    style.remove();
    document.documentElement.classList.remove("dark");
  });

  const theme = getComputedStyle(document.documentElement);
  // jsdom exposes custom property aliases as var(--name) even after the cascade.
  function color(name: string): string {
    const value = theme.getPropertyValue(name).trim();
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    return alias ? color(alias[1]) : value.toUpperCase();
  }

  const palette = {
    "#181818": ["background", "primary-foreground", "sidebar-primary-foreground"],
    "#E6E6E6": ["foreground", "card-foreground", "popover-foreground", "secondary-foreground"],
    "#1D1D1D": ["sidebar", "sidebar-background"],
    "#E0E0E0": ["sidebar-foreground"],
    "#222222": ["card"],
    "#292929": ["popover"],
    "#303030": ["secondary", "accent", "sidebar-accent"],
    "#282828": ["muted"],
    "#A3A3A3": ["muted-foreground"],
    "#EAEAEA": ["accent-foreground", "sidebar-accent-foreground"],
    "#383838": ["border", "sidebar-border"],
    "#404040": ["input"],
    "#B8B8B8": ["ring", "sidebar-ring"],
    "#D0D0D0": ["primary", "sidebar-primary"],
  };
  for (const [expected, roles] of Object.entries(palette)) {
    for (const role of roles) expect(color(`--${role}`), role).toBe(expected);
  }
  for (const role of ["primary-hover", "overlay", "scrollbar-thumb", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]) {
    expect(color(`--${role}`), role).toMatch(/^#([\dA-F]{2})\1\1([\dA-F]{2})?$/);
  }
});
