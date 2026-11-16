mod accent;

use std::mem::size_of;
use tauri::WebviewWindow;
use windows::UI::ViewManagement::UISettings;
use windows_sys::Win32::{
    Foundation::{DWM_E_COMPOSITIONDISABLED, E_INVALIDARG, E_NOTIMPL, HWND},
    Graphics::Dwm::{
        DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMSBT_NONE, DWMWA_BORDER_COLOR,
        DWMWA_CAPTION_COLOR, DWMWA_COLOR_DEFAULT, DWMWA_COLOR_NONE, DWMWA_SYSTEMBACKDROP_TYPE,
        DWMWA_TEXT_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE,
    },
    Graphics::Gdi::{GetSysColor, COLOR_ACTIVECAPTION, COLOR_CAPTIONTEXT},
    UI::{
        Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW},
        Controls::MARGINS,
        WindowsAndMessaging::{SystemParametersInfoW, SPI_GETHIGHCONTRAST},
    },
};

fn colorref(value: &str) -> Result<u32, &'static str> {
    let invalid = "窗口颜色必须是 #RRGGBB";
    let hex = value.strip_prefix('#').ok_or(invalid)?;
    if hex.len() != 6 || !hex.bytes().all(|digit| digit.is_ascii_hexdigit()) {
        return Err(invalid);
    }
    let rgb = u32::from_str_radix(hex, 16).map_err(|_| invalid)?;
    let [_, red, green, blue] = rgb.to_be_bytes();
    Ok(u32::from_le_bytes([red, green, blue, 0]))
}

fn needs_system_colors() -> bool {
    let mut contrast = HIGHCONTRASTW {
        cbSize: size_of::<HIGHCONTRASTW>() as u32,
        ..Default::default()
    };
    let read = unsafe {
        SystemParametersInfoW(
            SPI_GETHIGHCONTRAST,
            contrast.cbSize,
            (&raw mut contrast).cast(),
            0,
        )
    };
    // Preserve accessibility colors if Windows cannot report the current setting.
    read == 0 || contrast.dwFlags & HCF_HIGHCONTRASTON != 0
}

fn frame_attributes(
    dark: bool,
    colors: [u32; 3],
    system_colors: bool,
    caption_translucent: bool,
) -> [(i32, u32); 4] {
    let [background, foreground, border] = if system_colors {
        [DWMWA_COLOR_DEFAULT; 3]
    } else {
        colors
    };
    [
        (
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            u32::from(dark && !system_colors),
        ),
        // An explicit caption fill would cover the system backdrop.
        (
            DWMWA_CAPTION_COLOR,
            if caption_translucent {
                DWMWA_COLOR_NONE
            } else {
                background
            },
        ),
        (DWMWA_TEXT_COLOR, foreground),
        (DWMWA_BORDER_COLOR, border),
    ]
}

fn extend_frame(hwnd: HWND, extend: bool) -> bool {
    let margins = MARGINS {
        cxLeftWidth: if extend { -1 } else { 0 },
        ..Default::default()
    };
    unsafe { DwmExtendFrameIntoClientArea(hwnd, &margins) >= 0 }
}

fn apply_attribute(hwnd: HWND, attribute: i32, value: u32, error: &mut Option<String>) -> bool {
    let hr = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute as u32,
            (&raw const value).cast(),
            size_of::<u32>() as u32,
        )
    };
    // Windows versions can support immersive mode without supporting explicit frame colors.
    if hr < 0 && !matches!(hr, E_INVALIDARG | E_NOTIMPL | DWM_E_COMPOSITIONDISABLED) {
        *error = Some(format!(
            "设置原生窗口属性 {attribute} 失败（HRESULT {hr:#010x}）"
        ));
    }
    hr >= 0
}

/// Win32 controls and their subclass data are created, updated and released on the HWND's thread.
pub(super) async fn on_main_window<T: Send + 'static>(
    window: WebviewWindow,
    action: impl FnOnce(WebviewWindow, HWND) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    if window.label() != "main" {
        return Err("当前窗口无权执行该操作".into());
    }
    let (send, mut receive) = tauri::async_runtime::channel(1);
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let result = target
                .hwnd()
                .map_err(|e| e.to_string())
                .and_then(|hwnd| action(target, hwnd.0));
            let _ = send.try_send(result);
        })
        .map_err(|e| e.to_string())?;
    receive.recv().await.ok_or("主窗口已关闭")?
}

/// The caller supplies resolved CSS colors after applying its theme, including on WebView rebuild.
/// Only expose the WebView canvas after DWM has installed a client backdrop on this HWND.
/// Zero transparency restores solid chrome. All other percentages tint the entire HWND once.
#[tauri::command]
pub(crate) async fn set_main_window_chrome(
    window: WebviewWindow,
    dark: bool,
    background: String,
    foreground: String,
    border: String,
    transparency_percent: u8,
) -> Result<bool, String> {
    if transparency_percent > 100 {
        return Err("窗口透明度必须介于 0 和 100 之间".into());
    }
    let colors = [
        colorref(&background)?,
        colorref(&foreground)?,
        colorref(&border)?,
    ];
    on_main_window(window, move |window, hwnd| {
        let system = needs_system_colors();
        let mut palette = unsafe {
            [
                GetSysColor(COLOR_ACTIVECAPTION),
                GetSysColor(COLOR_CAPTIONTEXT),
            ]
        };
        let mut error = None;
        // The system transient backdrop changes recipe when deactivated and owns its tint.
        // An explicit window accent lets both the caption and the extended client use our color.
        apply_attribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            DWMSBT_NONE as u32,
            &mut error,
        );
        let stable_appearance = accent::keep_active_appearance(hwnd, !system);
        let requested = transparency_percent > 0
            && !system
            && stable_appearance
            && UISettings::new()
                .and_then(|settings| settings.AdvancedEffectsEnabled())
                .unwrap_or(false);
        let mut clear_caption = false;
        for (attribute, value) in frame_attributes(dark, colors, system, requested) {
            if apply_attribute(hwnd, attribute, value, &mut error) && !system {
                // GDI requires actual colors even when the caption delegates its fill to DWM.
                match attribute {
                    DWMWA_CAPTION_COLOR => {
                        clear_caption = requested;
                        palette[0] = colors[0];
                    }
                    DWMWA_TEXT_COLOR => palette[1] = colors[1],
                    _ => {}
                }
            }
        }
        if error.is_none()
            && clear_caption
            && extend_frame(hwnd, true)
            && accent::tint(hwnd, colors[0], transparency_percent)
        {
            match crate::caption_navigation::set_colors(window.clone(), hwnd, palette, true) {
                Ok(()) => return Ok(true),
                Err(failure) => error = Some(failure),
            }
        }
        // Restore both halves before reporting an unsupported attribute or a partial toolbar failure.
        accent::tint(hwnd, colors[0], 0);
        extend_frame(hwnd, false);
        if requested && apply_attribute(hwnd, DWMWA_CAPTION_COLOR, colors[0], &mut error) {
            palette[0] = colors[0];
        }
        crate::caption_navigation::set_colors(window, hwnd, palette, false)?;
        error.map_or(Ok(false), Err)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_css_hex_colors_and_converts_to_colorref() {
        assert_eq!(colorref("#5AB3e8"), Ok(0x00e8b35a));
        for value in ["#123", "123456", "#+01020", "#12345678", "#乱12A"] {
            assert!(colorref(value).is_err());
        }
    }

    #[test]
    fn contrast_mode_resets_previous_frame_colors_to_system_defaults() {
        let colors = [0x222222, 0xffffff, 0x333333];
        assert_eq!(
            frame_attributes(true, colors, true, false).map(|(_, value)| value),
            [
                0,
                DWMWA_COLOR_DEFAULT,
                DWMWA_COLOR_DEFAULT,
                DWMWA_COLOR_DEFAULT
            ]
        );
        assert_eq!(
            frame_attributes(true, colors, false, false).map(|(_, value)| value),
            [1, colors[0], colors[1], colors[2]]
        );
        assert_eq!(
            frame_attributes(true, colors, false, true).map(|(_, value)| value),
            [1, DWMWA_COLOR_NONE, colors[1], colors[2]]
        );
    }
}
