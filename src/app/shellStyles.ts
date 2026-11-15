import * as stylex from "@stylexjs/stylex";

export const shell = stylex.create({
  frame: { height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden",
    backgroundColor: "var(--background)", color: "var(--foreground)" },
  workspace: { flex: "1 1 0", minHeight: 0, overflow: "hidden" },
  main: {
    minHeight: 0, minWidth: 0, overflow: "auto", gap: 20, paddingBlock: 24, backgroundColor: "var(--background)",
    paddingInline: { default: 24, "@media (max-width: 799px)": 16 },
  },
  mobileBar: { display: "flex", alignItems: "center", flexShrink: 0, padding: 8,
    borderBottom: "1px solid var(--sidebar-border)", backgroundColor: "var(--sidebar)", color: "var(--sidebar-foreground)" },
  status: { display: "flex", alignItems: "center", height: 28, paddingInline: 16, gap: 12, flexShrink: 0,
    borderTop: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--muted-foreground)", fontSize: 11 },
  statusItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  version: { marginLeft: "auto", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" },
});
