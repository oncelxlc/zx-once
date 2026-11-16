use super::{os_error, SUBCLASS};
use std::{
    mem::size_of,
    ptr::{null, null_mut},
    slice,
};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM},
    Graphics::Gdi::*,
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::*,
    },
};

pub(super) unsafe fn enabled(hwnd: HWND) -> bool {
    GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_LAYERED != 0
}

/// Only the acrylic caption needs a per-pixel surface. Opaque and high-contrast captions
/// use the toolbar's normal GDI paints, including if the compositor cannot accept a frame.
pub(super) unsafe fn configure(hwnd: HWND, active: bool, ink: u32) -> Result<(), String> {
    if active && SetWindowSubclass(hwnd, Some(layer_proc), SUBCLASS, ink as usize) == 0 {
        return Err(os_error("初始化标题栏导航绘制失败"));
    }
    let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if active != (style & WS_EX_LAYERED != 0)
        && SetWindowLongW(hwnd, GWL_EXSTYLE, (style ^ WS_EX_LAYERED) as i32) == 0
    {
        return Err(os_error("设置标题栏导航合成方式失败"));
    }
    if !active {
        RemoveWindowSubclass(hwnd, Some(layer_proc), SUBCLASS);
    }
    InvalidateRect(hwnd, null(), 0);
    Ok(())
}

unsafe extern "system" fn layer_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    ink: usize,
) -> LRESULT {
    // Supply the first surface after showing the popup and reallocate it after a DPI resize.
    if msg == WM_SIZE || (msg == WM_SHOWWINDOW && wp != 0) {
        InvalidateRect(hwnd, null(), 0);
    }
    if msg != WM_PAINT || !enabled(hwnd) {
        return DefSubclassProc(hwnd, msg, wp, lp);
    }
    ValidateRect(hwnd, null());
    if !draw_layer(hwnd, ink as u32) {
        let _ = configure(hwnd, false, ink as u32);
    }
    0
}

// Alpha zero makes blank pixels click through to the window's drag area. One alpha unit
// keeps the entire native button target interactive without tinting its backdrop visibly.
fn premultiplied(mask: u8, ink: u32) -> u32 {
    let alpha = mask.max(1);
    let [red, green, blue, _] = ink.to_le_bytes();
    let channel = |v| ((u16::from(v) * u16::from(alpha) + 127) / 255) as u8;
    u32::from_le_bytes([channel(blue), channel(green), channel(red), alpha])
}

/// Print the standard toolbar into a 32-bit mask so native hot, pressed, checked and disabled
/// states retain the exact button geometry used by hit testing, tooltips and accessibility.
unsafe fn draw_layer(hwnd: HWND, ink: u32) -> bool {
    let mut rect = RECT::default();
    if GetClientRect(hwnd, &mut rect) == 0 {
        return false;
    }
    let size = SIZE {
        cx: rect.right,
        cy: rect.bottom,
    };
    if size.cx == 0 || size.cy == 0 {
        return true;
    }
    let dc = CreateCompatibleDC(null_mut());
    if dc.is_null() {
        return false;
    }
    let info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: size.cx,
            biHeight: -size.cy,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits = null_mut();
    let bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
    if bitmap.is_null() {
        DeleteDC(dc);
        return false;
    }
    let old = SelectObject(dc, bitmap);
    if old.is_null() {
        DeleteObject(bitmap);
        DeleteDC(dc);
        return false;
    }
    // WM_PRINTCLIENT normally paints every pixel; clear any space outside its reported clip.
    PatBlt(dc, 0, 0, size.cx, size.cy, BLACKNESS);
    SendMessageW(hwnd, WM_PRINTCLIENT, dc as usize, PRF_CLIENT as isize);
    // GDI batches its writes; finish them before reading the DIB from the CPU.
    GdiFlush();
    let pixels = slice::from_raw_parts_mut(bits.cast::<u32>(), size.cx as usize * size.cy as usize);
    for pixel in pixels {
        *pixel = premultiplied(*pixel as u8, ink);
    }
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    let drawn = UpdateLayeredWindow(
        hwnd,
        null_mut(),
        null(),
        &size,
        dc,
        &POINT::default(),
        0,
        &blend,
        ULW_ALPHA,
    );
    SelectObject(dc, old);
    DeleteObject(bitmap);
    DeleteDC(dc);
    drawn != 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::caption_navigation::{paint::custom_draw, BACK};
    use windows_sys::{core::w, Win32::UI::Controls::*};

    #[test]
    fn glass_retains_the_hit_target_and_composites_the_actual_foreground() {
        let ink = 0x204080;
        assert_eq!(premultiplied(0, ink), 0x01010000);
        assert_eq!(premultiplied(255, ink), 0xff804020);
        assert_eq!(premultiplied(102, ink), 0x66331a0d);
    }

    #[test]
    fn native_toolbar_prints_both_the_background_and_the_glyph_into_the_layer() {
        // Capture actual common-control notifications on a hidden window without an interactive desktop.
        unsafe extern "system" fn observe(
            hwnd: HWND,
            msg: u32,
            wp: WPARAM,
            lp: LPARAM,
            _: usize,
            data: usize,
        ) -> LRESULT {
            if msg == WM_NOTIFY && (*(lp as *const NMHDR)).code == NM_CUSTOMDRAW {
                let draw = &*(lp as *const NMCUSTOMDRAW);
                let result = custom_draw(draw, [0, 0xffffff]);
                if draw.dwDrawStage == CDDS_ITEMPREPAINT {
                    let rect = draw.rc;
                    let middle = (rect.top + rect.bottom) / 2;
                    *(data as *mut [u32; 2]) = [
                        GetPixel(draw.hdc, rect.left + 1, middle),
                        GetPixel(draw.hdc, (rect.left + rect.right) / 2, middle),
                    ];
                }
                return result;
            }
            DefSubclassProc(hwnd, msg, wp, lp)
        }
        unsafe {
            InitCommonControlsEx(&INITCOMMONCONTROLSEX {
                dwSize: size_of::<INITCOMMONCONTROLSEX>() as u32,
                dwICC: ICC_BAR_CLASSES,
            });
            let owner = CreateWindowExW(
                0,
                w!("STATIC"),
                null(),
                WS_POPUP,
                0,
                0,
                0,
                0,
                null_mut(),
                null_mut(),
                null_mut(),
                null(),
            );
            let toolbar = CreateWindowExW(
                WS_EX_TOOLWINDOW,
                TOOLBARCLASSNAMEW,
                null(),
                WS_POPUP | TBSTYLE_FLAT | CCS_NORESIZE as u32,
                0,
                0,
                32,
                32,
                owner,
                null_mut(),
                null_mut(),
                null(),
            );
            let mut pixels = [CLR_INVALID; 2];
            SetWindowSubclass(owner, Some(observe), SUBCLASS, (&raw mut pixels) as usize);
            SendMessageW(toolbar, TB_SETBUTTONSIZE, 0, 32 | 32 << 16);
            SendMessageW(toolbar, TB_BUTTONSTRUCTSIZE, size_of::<TBBUTTON>(), 0);
            SendMessageW(toolbar, TB_SETPARENT, owner as usize, 0);
            let button = TBBUTTON {
                iBitmap: I_IMAGENONE,
                idCommand: BACK as i32,
                fsState: TBSTATE_ENABLED as u8,
                ..Default::default()
            };
            SendMessageW(toolbar, TB_ADDBUTTONSW, 1, &raw const button as isize);
            let configured = configure(toolbar, true, 0xeeeeee);
            let mut samples = Vec::new();
            for state in [TBSTATE_ENABLED, TBSTATE_ENABLED | TBSTATE_CHECKED, 0] {
                pixels = [CLR_INVALID; 2];
                SendMessageW(toolbar, TB_SETSTATE, BACK, state as isize);
                SendMessageW(toolbar, WM_PAINT, 0, 0);
                samples.push(pixels);
            }
            let composed = enabled(toolbar);
            let restored = configure(toolbar, false, 0x222222).is_ok() && !enabled(toolbar);
            DestroyWindow(owner);
            assert!(configured.is_ok() && composed && restored);
            assert_eq!(
                samples,
                [[0, 0xffffff], [0x1e1e1e, 0xffffff], [0, 0x666666]]
            );
        }
    }
}
