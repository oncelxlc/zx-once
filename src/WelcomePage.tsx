import * as stylex from "@stylexjs/stylex";
import { PanelsTopLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { writePreference } from "./app/localPreferences";
import { DemoBoundary, PageHeader } from "./app/workbenchUi";
import { Button } from "./components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "./components/ui/empty";
import { OverviewPreferences } from "./features/overview/OverviewPreferences";
import { defaultLayout, layoutKey, loadLayout, type Widget, type WidgetId } from "./features/overview/overviewLayout";
import { ActivityFeed, EnvironmentSummary, GitSummary, GithubSummary, RecentProjects, RemoteSummary } from "./features/overview/OverviewResources";

const widgets = {
  recent: RecentProjects, environment: EnvironmentSummary, git: GitSummary,
  github: GithubSummary, remote: RemoteSummary, activity: ActivityFeed,
};

export function WelcomePage() {
  const location = useLocation();
  const section = new URLSearchParams(location.search).get("section");
  const target: WidgetId | null = section === "recent" || section === "activity" ? section : null;
  const [layout, setLayout] = useState(loadLayout);
  const [editing, setEditing] = useState(false);
  const visible = layout.filter(item => item.visible || item.id === target);
  function update(value: Widget[]) { setLayout(value); writePreference(layoutKey, value); }
  useEffect(() => {
    if (target) {
      const panel = document.getElementById("widget-" + target);
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView?.({ block: "start" });
    }
  }, [target, location.key]);
  return <>
    <PageHeader title="工作台总览" description={new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
      actions={<Button variant="outline" onClick={() => setEditing(true)}><PanelsTopLeft data-icon="inline-start" aria-hidden="true" />自定义总览</Button>} />
    <DemoBoundary key={location.key}>
      {visible.length ? <div {...stylex.props(s.flow)}>
        {visible.map(({ id }) => {
          const Component = widgets[id];
          return <div key={id} id={"widget-" + id} tabIndex={-1} {...stylex.props(s.widget)}>
            <Component />
          </div>;
        })}
      </div> : <Empty><EmptyHeader><EmptyTitle>未显示任何模块。</EmptyTitle></EmptyHeader>
        <EmptyContent><Button variant="outline" onClick={() => update(defaultLayout)}>恢复默认布局</Button></EmptyContent></Empty>}
    </DemoBoundary>
    {editing && <OverviewPreferences layout={layout} update={update} close={() => setEditing(false)} />}
  </>;
}

const s = stylex.create({
  flow: { columnCount: { default: 2, "@media (max-width: 900px)": 1 }, columnGap: 16, flexShrink: 0 },
  widget: { breakInside: "avoid", marginBlockEnd: { default: 16, ":last-child": 0 }, scrollMarginBlockStart: 12 },
});
