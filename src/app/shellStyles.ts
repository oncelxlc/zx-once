import * as stylex from "@stylexjs/stylex";

export const shell = stylex.create({
  status: { display: "flex", alignItems: "center", height: 28, flexShrink: 0,
    paddingInline: { default: 16, "@media (max-width: 479px)": 4 }, gap: { default: 12, "@media (max-width: 479px)": 4 },
    borderTop: "1px solid var(--sidebar-border)", backgroundColor: "var(--sidebar)", color: "var(--muted-foreground)", fontSize: 11 },
  statusItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  version: { marginLeft: "auto", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" },
});
