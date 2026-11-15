use std::{cell::Cell, mem::size_of};
use windows_sys::Win32::{
    Foundation::{HWND, POINT, RECT, SIZE},
    Graphics::{
        Dwm::{DwmGetWindowAttribute, DWMWA_CAPTION_BUTTON_BOUNDS},
        Gdi::{
            ClientToScreen, CreateFontIndirectW, DeleteObject, GetDC, GetTextExtentPoint32W,
            ReleaseDC, SelectObject,
        },
    },
    UI::{
        HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi, SystemParametersInfoForDpi},
        WindowsAndMessaging::*,
    },
};

pub(super) const BUTTON_SIZE: i32 = 32;

pub(super) struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub button_width: i32,
    pub gap: i32,
}

unsafe fn title_width(owner: HWND, dpi: u32) -> Option<i32> {
    let len = GetWindowTextLengthW(owner);
    let mut title = vec![0u16; len as usize + 1];
    let chars = GetWindowTextW(owner, title.as_mut_ptr(), len + 1);
    let mut metrics = NONCLIENTMETRICSW {
        cbSize: size_of::<NONCLIENTMETRICSW>() as u32,
        ..Default::default()
    };
    if SystemParametersInfoForDpi(
        SPI_GETNONCLIENTMETRICS,
        metrics.cbSize,
        (&raw mut metrics).cast(),
        0,
        dpi,
    ) == 0
    {
        return None;
    }
    let dc = GetDC(owner);
    if dc.is_null() {
        return None;
    }
    let font = CreateFontIndirectW(&metrics.lfCaptionFont);
    let previous = SelectObject(dc, font);
    let mut size = SIZE::default();
    let measured = GetTextExtentPoint32W(dc, title.as_ptr(), chars, &mut size);
    SelectObject(dc, previous);
    DeleteObject(font);
    ReleaseDC(owner, dc);
    (measured != 0).then_some(size.cx)
}

fn fit(left: i32, top: i32, right: i32, bottom: i32, button: i32, gap: i32) -> Option<Bounds> {
    let height = button.min(bottom - top);
    let width = 3 * button + 2 * gap;
    (height > 0 && right - left >= width).then_some(Bounds {
        x: left,
        y: top + (bottom - top - height) / 2,
        width,
        height,
        button_width: button,
        gap,
    })
}

pub(super) unsafe fn bounds(
    owner: HWND,
    cached_title: &Cell<Option<(u32, i32)>>,
) -> Option<Bounds> {
    if IsIconic(owner) != 0
        || IsWindowVisible(owner) == 0
        || GetWindowLongW(owner, GWL_STYLE) as u32 & WS_CAPTION != WS_CAPTION
    {
        return None;
    }
    let mut window = RECT::default();
    let mut client = POINT::default();
    if GetWindowRect(owner, &mut window) == 0 || ClientToScreen(owner, &mut client) == 0 {
        return None;
    }
    let dpi = GetDpiForWindow(owner);
    let px = |value: i32| (value * dpi as i32 + 48) / 96;
    let metric = |index| GetSystemMetricsForDpi(index, dpi);
    let title = match cached_title.get() {
        Some((measured_dpi, width)) if measured_dpi == dpi => width,
        _ => {
            let width = title_width(owner, dpi)?;
            cached_title.set(Some((dpi, width)));
            width
        }
    };
    let left = client.x + metric(SM_CXSMICON) + title + px(18);
    // Leave the frame's top resize band and the complete DWM system-button region to Windows.
    let top = window.top + metric(SM_CYSIZEFRAME) + metric(SM_CXPADDEDBORDER);
    let mut controls = RECT::default();
    let hr = DwmGetWindowAttribute(
        owner,
        DWMWA_CAPTION_BUTTON_BOUNDS as u32,
        (&raw mut controls).cast(),
        size_of::<RECT>() as u32,
    );
    let right = if hr >= 0 && controls.right > controls.left {
        window.left + controls.left
    } else {
        window.right - metric(SM_CXSIZE) * 3
    };
    fit(left, top, right - px(8), client.y, px(BUTTON_SIZE), px(3))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_all_controls_between_the_caption_title_and_system_buttons() {
        let bar = fit(-1400, -12, -1200, 23, 48, 5).unwrap();
        assert_eq!((bar.x, bar.y, bar.width, bar.height), (-1400, -12, 154, 35));
        assert!(fit(150, 8, 251, 31, 32, 3).is_none());
        assert!(fit(80, 8, 750, 0, 32, 3).is_none());
    }

    #[test]
    fn centers_square_buttons_in_a_tall_caption_and_counts_both_gaps() {
        let bar = fit(150, 8, 252, 48, 32, 3).unwrap();
        assert_eq!((bar.y, bar.height), (12, 32));
        assert_eq!((bar.button_width, bar.gap, bar.width), (32, 3, 102));
    }
}
