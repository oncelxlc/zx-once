use std::{ffi::c_void, mem::size_of};
use windows_sys::{
    core::{s, w},
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        System::LibraryLoader::{GetModuleHandleW, GetProcAddress},
        UI::{
            Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{
                GetForegroundWindow, GetWindowInfo, SendMessageW, WINDOWINFO, WM_NCACTIVATE,
                WM_NCDESTROY, WS_ACTIVECAPTION,
            },
        },
    },
};

// These user32 composition attributes are not declared in the Windows SDK.
const WCA_FORCE_ACTIVEWINDOW_APPEARANCE: i32 = 15;
const WCA_ACCENT_POLICY: i32 = 19;
const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;

#[repr(C)]
struct Attribute {
    id: i32,
    data: *const c_void,
    size: usize,
}

#[derive(Default)]
#[repr(C)]
struct AccentPolicy {
    state: u32,
    flags: u32,
    gradient_color: u32,
    animation: u32,
}

fn policy(background: u32, transparency: u8) -> AccentPolicy {
    if transparency == 0 {
        return AccentPolicy::default();
    }
    // Acrylic treats a zero tint alpha as an unspecified color. One alpha unit is its clearest tint.
    let alpha = ((100 - u32::from(transparency)) * 255 + 50) / 100;
    AccentPolicy {
        state: ACCENT_ENABLE_ACRYLICBLURBEHIND,
        gradient_color: background | alpha.max(1) << 24,
        ..Default::default()
    }
}

/// user32 has no import library entry for this operation. Look up the export from the already
/// loaded system DLL and check its BOOL result before exposing a transparent WebView.
fn set<T>(hwnd: HWND, id: i32, value: &T) -> bool {
    type Setter = unsafe extern "system" fn(HWND, *const Attribute) -> i32;
    unsafe {
        let user32 = GetModuleHandleW(w!("user32.dll"));
        let Some(proc) = GetProcAddress(user32, s!("SetWindowCompositionAttribute")) else {
            return false;
        };
        let setter = std::mem::transmute::<unsafe extern "system" fn() -> isize, Setter>(proc);
        setter(
            hwnd,
            &Attribute {
                id,
                data: (value as *const T).cast(),
                size: size_of::<T>(),
            },
        ) != 0
    }
}

pub(super) fn keep_active_appearance(hwnd: HWND, enabled: bool) -> bool {
    let applied = set(hwnd, WCA_FORCE_ACTIVEWINDOW_APPEARANCE, &i32::from(enabled));
    unsafe {
        if enabled {
            if SetWindowSubclass(hwnd, Some(caption_proc), 1, 0) == 0 {
                return false;
            }
            let mut info = WINDOWINFO {
                cbSize: size_of::<WINDOWINFO>() as u32,
                ..Default::default()
            };
            if GetWindowInfo(hwnd, &mut info) != 0 && info.dwWindowStatus & WS_ACTIVECAPTION == 0 {
                SendMessageW(hwnd, WM_NCACTIVATE, 1, 0);
            }
        } else if RemoveWindowSubclass(hwnd, Some(caption_proc), 1) != 0 {
            // Restore the actual non-client state when control returns to the system contrast theme.
            SendMessageW(
                hwnd,
                WM_NCACTIVATE,
                usize::from(GetForegroundWindow() == hwnd),
                0,
            );
        }
    }
    applied
}

unsafe extern "system" fn caption_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    _: usize,
) -> LRESULT {
    if msg == WM_NCACTIVATE && wp == 0 {
        // Only the non-client paint stays active. TRUE lets the real activation/focus transfer proceed.
        DefSubclassProc(hwnd, msg, 1, lp);
        return 1;
    }
    if msg == WM_NCDESTROY {
        RemoveWindowSubclass(hwnd, Some(caption_proc), 1);
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}

pub(super) fn tint(hwnd: HWND, background: u32, transparency: u8) -> bool {
    set(hwnd, WCA_ACCENT_POLICY, &policy(background, transparency))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, GetWindowInfo, WINDOWINFO, WS_ACTIVECAPTION,
        WS_OVERLAPPEDWINDOW,
    };

    #[test]
    fn transparency_controls_the_alpha_of_the_same_color_across_the_frame() {
        let color = 0x00e8b35a;
        assert_eq!(policy(color, 0).state, 0);
        assert_eq!(policy(color, 1).gradient_color, 0xfce8b35a);
        assert_eq!(policy(color, 50).gradient_color, 0x80e8b35a);
        assert_eq!(policy(color, 100).gradient_color, 0x01e8b35a);
        assert_eq!(policy(color, 100).state, ACCENT_ENABLE_ACRYLICBLURBEHIND);
    }

    #[test]
    fn deactivation_keeps_the_caption_painted_active_without_holding_focus() {
        unsafe {
            let hwnd = CreateWindowExW(
                0,
                w!("STATIC"),
                null(),
                WS_OVERLAPPEDWINDOW,
                0,
                0,
                240,
                120,
                null_mut(),
                null_mut(),
                null_mut(),
                null(),
            );
            assert!(!hwnd.is_null());
            let installed = keep_active_appearance(hwnd, true);
            let tinted = tint(hwnd, 0x00222222, 50);
            let allow_deactivate = SendMessageW(hwnd, WM_NCACTIVATE, 0, 0);
            let mut info = WINDOWINFO {
                cbSize: size_of::<WINDOWINFO>() as u32,
                ..Default::default()
            };
            GetWindowInfo(hwnd, &mut info);
            let kept_active = info.dwWindowStatus & WS_ACTIVECAPTION != 0;
            let took_focus = GetForegroundWindow() == hwnd;
            keep_active_appearance(hwnd, false);
            SendMessageW(hwnd, WM_NCACTIVATE, 0, 0);
            GetWindowInfo(hwnd, &mut info);
            DestroyWindow(hwnd);
            assert!(installed && tinted && kept_active && !took_focus);
            assert_ne!(allow_deactivate, 0);
            assert_eq!(info.dwWindowStatus & WS_ACTIVECAPTION, 0);
        }
    }
}
