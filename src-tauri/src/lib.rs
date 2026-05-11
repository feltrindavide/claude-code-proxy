use std::process::Command;
use std::sync::Mutex;
use tauri::{
    ActivationPolicy, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

/// Global state to track the proxy child process PID
struct ProxyState {
    pid: Mutex<Option<u32>>,
}

impl Drop for ProxyState {
    fn drop(&mut self) {
        if let Ok(mut pid_lock) = self.pid.lock() {
            if let Some(pid) = pid_lock.take() {
                let _ = Command::new("kill").arg(pid.to_string()).output();
            }
        }
    }
}

/// Start the Express proxy server
fn spawn_proxy(app: &tauri::AppHandle) -> Result<u32, String> {
    let state = app.state::<ProxyState>();
    let mut pid_lock = state.pid.lock().map_err(|e| e.to_string())?;

    // Kill existing proxy if any
    if let Some(existing_pid) = *pid_lock {
        let _ = Command::new("kill").arg(existing_pid.to_string()).output();
        *pid_lock = None;
    }

    let app_dir = app.path()
        .resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    // Try node dist/index.js first (production), fall back to npx tsx (dev)
    let mut cmd = Command::new("node");
    cmd.args(["packages/proxy/dist/index.js"]);
    cmd.current_dir(&app_dir);
    cmd.env("NODE_ENV", "production");

    let child = cmd.spawn().or_else(|_| {
        // Fallback: try npx tsx
        let mut fallback = Command::new("npx");
        fallback.args(["tsx", "packages/proxy/src/index.ts"]);
        fallback.current_dir(&app_dir);
        fallback.env("NODE_ENV", "production");
        fallback.spawn()
    }).map_err(|e| format!("Failed to start proxy: {}", e))?;

    let pid = child.id();
    *pid_lock = Some(pid);
    Ok(pid)
}

#[tauri::command]
async fn start_proxy(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let pid = spawn_proxy(&app)?;
    Ok(serde_json::json!({
        "success": true,
        "port": 3456,
        "pid": pid
    }))
}

/// Stop the Express proxy server
#[tauri::command]
async fn stop_proxy(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<ProxyState>();
    let mut pid_lock = state.pid.lock().map_err(|e| e.to_string())?;

    if let Some(pid) = pid_lock.take() {
        let _ = Command::new("kill").arg(pid.to_string()).output();
        Ok(serde_json::json!({
            "success": true,
            "message": "Proxy stopped"
        }))
    } else {
        Ok(serde_json::json!({
            "success": false,
            "message": "Proxy is not running"
        }))
    }
}

/// Get the current proxy status by polling the health endpoint
#[tauri::command]
async fn get_proxy_status() -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get("http://localhost:3456/health").send() {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
            Ok(serde_json::json!({
                "running": true,
                "status": body.get("status").and_then(|s| s.as_str()).unwrap_or("unknown"),
                "port": body.get("port").and_then(|p| p.as_u64()).unwrap_or(3456),
                "version": body.get("version").and_then(|v| v.as_str()).unwrap_or("unknown")
            }))
        }
        _ => Ok(serde_json::json!({
            "running": false,
            "status": "stopped",
            "port": 3456,
            "version": null
        }))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![])))
        .manage(ProxyState {
            pid: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_proxy,
            stop_proxy,
            get_proxy_status,
        ])
        .setup(|app| {
            // Hide from dock (menu bar app style)
            app.set_activation_policy(ActivationPolicy::Accessory);

            // Auto-start proxy on launch
            let handle = app.handle().clone();
            if let Err(e) = spawn_proxy(&handle) {
                eprintln!("[Proxy] Failed to start proxy: {}", e);
            } else {
                println!("[Proxy] Proxy started on port 3456");
            }

            // Build tray menu
            let dashboard = MenuItem::with_id(app, "dashboard", "Dashboard", true, None::<&str>).unwrap();
            let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q")).unwrap();
            let menu = Menu::with_items(app, &[&dashboard, &quit]).unwrap();

            // Build tray icon with menu
            let handle = app.handle().clone();
            let handle_menu = handle.clone();
            let handle_tray = handle.clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("ClaudeCode Proxy")
                .menu(&menu)
                .on_menu_event(move |_app, event| {
                    match event.id().as_ref() {
                        "dashboard" => {
                            if let Some(window) = handle_menu.get_webview_window("popup") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            let state = handle_menu.state::<ProxyState>();
                            if let Ok(mut pid_lock) = state.pid.lock() {
                                if let Some(pid) = pid_lock.take() {
                                    let _ = Command::new("kill").arg(pid.to_string()).output();
                                }
                            }
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |tray, event| {
                    let tray_handle = tray.clone();
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(&handle_tray, &tray_handle);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

fn toggle_window(app: &tauri::AppHandle, _tray: &tauri::tray::TrayIcon) {
    if let Some(window) = app.get_webview_window("popup") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let cursor_pos = window.cursor_position().ok();
            let popup_pos = match cursor_pos {
                Some(c) => tauri::PhysicalPosition::new(
                    (c.x as i32 - 160).max(10),
                    30,
                ),
                None => tauri::PhysicalPosition::new(100, 30),
            };
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(350, 330)));
            let _ = window.set_position(tauri::Position::Physical(popup_pos));
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
