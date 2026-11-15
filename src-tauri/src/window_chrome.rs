use std::mem::size_of;
use tauri::WebviewWindow;
use windows_sys::Win32::{
    Foundation::{DWM_E_COMPOSITIONDISABLED, E_INVALIDARG, E_NOTIMPL, HWND},
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_COLOR_DEFAULT,
        DWMWA_TEXT_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE,
    },
    Graphics::Gdi::{GetSysColor, COLOR_ACTIVECAPTION, COLOR_CAPTIONTEXT},
    UI::{
        Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW},
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

fn frame_attributes(dark: bool, colors: [u32; 3], system_colors: bool) -> [(i32, u32); 4] {
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
        (DWMWA_CAPTION_COLOR, background),
        (DWMWA_TEXT_COLOR, foreground),
        (DWMWA_BORDER_COLOR, border),
    ]
}

/// Win32 controls and their subclass data are created, updated and released on the HWND's thread.
pub(super) async fn on_main_window(
    window: WebviewWindow,
    action: impl FnOnce(WebviewWindow, HWND) -> Result<(), String> + Send + 'static,
) -> Result<(), String> {
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
#[tauri::command]
pub(crate) async fn set_main_window_chrome(
    window: WebviewWindow,
    dark: bool,
    background: String,
    foreground: String,
    border: String,
) -> Result<(), String> {
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
        for (attribute, value) in frame_attributes(dark, colors, system) {
            let hr = unsafe {
                DwmSetWindowAttribute(
                    hwnd,
                    attribute as u32,
                    (&raw const value).cast(),
                    size_of::<u32>() as u32,
                )
            };
            if hr >= 0 && !system {
                match attribute {
                    DWMWA_CAPTION_COLOR => palette[0] = value,
                    DWMWA_TEXT_COLOR => palette[1] = value,
                    _ => {}
                }
            }
            // Windows versions can support immersive mode without supporting explicit frame colors.
            if hr < 0 && !matches!(hr, E_INVALIDARG | E_NOTIMPL | DWM_E_COMPOSITIONDISABLED) {
                error = Some(format!(
                    "设置原生窗口属性 {attribute} 失败（HRESULT {hr:#010x}）"
                ));
            }
        }
        crate::caption_navigation::set_colors(window, hwnd, palette)?;
        error.map_or(Ok(()), Err)
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
            frame_attributes(true, colors, true).map(|(_, value)| value),
            [
                0,
                DWMWA_COLOR_DEFAULT,
                DWMWA_COLOR_DEFAULT,
                DWMWA_COLOR_DEFAULT
            ]
        );
        assert_eq!(
            frame_attributes(true, colors, false).map(|(_, value)| value),
            [1, colors[0], colors[1], colors[2]]
        );
    }
}
