use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt as AutoStart;

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

/// Global state to track the proxy child process PID
struct ProxyState {
    pid: Mutex<Option<u32>>,
}

impl Drop for ProxyState {
    fn drop(&mut self) {
        if let Ok(mut pid_lock) = self.pid.lock() {
            if let Some(pid) = pid_lock.take() {
                let _ = kill_process(pid);
            }
        }
    }
}

fn kill_process(pid: u32) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        Command::new("kill").arg(pid.to_string()).output().map(|_| ())
    }
    #[cfg(not(unix))]
    {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .map(|_| ())
    }
}

fn kill_port(port: u16) {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("sh")
            .args([
                "-c",
                &format!(
                    "lsof -ti :{port} 2>/dev/null | xargs kill -9 2>/dev/null"
                ),
            ])
            .output();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("sh")
            .args([
                "-c",
                &format!(
                    "fuser -k {port}/tcp 2>/dev/null || lsof -ti :{port} 2>/dev/null | xargs -r kill -9 2>/dev/null"
                ),
            ])
            .output();
    }
}

fn open_url(url: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(url).spawn();
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = url;
    }
}

fn find_node_binary() -> Option<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        if let Ok(entries) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
            let mut versions: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .collect();
            versions.sort_by_key(|e| e.file_name());
            if let Some(latest) = versions.last() {
                let node = latest.path().join("bin/node");
                if node.exists() {
                    return Some(node);
                }
            }
        }

        for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
            let p = PathBuf::from(candidate);
            if p.exists() {
                return Some(p);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for candidate in ["/usr/bin/node", "/usr/local/bin/node"] {
            let p = PathBuf::from(candidate);
            if p.exists() {
                return Some(p);
            }
        }

        if let Ok(output) = Command::new("sh")
            .args(["-c", "command -v node"])
            .output()
        {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                let p = PathBuf::from(&path);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

/// Start the Express proxy server
fn spawn_proxy(app: &tauri::AppHandle) -> Result<u32, String> {
    let state = app.state::<ProxyState>();
    let mut pid_lock = state.pid.lock().map_err(|e| e.to_string())?;

    if let Some(existing_pid) = *pid_lock {
        let _ = kill_process(existing_pid);
        *pid_lock = None;
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|_| "Cannot find resource directory".to_string())?;
    let bundled = resource_dir.join("proxy-bundle/dist/index.cjs");

    if bundled.exists() {
        kill_port(3456);

        let node = find_node_binary().ok_or_else(|| {
            "Node.js not found. Install Node.js (nvm, homebrew, or system package).".to_string()
        })?;

        let proxy_bundle = resource_dir.join("proxy-bundle");
        let bundled_abs = bundled.to_string_lossy().to_string();
        let home = std::env::var("HOME").unwrap_or_default();

        let mut cmd = Command::new(node.to_string_lossy().as_ref());
        cmd.arg(&bundled_abs);
        cmd.env("NODE_ENV", "production");
        cmd.current_dir(&proxy_bundle);
        cmd.stderr(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::null());

        let pid_dir = format!("{}/.claude/claude-code-proxy", home);
        let _ = std::fs::create_dir_all(&pid_dir);

        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                let _ = std::fs::write(format!("{}/proxy.pid", pid_dir), pid.to_string());
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
            Err(e) => {
                return Err(format!(
                    "Failed to start proxy: {}. Make sure Node.js is installed.",
                    e
                ));
            }
        }
    }

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
fn get_admin_token() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let path = format!("{}/.claude/claude-code-proxy/data/admin.token", home);
    std::fs::read_to_string(&path)
        .map(|s| s.trim().to_string())
        .map_err(|e| e.to_string())
}

fn notify_desktop(title: &str, message: &str) {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "display notification \"{}\" with title \"{}\"",
            message.replace('"', "\\\""),
            title.replace('"', "\\\"")
        );
        let _ = Command::new("osascript").args(["-e", &script]).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("notify-send").args([title, message]).spawn();
    }
}

fn read_admin_token_for_monitor() -> String {
    get_admin_token().unwrap_or_default()
}

fn spawn_circuit_breaker_monitor(port: u16) {
    std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
        {
            Ok(c) => c,
            Err(_) => return,
        };
        let mut notified: std::collections::HashSet<String> = std::collections::HashSet::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(15));
            let url = format!("http://127.0.0.1:{}/admin/circuit-breakers", port);
            let token = read_admin_token_for_monitor();
            if token.is_empty() {
                continue;
            }
            let Ok(resp) = client
                .get(&url)
                .header("X-Admin-Token", token)
                .send()
            else {
                continue;
            };
            if !resp.status().is_success() {
                continue;
            }
            let Ok(body) = resp.json::<serde_json::Value>() else {
                continue;
            };
            if let Some(arr) = body.get("circuitBreakers").and_then(|v| v.as_array()) {
                for item in arr {
                    let provider = item.get("provider").and_then(|v| v.as_str()).unwrap_or("");
                    let state = item.get("state").and_then(|v| v.as_str()).unwrap_or("");
                    if state == "open" && !provider.is_empty() && !notified.contains(provider) {
                        notified.insert(provider.to_string());
                        notify_desktop(
                            "ClaudeCode Proxy",
                            &format!("Circuit breaker open for provider {}", provider),
                        );
                    }
                    if state == "closed" {
                        notified.remove(provider);
                    }
                }
            }
        }
    });
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

#[tauri::command]
async fn stop_proxy(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<ProxyState>();
    let mut pid_lock = state.pid.lock().map_err(|e| e.to_string())?;

    if let Some(pid) = pid_lock.take() {
        let _ = kill_process(pid);
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
                "host": body.get("host").and_then(|h| h.as_str()).unwrap_or("127.0.0.1"),
                "version": body.get("version").and_then(|v| v.as_str()).unwrap_or("unknown")
            }))
        }
        _ => Ok(serde_json::json!({
            "running": false,
            "status": "stopped",
            "port": 3456,
            "host": "127.0.0.1",
            "version": null
        })),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(ProxyState {
            pid: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_proxy,
            stop_proxy,
            get_proxy_status,
            get_admin_token,
        ]);

    builder
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            if let Err(e) = spawn_proxy(&handle) {
                eprintln!("[Proxy] Failed to start proxy: {}", e);
            } else {
                println!("[Proxy] Proxy started on port 3456");
                spawn_circuit_breaker_monitor(3456);
            }

            let autostart = handle.autolaunch();
            let _ = autostart.enable();

            let dashboard =
                MenuItem::with_id(app, "dashboard", "Dashboard", true, None::<&str>).unwrap();
            let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q")).unwrap();
            let menu = Menu::with_items(app, &[&dashboard, &quit]).unwrap();

            let handle_menu = handle.clone();
            let handle_tray = handle.clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("ClaudeCode Proxy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |_app, event| {
                    match event.id().as_ref() {
                        "dashboard" => open_url("http://localhost:3457"),
                        "quit" => {
                            let state = handle_menu.state::<ProxyState>();
                            if let Ok(mut pid_lock) = state.pid.lock() {
                                if let Some(pid) = pid_lock.take() {
                                    let _ = kill_process(pid);
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
                Some(c) => tauri::PhysicalPosition::new((c.x as i32 - 240).max(10), 30),
                None => tauri::PhysicalPosition::new(100, 30),
            };
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(480, 180)));
            let _ = window.set_position(tauri::Position::Physical(popup_pos));
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
