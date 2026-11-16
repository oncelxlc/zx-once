# 项目结构、运行与验证

zx-once 在浏览器和桌面主窗口中加载同一套 React 工作台。项目、环境、Git、GitHub 和远程中心提供可交互的演示数据。工具箱在本地转换文本。Windows 10 / 11 桌面通过 Tauri 和 Rust 接入托盘、置顶灵动岛、系统媒体会话及通知。[工作台页面与数据范围](../modules/workbench.md) · [灵动岛功能](../modules/island.md)

## 代码入口

| 位置 | 职责 |
| --- | --- |
| [前端启动](../../src/main.tsx)、[路由](../../src/App.tsx) | 启动时尝试恢复桌面窗口快照，创建 Redux store，再挂载 HashRouter。首页为 `#/`。 |
| [工作台外壳](../../src/app/AppShell.tsx)、[共享页面布局](../../src/app/WorkbenchPage.tsx)、[业务模块](../../src/features/)、[共享状态](../../src/store.ts) | 外壳管理主导航、状态栏和统一的外框透明度。共享布局管理固定页头、垂直二级导航、正文滚动及切页动画。业务模块通过 Redux 共享会话数据。 |
| [基础组件](../../src/components/ui/)、[组件配置](../../components.json)、[全局样式](../../src/styles.css)、[PostCSS 主题](../../src/workbench.pcss) | shadcn/ui 使用 Base Nova 和 Neutral 基础配置。全局 CSS 定义页面和外框样式，导入的 PostCSS 文件提供主题变量及 Tailwind、StyleX 编译指令。图标来自 lucide-react。 |
| [桌面入口](../../src-tauri/src/lib.rs)、[灵动岛](../../src-tauri/src/island/) | Windows 主窗口使用支持透明背景的 WebView2。Rust 管理窗口材质、托盘、配置和独立的原生岛窗。托盘重开时复用主窗口配置，再按保存的外观偏好设置材质。 |
| [Tauri 配置](../../src-tauri/tauri.conf.json)、[主窗口权限](../../src-tauri/capabilities/main.json) | 配置开发服务器地址、生产资源、原生窗口装饰、窗口尺寸和安装包。Windows 本地 `main` 窗口可管理灵动岛、同步标题栏配色和导航按钮状态。 |
| [标题栏工具栏](../../src-tauri/src/caption_navigation.rs)、[前端导航操作](../../src/app/WindowNavigation.tsx) | React 订阅当前窗口的 `window-navigation` 事件，再用 `set_main_window_navigation` 同步操作可用性和侧栏状态。原生控件处理鼠标，页面切换沿用 React Router。 |

## 运行与构建

在仓库根目录使用 Node.js 24.15+（24.x）或 26.x。pnpm 版本由 `packageManager` 指定，前端依赖按锁文件安装。桌面端锁定的 Tauri 依赖要求 Rust 1.90 或更高版本。在 Windows 上还需 MSVC 工具链、C++ 构建工具和 WebView2。[前端命令与包管理器版本](../../package.json) · [桌面端依赖锁文件](../../Cargo.lock) · [Tauri 环境准备](https://v2.tauri.app/start/prerequisites/)

| 在仓库根目录执行 | 用途 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 安装锁定的前端依赖。 |
| `pnpm dev` | 启动 Vite，浏览器访问 `http://localhost:1420`。 |
| `pnpm tauri:dev` | 启动 Vite 和桌面窗口。在 Windows 上同时启动托盘并按已保存的配置加载灵动岛。 |
| `pnpm build` | 执行 TypeScript 和 Vite 构建，输出到 `dist/`。 |
| `pnpm tauri:build` | 构建前端和桌面安装包。需要 Windows 系统通知权限的安装方式见 [MSIX 打包](../special/windows-notifications.md)。 |

## 验证

- **前端**　在仓库根目录运行 `pnpm check`。它依次运行 `pnpm typecheck`（TypeScript 和生产组件 200 有效行限制）、`pnpm test`（Vitest 和组件行数检查器的单元测试）、`pnpm build`。
- **Rust**　在 `src-tauri/` 运行下列命令。Windows CI 对推送和拉取请求执行相同的 Rust 检查及前端检查。[CI 工作流](../../.github/workflows/check.yml)

```sh
cargo fmt --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked
```

尚未执行的操作及预期结果统一记录在[待操作验证清单](pending-verifications.md)。
