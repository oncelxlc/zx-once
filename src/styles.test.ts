// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, it, onTestFinished } from "vitest";

it("composites the outer frame once while the page header and content keep their theme fill", () => {
  const root = document.documentElement;
  const frame = document.createElement("div");
  frame.dataset.slot = "sidebar-wrapper";
  const sidebar = document.createElement("aside");
  sidebar.dataset.slot = "sidebar-inner";
  const header = document.createElement("header");
  header.dataset.slot = "workbench-header";
  const footer = document.createElement("footer");
  footer.dataset.slot = "workbench-status";
  const main = document.createElement("main");
  frame.append(sidebar, header, main, footer);
  const style = document.createElement("style");
  // The utility classes normally supply solid fills after Tailwind compilation.
  style.textContent = 'html, body, [data-slot^="sidebar-"] { background-color: black; } main { background-color: var(--background); }\n'
    + readFileSync("src/styles.css", "utf8");
  document.head.append(style);
  document.body.append(frame);
  root.dataset.translucent = "true";
  onTestFinished(() => {
    delete root.dataset.translucent;
    delete root.dataset.nativeBackdrop;
    frame.remove();
    style.remove();
  });

  // jsdom supports screen media but does not emulate OS color and transparency preferences.
  const media = [...(style.sheet?.cssRules ?? [])].find((rule): rule is CSSMediaRule =>
    rule instanceof CSSMediaRule && rule.conditionText.includes("prefers-reduced-transparency"));
  if (!media) throw new Error("Missing translucency media rule");
  expect(media.conditionText).toContain("forced-colors: none");
  media.media.mediaText = "screen";
  const fill = (element: Element) => getComputedStyle(element).backgroundColor;
  const transparent = "rgba(0, 0, 0, 0)";
  expect(fill(frame)).toContain("--frame-transparency");
  for (const native of [undefined, "false", "true"]) {
    if (native) root.dataset.nativeBackdrop = native;
    expect(fill(sidebar)).toBe(transparent);
    expect(fill(footer)).toBe(transparent);
    expect(fill(header)).toBe(fill(main));
    expect(fill(header)).not.toBe(transparent);
    if (native === "false") expect(fill(frame)).toBe("rgb(0, 0, 0)");
    if (native === "true") {
      for (const surface of [root, document.body, frame]) expect(fill(surface)).toBe(transparent);
    }
  }
  media.media.mediaText = "print";
  for (const element of [root, document.body, frame, sidebar]) expect(fill(element)).toBe("rgb(0, 0, 0)");
});

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
