#[cfg(windows)]
mod caption_navigation;
#[cfg(windows)]
mod island;
#[cfg(windows)]
mod window_chrome;

#[cfg(windows)]
#[doc(hidden)]
pub use island::surface::run_poc as run_island_poc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = island::install(builder);
    let mut context = tauri::generate_context!();
    if cfg!(windows) {
        // Both startup and tray recreation build the HWND and WebView2 controller from this config.
        if let Some(main) = context
            .config_mut()
            .app
            .windows
            .iter_mut()
            .find(|window| window.label == "main")
        {
            main.transparent = true;
        }
    }
    let app = builder
        .build(context)
        .expect("error while building tauri application");
    app.run(|_, _event| {
        #[cfg(windows)]
        if let tauri::RunEvent::ExitRequested {
            code: None, api, ..
        } = _event
        {
            // Destroying the last WebView releases the UI while the tray remains available.
            api.prevent_exit();
        }
    });
}
