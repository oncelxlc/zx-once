import * as stylex from "@stylexjs/stylex";

export const shell = stylex.create({
  status: { display: "flex", alignItems: "center", height: 28, paddingInline: 16, gap: 12, flexShrink: 0,
    borderTop: "1px solid var(--sidebar-border)", backgroundColor: "var(--sidebar)", color: "var(--muted-foreground)", fontSize: 11 },
  statusItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  version: { marginLeft: "auto", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" },
});
