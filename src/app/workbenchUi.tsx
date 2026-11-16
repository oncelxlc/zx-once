import * as stylex from "@stylexjs/stylex";
import { FlaskConical } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { Field, FieldLabel } from "../components/ui/field";
import { ChoiceSelect } from "./ChoiceSelect";
import { Skeleton } from "../components/ui/skeleton";

export { ui } from "./workbenchStyles";
export { Dialog } from "./WorkbenchDialog";

export function Panel({ title, action, children, id }: { title: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  const heading = useId();
  return <Card size="sm" role="region" id={id} aria-labelledby={heading} className="min-w-0 shrink-0 gap-0 py-0 ring-0">
    <CardHeader className="min-h-10 items-center pt-2">
      <CardTitle id={heading} role="heading" aria-level={2} className="flex min-w-0 items-center gap-2 font-semibold">{title}</CardTitle>
      {action && <CardAction className="row-span-1 self-center">{action}</CardAction>}
    </CardHeader>
    <CardContent className="min-w-0 pt-1 pb-3">{children}</CardContent>
  </Card>;
}

export function DemoBoundary({ children, permission }: { children: ReactNode; permission?: boolean }) {
  const [scenario, setScenario] = useState("ready");
  const id = useId();
  const reset = <Button variant="outline" onClick={() => setScenario("ready")}>{scenario === "error" ? "重试" : "载入正常样本"}</Button>;
  return <>
    <div {...stylex.props(s.scenarios)}>
      <Field orientation="horizontal" className="w-auto">
        <FieldLabel htmlFor={id}><FlaskConical size={14} aria-hidden="true" />演示数据</FieldLabel>
        <ChoiceSelect size="sm" id={id} aria-label="演示数据状态" value={scenario} onValueChange={setScenario} options={[
          { value: "ready", label: "正常" }, { value: "loading", label: "加载中" }, { value: "empty", label: "无数据" },
          { value: "error", label: "读取失败" }, ...(permission ? [{ value: "permission", label: "无权限" }] : []),
        ]} />
      </Field>
    </div>
    {scenario === "ready" ? children : scenario === "error" || scenario === "permission" ?
      <Alert variant="destructive"><AlertDescription>{scenario === "error" ? "演示数据读取失败。" : "此演示账户没有访问权限。"}</AlertDescription>
        <div>{reset}</div></Alert> :
      <Empty><EmptyHeader><EmptyTitle role="status">{scenario === "loading" ? "正在加载演示数据…" : "此样本没有资源。"}</EmptyTitle></EmptyHeader>
        {scenario === "loading" && <Skeleton {...stylex.props(s.skeleton)} />}
        <EmptyContent>{reset}</EmptyContent></Empty>}
  </>;
}

const s = stylex.create({
  scenarios: { display: "flex", justifyContent: "flex-end", marginBlock: -8 },
  skeleton: { width: 180 },
});
