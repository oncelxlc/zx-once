mod layout;
mod paint;

use crate::window_chrome::on_main_window;
use std::{cell::Cell, mem::size_of, ptr::null_mut, rc::Rc};
use tauri::{Emitter, EventTarget, WebviewWindow};
use windows_sys::{
    core::w,
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        Graphics::Gdi::{GetSysColor, InvalidateRect, COLOR_ACTIVECAPTION, COLOR_CAPTIONTEXT},
        UI::{
            Controls::*,
            Shell::{DefSubclassProc, GetWindowSubclass, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::*,
        },
    },
};

const BACK: usize = 0x7350;
const FORWARD: usize = BACK + 1;
const SIDEBAR: usize = FORWARD + 1;
const SUBCLASS: usize = 0x5a584e;

struct Toolbar {
    window: WebviewWindow,
    hwnd: HWND,
    colors: Cell<[u32; 2]>,
    title_width: Cell<Option<(u32, i32)>>,
    ready: Cell<bool>,
}

fn os_error(operation: &str) -> String {
    format!("{operation}: {}", std::io::Error::last_os_error())
}

impl Toolbar {
    // The owner's subclass owns one Rc. A temporary clone survives reentrant window messages.
    unsafe fn from_data(data: usize) -> Rc<Self> {
        let ptr = data as *const Self;
        Rc::increment_strong_count(ptr);
        Rc::from_raw(ptr)
    }

    unsafe fn install(window: WebviewWindow, owner: HWND) -> Result<Rc<Self>, String> {
        let mut existing = 0;
        if GetWindowSubclass(owner, Some(owner_proc), SUBCLASS, &mut existing) != 0 {
            return Ok(Self::from_data(existing));
        }
        let init = INITCOMMONCONTROLSEX {
            dwSize: size_of::<INITCOMMONCONTROLSEX>() as u32,
            dwICC: ICC_BAR_CLASSES,
        };
        if InitCommonControlsEx(&init) == 0 {
            return Err(os_error("初始化标题栏控件失败"));
        }
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            TOOLBARCLASSNAMEW,
            w!("页面导航"),
            WS_POPUP
                | TBSTYLE_FLAT
                | TBSTYLE_LIST
                | TBSTYLE_TOOLTIPS
                | (CCS_NORESIZE | CCS_NOPARENTALIGN | CCS_NODIVIDER) as u32,
            0,
            0,
            0,
            0,
            owner,
            null_mut(),
            null_mut(),
            null_mut(),
        );
        if hwnd.is_null() {
            return Err(os_error("创建标题栏导航失败"));
        }
        let bar = Rc::new(Self {
            window,
            hwnd,
            colors: Cell::new([
                GetSysColor(COLOR_ACTIVECAPTION),
                GetSysColor(COLOR_CAPTIONTEXT),
            ]),
            ready: Cell::new(false),
            title_width: Cell::new(None),
        });
        SendMessageW(hwnd, TB_BUTTONSTRUCTSIZE, size_of::<TBBUTTON>(), 0);
        SendMessageW(hwnd, TB_SETUNICODEFORMAT, 1, 0);
        SendMessageW(
            hwnd,
            TB_SETEXTENDEDSTYLE,
            0,
            TBSTYLE_EX_MIXEDBUTTONS as isize,
        );
        SendMessageW(hwnd, TB_SETBITMAPSIZE, 0, 0x00010001);
        SendMessageW(hwnd, TB_SETPARENT, owner as usize, 0);
        let buttons = [
            (BACK, w!("返回")),
            (FORWARD, w!("前进")),
            (SIDEBAR, w!("展开导航")),
        ]
        .map(|(id, name)| TBBUTTON {
            iBitmap: I_IMAGENONE,
            idCommand: id as i32,
            iString: name as isize,
            fsStyle: if id == SIDEBAR { BTNS_CHECK as u8 } else { 0 },
            fsState: if id == SIDEBAR {
                TBSTATE_ENABLED as u8
            } else {
                0
            },
            ..Default::default()
        });
        if SendMessageW(
            hwnd,
            TB_ADDBUTTONSW,
            buttons.len(),
            buttons.as_ptr() as isize,
        ) == 0
        {
            DestroyWindow(hwnd);
            return Err("添加标题栏按钮失败".into());
        }
        let data = Rc::into_raw(bar.clone());
        if SetWindowSubclass(owner, Some(owner_proc), SUBCLASS, data as usize) == 0 {
            drop(Rc::from_raw(data));
            DestroyWindow(hwnd);
            return Err(os_error("监听原生标题栏失败"));
        }
        Ok(bar)
    }

    unsafe fn position(&self, owner: HWND) {
        if let Some(bounds) = layout::bounds(owner, &self.title_width).filter(|_| self.ready.get())
        {
            let size = bounds.button_width as isize | ((bounds.height as isize) << 16);
            if SendMessageW(self.hwnd, TB_GETBUTTONSIZE, 0, 0) != size {
                SendMessageW(self.hwnd, TB_SETBUTTONSIZE, 0, size);
            }
            let mut metrics = TBMETRICS {
                cbSize: size_of::<TBMETRICS>() as u32,
                dwMask: TBMF_BUTTONSPACING,
                ..Default::default()
            };
            SendMessageW(self.hwnd, TB_GETMETRICS, 0, &raw mut metrics as isize);
            if metrics.cxButtonSpacing != bounds.gap {
                metrics.cxButtonSpacing = bounds.gap;
                SendMessageW(self.hwnd, TB_SETMETRICS, 0, &raw const metrics as isize);
            }
            SetWindowPos(
                self.hwnd,
                null_mut(),
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSENDCHANGING | SWP_SHOWWINDOW,
            );
        } else {
            ShowWindow(self.hwnd, SW_HIDE);
        }
    }
}

pub(super) fn set_colors(
    window: WebviewWindow,
    hwnd: HWND,
    colors: [u32; 2],
) -> Result<(), String> {
    unsafe {
        let bar = Toolbar::install(window, hwnd)?;
        bar.colors.set(colors);
        InvalidateRect(bar.hwnd, null_mut(), 0);
    }
    Ok(())
}

/// Install after subscribing to window-navigation. Only the application router determines which
/// history actions are available. Rebuilt WebViews send their own initial state.
#[tauri::command]
pub(crate) async fn set_main_window_navigation(
    window: WebviewWindow,
    can_go_back: bool,
    can_go_forward: bool,
    sidebar_open: bool,
) -> Result<(), String> {
    on_main_window(window, move |window, owner| unsafe {
        let bar = Toolbar::install(window, owner)?;
        SendMessageW(bar.hwnd, TB_ENABLEBUTTON, BACK, can_go_back as isize);
        SendMessageW(bar.hwnd, TB_ENABLEBUTTON, FORWARD, can_go_forward as isize);
        SendMessageW(bar.hwnd, TB_CHECKBUTTON, SIDEBAR, sidebar_open as isize);
        let name = if sidebar_open {
            w!("收起导航")
        } else {
            w!("展开导航")
        };
        let info = TBBUTTONINFOW {
            cbSize: size_of::<TBBUTTONINFOW>() as u32,
            dwMask: TBIF_TEXT,
            pszText: name.cast_mut(),
            ..Default::default()
        };
        SendMessageW(
            bar.hwnd,
            TB_SETBUTTONINFOW,
            SIDEBAR,
            &raw const info as isize,
        );
        bar.ready.set(true);
        bar.position(owner);
        Ok(())
    })
    .await
}

unsafe extern "system" fn owner_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    id: usize,
    data: usize,
) -> LRESULT {
    let bar = Toolbar::from_data(data);
    match msg {
        WM_COMMAND if lp == bar.hwnd as isize => {
            let command = wp & 0xffff;
            let action = match command {
                BACK => "back",
                FORWARD => "forward",
                SIDEBAR => "toggle-sidebar",
                _ => return DefSubclassProc(hwnd, msg, wp, lp),
            };
            if SendMessageW(bar.hwnd, TB_ISBUTTONENABLED, command, 0) != 0 {
                let _ = bar.window.emit_to(
                    EventTarget::webview_window("main"),
                    "window-navigation",
                    action,
                );
            }
            return 0;
        }
        WM_NOTIFY if lp != 0 => {
            let header = &*(lp as *const NMHDR);
            if header.hwndFrom == bar.hwnd && header.code == NM_CUSTOMDRAW {
                return paint::custom_draw(&*(lp as *const NMCUSTOMDRAW), bar.colors.get());
            }
        }
        WM_NCDESTROY => {
            RemoveWindowSubclass(hwnd, Some(owner_proc), id);
            drop(Rc::from_raw(data as *const Toolbar));
        }
        WM_WINDOWPOSCHANGED | WM_DPICHANGED | WM_STYLECHANGED | WM_SETTEXT | WM_SETTINGCHANGE => {
            if matches!(msg, WM_SETTEXT | WM_SETTINGCHANGE) {
                bar.title_width.set(None);
            }
            let result = DefSubclassProc(hwnd, msg, wp, lp);
            if IsWindow(bar.hwnd) != 0 {
                bar.position(hwnd);
            }
            return result;
        }
        _ => {}
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}
