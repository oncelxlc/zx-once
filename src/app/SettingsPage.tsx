import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router";
import { Checkbox } from "../components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "../components/ui/field";
import { Slider } from "../components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import type { RootState } from "../store";
import { NavigationEditor } from "./NavigationEditor";
import type { Theme } from "./navigation";
import { setTheme, setTransparencyPercent, setTranslucency } from "./preferencesSlice";
import { SecondaryNav, WorkbenchPage } from "./WorkbenchPage";
import { Panel } from "./workbenchUi";

const sections = [
  { to: "/settings/appearance", label: "外观" },
  { to: "/settings/navigation", label: "导航自定义" },
];

const themes = [
  { id: "system", name: "跟随系统", icon: Monitor },
  { id: "light", name: "浅色", icon: Sun },
  { id: "dark", name: "深色", icon: Moon },
] satisfies { id: Theme; name: string; icon: typeof Monitor }[];

export function SettingsPage() {
  const { pathname } = useLocation();
  const { theme, translucency } = useSelector((state: RootState) => state.preferences);
  const dispatch = useDispatch();
  const section = sections.find(item => item.to === pathname) ?? sections[0];
  return <WorkbenchPage title="设置" view={section.to} navigation={<SecondaryNav label="工作台设置"
    links={sections.map(item => ({ ...item, active: item === section }))} />}>
    {section.to === "/settings/navigation" ? <NavigationEditor /> : <>
      <Panel title="工作台主题">
        <ToggleGroup aria-label="工作台主题" className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2"
          value={[theme]} onValueChange={values => {
            const next = themes.find(item => item.id === values[0]);
            if (next) dispatch(setTheme(next.id));
          }}>
          {themes.map(({ id, name, icon: Icon }) =>
            <ToggleGroupItem key={id} value={id} className="min-h-9 justify-start gap-2 px-3">
              <Icon aria-hidden="true" />{name}{theme === id && <Check className="ml-auto" aria-hidden="true" />}
            </ToggleGroupItem>)}
        </ToggleGroup>
      </Panel>
      <Panel title="半透明效果">
        <FieldGroup className="max-w-md gap-3">
          <Field orientation="horizontal" className="min-h-8">
            <Checkbox id="frame-translucency" checked={translucency.enabled}
              onCheckedChange={enabled => dispatch(setTranslucency(enabled))} />
            <FieldLabel htmlFor="frame-translucency">启用半透明效果</FieldLabel>
          </Field>
          <Field data-disabled={!translucency.enabled || undefined}>
            <div className="flex items-center justify-between">
              <FieldTitle id="frame-transparency-label">外框透明度</FieldTitle>
              <span aria-hidden="true" className="text-sm tabular-nums">{translucency.percent}%</span>
            </div>
            <Slider aria-labelledby="frame-transparency-label" aria-valuetext={translucency.percent + "%"}
              disabled={!translucency.enabled} value={[translucency.percent]}
              onValueChange={([percent]) => dispatch(setTransparencyPercent(percent))} />
            <FieldDescription>数值越高，标题栏、导航栏和底部工具栏透出的背景越多。</FieldDescription>
          </Field>
        </FieldGroup>
      </Panel>
    </>}
  </WorkbenchPage>;
}
