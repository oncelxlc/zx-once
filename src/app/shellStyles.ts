import * as stylex from "@stylexjs/stylex";

export const shell = stylex.create({
  status: { display: "flex", alignItems: "center", minHeight: 28, flexShrink: 0,
    paddingInline: { default: 16, "@media (max-width: 479px)": 4 }, gap: { default: 12, "@media (max-width: 479px)": 4 },
    color: "var(--sidebar-foreground)", fontSize: "0.75rem" },
  statusItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  version: { marginLeft: "auto", fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" },
});
