use std::process::Command;
use std::sync::Mutex;
use tauri::{
    ActivationPolicy, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt as AutoStart;

/// Find the user's node binary. Checks common locations.
fn find_node() -> String {
    // Common nvm paths (most common for dev setups)
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = vec![
        format!("{}/.nvm/versions/node/*/bin/node", home),
        "/opt/homebrew/bin/node".to_string(),
        "/usr/local/bin/node".to_string(),
        "/usr/bin/node".to_string(),
        "node".to_string(), // fallback to PATH
    ];

    for candidate in &candidates {
        if candidate.contains('*') {
            // Expand glob for nvm versions
            if let Ok(entries) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
                let mut versions: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .map(|e| e.path().join("bin/node").to_string_lossy().to_string())
                    .collect();
                versions.sort();
                if let Some(latest) = versions.last() {
                    return latest.clone();
                }
            }
        } else {
            if std::path::Path::new(candidate).exists() {
                return candidate.clone();
            }
        }
    }
    "node".to_string()
}

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

    if let Some(existing_pid) = *pid_lock {
        let _ = Command::new("kill").arg(existing_pid.to_string()).output();
        *pid_lock = None;
    }

    // Try bundled proxy (production)
    let resource_dir = app.path().resource_dir()
        .map_err(|_| "Cannot find resource directory".to_string())?;
    let bundled = resource_dir.join("proxy-bundle/dist/index.cjs");

    if bundled.exists() {
        // Kill any existing process on port 3456
        let _ = Command::new("sh")
            .args(["-c", "lsof -ti :3456 2>/dev/null | xargs kill -9 2>/dev/null"])
            .output();

        // Find node binary: prefer user's node, fall back to PATH
        let node_path = find_node();
        let current_path = std::env::var("PATH").unwrap_or_default();
        let full_path = if current_path.is_empty() {
            "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin".to_string()
        } else {
            current_path
        };

        let mut cmd = Command::new(&node_path);
        cmd.arg(&bundled);
        cmd.env("NODE_ENV", "production");
        cmd.env("PATH", &full_path);
        cmd.current_dir(resource_dir.join("proxy-bundle"));
        // Capture stderr for debugging
        cmd.stderr(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.current_dir(resource_dir.join("proxy-bundle"));
        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                // Log stderr in background
                if let Some(stderr) = child.stderr.take() {
                    std::thread::spawn(move || {
                        use std::io::Read;
                        let mut buf = String::new();
                        std::io::BufReader::new(stderr).read_to_string(&mut buf).ok();
                        if !buf.is_empty() {
                            eprintln!("[Proxy stderr]\n{}", buf);
                        }
                    });
                }
                *pid_lock = Some(pid);
                return Ok(pid);
            }
            Err(e) => return Err(format!("Failed to start proxy: {}. Make sure Node.js is installed.", e)),
        }
    }

    // Try project directory (dev mode)
    let cwd = std::env::current_dir().ok();
    if let Some(cwd) = cwd {
        let dev_src = cwd.join("packages/proxy/src/index.ts");
        if dev_src.exists() {
            let mut cmd = Command::new("npx");
            cmd.args(["tsx", &dev_src.to_string_lossy()]);
            cmd.current_dir(&cwd);
            cmd.env("NODE_ENV", "production");
            match cmd.spawn() {
                Ok(child) => {
                    let pid = child.id();
                    *pid_lock = Some(pid);
                    return Ok(pid);
                }
                Err(e) => eprintln!("[Proxy] Failed to spawn dev: {}", e),
            }
        }
    }

    Err("Cannot start proxy. Make sure Node.js is installed.".to_string())
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

            // Enable autostart on first launch
            let autostart = handle.autolaunch();
            let _ = autostart.enable();

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
                .show_menu_on_left_click(false)
                .on_menu_event(move |_app, event| {
                    match event.id().as_ref() {
                        "dashboard" => {
                            let _ = std::process::Command::new("open")
                                .arg("http://localhost:3457")
                                .spawn();
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
