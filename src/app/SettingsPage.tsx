import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import type { RootState } from "../store";
import { NavigationEditor } from "./NavigationEditor";
import type { Theme } from "./navigation";
import { setTheme } from "./preferencesSlice";
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
  const theme = useSelector((state: RootState) => state.preferences.theme);
  const dispatch = useDispatch();
  const section = sections.find(item => item.to === pathname) ?? sections[0];
  return <WorkbenchPage title="设置" view={section.to} navigation={<SecondaryNav label="工作台设置"
    links={sections.map(item => ({ ...item, active: item === section }))} />}>
    {section.to === "/settings/navigation" ? <NavigationEditor /> : <Panel title="工作台主题">
      <ToggleGroup aria-label="工作台主题" className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2.5"
        value={[theme]} onValueChange={values => {
        const next = themes.find(item => item.id === values[0]);
        if (next) dispatch(setTheme(next.id));
      }}>
        {themes.map(({ id, name, icon: Icon }) =>
          <ToggleGroupItem key={id} value={id} className="h-auto justify-start gap-2.5 px-3 py-3.5">
            <Icon aria-hidden="true" />{name}{theme === id && <Check className="ml-auto" aria-hidden="true" />}
          </ToggleGroupItem>)}
      </ToggleGroup>
    </Panel>}
  </WorkbenchPage>;
}
