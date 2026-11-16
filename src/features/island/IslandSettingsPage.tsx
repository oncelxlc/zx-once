import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { QueryNavigation, WorkbenchPage } from "../../app/WorkbenchPage";
import { Panel, ui } from "../../app/workbenchUi";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { FieldDescription, FieldGroup, FieldSet } from "../../components/ui/field";
import { mainWindowSession } from "../../mainWindowSession";
import defaults from "./defaults.json";
import { islandApi } from "./islandApi";
import { island } from "./islandSlice";
import { IslandPreview } from "./IslandPreview";
import { NotificationSettings } from "./NotificationSettings";
import { Check, IslandFieldsDisabled } from "./SettingsFields";
import { groups, SettingsGroups } from "./SettingsGroups";
import type { IslandConfig, IslandState } from "./types";
import { useIsland } from "./useIsland";

// The Rust defaults test compares this JSON fixture with IslandConfig::default().
const browserDefaults = defaults as IslandConfig;
const stateLabels: Record<IslandState, string> = {
  disabled: "已停用", hidden: "已隐藏", edgePeek: "边缘待唤醒", compact: "已收起",
  expanded: "已展开", pinned: "已固定", suspended: "全屏暂停",
};

/**
 * A tray draft can already be saved by the time the window reopens. Compare values independently
 * of revision and key order to recognize it. A non-finite field marks an incomplete draft.
 */
function settingsJson(config: IslandConfig) {
  let valid = true;
  const json = JSON.stringify(config, (key, value: unknown) => {
    if (key === "revision") return undefined;
    if (typeof value === "number" && !Number.isFinite(value)) valid = false;
    return value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value;
  });
  return valid ? json : undefined;
}

export function IslandSettingsPage() {
  const { config, displays, status, notifications, desktop, dispatch, error, report, retry } = useIsland();
  const saved = desktop ? config : browserDefaults;
  const [edit, setEdit] = useState<IslandConfig | null>(() => mainWindowSession.draft);
  useLayoutEffect(() => {
    const pending = edit && settingsJson(edit);
    // Keep the last serializable snapshot while a numeric input is temporarily empty.
    if (pending === undefined) return;
    if (saved && pending === settingsJson(saved)) {
      mainWindowSession.draft = null;
      setEdit(null);
    } else {
      mainWindowSession.draft = edit;
    }
  }, [edit, saved]);
  useLayoutEffect(() => () => { mainWindowSession.draft = null; }, []);
  const draft = saved && (edit ?? saved);
  const [search] = useSearchParams();
  const [group, groupLabel] = groups.find(([key]) => key === search.get("group")) ?? groups[0];
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const conflict = edit && saved && edit.revision !== saved.revision;

  async function perform(action: () => Promise<unknown>, message = "") {
    setBusy(true);
    setNotice("");
    dispatch(island.actions.errorChanged(null));
    try { await action(); setNotice(message); }
    catch (reason) { report(reason); }
    finally { setBusy(false); }
  }
  async function commit(action: () => Promise<IslandConfig>) {
    await perform(async () => {
      dispatch(island.actions.configReceived(await action()));
      setEdit(null);
    }, "设置已保存");
  }
  function editConfig(next: IslandConfig) {
    setEdit(next);
    setNotice("");
  }
  return (
    <WorkbenchPage title="灵动岛设置" view={group} navigation={<QueryNavigation label="设置分组"
      param="group" items={groups} current={group} omitDefault />}>
      <Panel title={groupLabel}>
        <form onSubmit={event => {
          event.preventDefault();
          if (desktop && saved && edit && !busy && !conflict) void commit(() => islandApi.save(edit));
        }}>
          <FieldGroup>
            {!desktop && <Alert role="note"><AlertDescription>浏览器可预览草稿。保存设置和控制窗口需使用 Windows 桌面应用。</AlertDescription></Alert>}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {draft ? <>
              <IslandFieldsDisabled.Provider value={busy}>
                <FieldSet disabled={busy} aria-label={groupLabel}>
                  {group === "overview" && <>
                    <FieldDescription>窗口状态 · {status ? stateLabels[status.state] : desktop ? "正在连接" : "浏览器预览"}</FieldDescription>
                    <Check label="启用灵动岛" value={draft.enabled} change={enabled => editConfig({ ...draft, enabled })} />
                    <div {...stylex.props(ui.row)}>
                      <Button variant="outline" disabled={!desktop || !config?.enabled} onClick={() => void perform(islandApi.show)}>显示岛屿</Button>
                      <Button variant="outline" disabled={!desktop || !config?.enabled} onClick={() => void perform(islandApi.hide)}>隐藏岛屿</Button>
                      <Button variant="outline" disabled={!desktop || !config?.interaction.pinEnabled || !status || !["compact", "expanded", "pinned"].includes(status.state)}
                        aria-pressed={status?.state === "pinned"}
                        onClick={() => void perform(() => islandApi.pin(status?.state !== "pinned"))}>{status?.state === "pinned" ? "取消固定" : "固定岛屿"}</Button>
                      <Button variant="outline" disabled={!desktop || !config?.enabled} onClick={() => void perform(islandApi.restart)}>重启岛屿</Button>
                    </div>
                  </>}
                  <SettingsGroups group={group} config={draft} displays={displays}
                    update={(section, patch) => editConfig({ ...draft, [section]: { ...draft[section], ...patch } })} />
                  {group === "notifications" && <NotificationSettings enabled={draft.notifications.enabled}
                    listening={Boolean(desktop && saved?.enabled && saved.notifications.enabled)} status={notifications}
                    change={enabled => editConfig({ ...draft, notifications: { enabled } })} perform={perform}
                    refresh={async () => { dispatch(island.actions.notificationsReceived(await islandApi.notifications())); }} />}
                  {(group === "animation" || group === "appearance") && <IslandPreview config={draft} desktop={desktop} report={report} />}
                </FieldSet>
              </IslandFieldsDisabled.Provider>
              {conflict && <Alert variant="destructive"><AlertDescription>配置已在其他窗口更新。放弃草稿可载入最新设置。</AlertDescription></Alert>}
              <div {...stylex.props(ui.row)}>
                <Button type="submit" disabled={!desktop || !saved || !edit || busy || Boolean(conflict)}>保存设置</Button>
                {edit && <Button variant="outline" disabled={busy}
                  onClick={() => { setEdit(null); setNotice(""); }}>放弃草稿</Button>}
                {group === "overview" && <Button variant="outline" disabled={!saved || busy || Boolean(conflict)}
                  onClick={() => { if (saved) editConfig({ ...browserDefaults, revision: saved.revision }); }}>恢复默认设置</Button>}
              </div>
              <FieldDescription role="status">{busy ? "正在处理…" : notice || (edit ? "有未保存的更改" : "")}</FieldDescription>
            </> : error ? <Button variant="outline" onClick={retry}>重新读取设置</Button>
              : <p role="status">正在读取桌面设置…</p>}
          </FieldGroup>
        </form>
      </Panel>
    </WorkbenchPage>
  );
}
