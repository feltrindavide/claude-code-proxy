use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    Manager, RunEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt as AutoStart;

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

const PROXY_PORT: u16 = 3456;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(20);

/// Tracks the proxy child process for lifecycle management and cleanup.
struct ProxyState {
    child: Mutex<Option<Child>>,
}

impl ProxyState {
    fn stop_child(&self) {
        let mut guard = match self.child.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn tracked_pid(&self) -> Option<u32> {
        self.child
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|c| c.id()))
    }
}

impl Drop for ProxyState {
    fn drop(&mut self) {
        self.stop_child();
    }
}

fn kill_tracked_process(state: &ProxyState) {
    state.stop_child();
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

fn apply_clean_env(cmd: &mut Command, home: &str) {
    cmd.env_clear();
    cmd.env("HOME", home);
    cmd.env("NODE_ENV", "production");
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(lang) = std::env::var("LANG") {
        cmd.env("LANG", lang);
    }
}

fn wait_for_health(port: u16, timeout: Duration) -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let url = format!("http://127.0.0.1:{port}/health");
        if let Ok(resp) = client.get(&url).send() {
            if resp.status().is_success() {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

fn write_proxy_pid(home: &str, pid: u32) {
    let pid_dir = format!("{home}/.claude/claude-code-proxy");
    let _ = std::fs::create_dir_all(&pid_dir);
    let _ = std::fs::write(format!("{pid_dir}/proxy.pid"), pid.to_string());
}

fn read_autostart_pref() -> bool {
    let home = std::env::var("HOME").unwrap_or_default();
    let path = format!("{home}/.claude/claude-code-proxy/data/autostart.json");
    let Ok(content) = std::fs::read_to_string(&path) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .and_then(|v| v.get("enabled").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

fn read_admin_token_for_monitor() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let path = format!("{home}/.claude/claude-code-proxy/data/admin.token");
    std::fs::read_to_string(&path)
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
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

/// Start the Express proxy server and wait until /health succeeds.
fn spawn_proxy(app: &tauri::AppHandle) -> Result<u32, String> {
    let state = app.state::<ProxyState>();
    kill_tracked_process(&state);

    let home = std::env::var("HOME").map_err(|e| e.to_string())?;

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|_| "Cannot find resource directory".to_string())?;
    let bundled = resource_dir.join("proxy-bundle/dist/index.cjs");

    let mut child = if bundled.exists() {
        let node = find_node_binary().ok_or_else(|| {
            "Node.js not found. Install Node.js (nvm, homebrew, or system package).".to_string()
        })?;

        let proxy_bundle = resource_dir.join("proxy-bundle");
        let bundled_abs = bundled.to_string_lossy().to_string();

        let mut cmd = Command::new(node.to_string_lossy().as_ref());
        cmd.arg(&bundled_abs);
        cmd.current_dir(&proxy_bundle);
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::piped());
        apply_clean_env(&mut cmd, &home);

        cmd.spawn().map_err(|e| format!("Failed to start proxy: {e}"))?
    } else {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let dev_src = cwd.join("packages/proxy/src/index.ts");
        if !dev_src.exists() {
            return Err("Cannot start proxy. Make sure Node.js is installed.".to_string());
        }

        let mut cmd = Command::new("npx");
        cmd.args(["tsx", dev_src.to_string_lossy().as_ref()]);
        cmd.current_dir(&cwd);
        apply_clean_env(&mut cmd, &home);

        cmd.spawn()
            .map_err(|e| format!("Failed to start dev proxy: {e}"))?
    };

    let pid = child.id();
    write_proxy_pid(&home, pid);

    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = String::new();
            std::io::BufReader::new(stderr).read_to_string(&mut buf).ok();
            if !buf.is_empty() {
                eprintln!("[Proxy stderr]\n{buf}");
            }
        });
    }

    if !wait_for_health(PROXY_PORT, HEALTH_TIMEOUT) {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Proxy failed health check after spawn".to_string());
    }

    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok(pid)
}

fn spawn_watchdog(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(5));
            let crashed = {
                let state = app.state::<ProxyState>();
                let mut guard = match state.child.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };
                if let Some(child) = guard.as_mut() {
                    match child.try_wait() {
                        Ok(Some(_)) => {
                            guard.take();
                            true
                        }
                        Ok(None) => false,
                        Err(_) => {
                            guard.take();
                            true
                        }
                    }
                } else {
                    false
                }
            };

            if crashed {
                eprintln!("[Proxy] Watchdog: proxy exited unexpectedly, restarting…");
                if let Err(e) = spawn_proxy(&app) {
                    eprintln!("[Proxy] Watchdog restart failed: {e}");
                } else {
                    eprintln!("[Proxy] Watchdog: proxy restarted on port {PROXY_PORT}");
                }
            }
        }
    });
}

fn spawn_circuit_breaker_monitor(port: u16) {
    std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
        {
            Ok(c) => c,
            Err(_) => return,
        };
        let mut notified: std::collections::HashSet<String> = std::collections::HashSet::new();
        loop {
            std::thread::sleep(Duration::from_secs(15));
            let url = format!("http://127.0.0.1:{port}/admin/circuit-breakers");
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
                            &format!("Circuit breaker open for provider {provider}"),
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
        "port": PROXY_PORT,
        "pid": pid
    }))
}

#[tauri::command]
async fn stop_proxy(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<ProxyState>();
    let had_child = state.tracked_pid().is_some();
    kill_tracked_process(&state);

    if had_child {
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
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("http://127.0.0.1:{PROXY_PORT}/health");
    match client.get(&url).send() {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
            Ok(serde_json::json!({
                "running": true,
                "status": body.get("status").and_then(|s| s.as_str()).unwrap_or("unknown"),
                "port": body.get("port").and_then(|p| p.as_u64()).unwrap_or(PROXY_PORT as u64),
                "host": body.get("host").and_then(|h| h.as_str()).unwrap_or("127.0.0.1"),
                "version": body.get("version").and_then(|v| v.as_str()).unwrap_or("unknown")
            }))
        }
        _ => Ok(serde_json::json!({
            "running": false,
            "status": "stopped",
            "port": PROXY_PORT,
            "host": "127.0.0.1",
            "version": null
        })),
    }
}

#[tauri::command]
async fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<serde_json::Value, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let data_dir = format!("{home}/.claude/claude-code-proxy/data");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let path = format!("{data_dir}/autostart.json");
    std::fs::write(
        &path,
        serde_json::json!({ "enabled": enabled }).to_string(),
    )
    .map_err(|e| e.to_string())?;

    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }

    Ok(serde_json::json!({ "success": true, "enabled": enabled }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(ProxyState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_proxy,
            stop_proxy,
            get_proxy_status,
            set_autostart,
        ]);

    builder
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            let handle = app.handle().clone();

            if let Err(e) = spawn_proxy(&handle) {
                eprintln!("[Proxy] Failed to start proxy: {e}");
            } else {
                println!("[Proxy] Proxy started on port {PROXY_PORT}");
                spawn_circuit_breaker_monitor(PROXY_PORT);
                spawn_watchdog(handle.clone());
            }

            if read_autostart_pref() {
                if let Err(e) = handle.autolaunch().enable() {
                    eprintln!("[Autostart] Failed to enable: {e}");
                }
            }

            let icon = app
                .default_window_icon()
                .ok_or("Missing default window icon")?
                .clone();

            let dashboard = MenuItem::with_id(app, "dashboard", "Dashboard", true, None::<&str>)
                .map_err(|e| format!("Failed to create dashboard menu item: {e}"))?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))
                .map_err(|e| format!("Failed to create quit menu item: {e}"))?;
            let menu = Menu::with_items(app, &[&dashboard, &quit])
                .map_err(|e| format!("Failed to build tray menu: {e}"))?;

            let handle_menu = handle.clone();
            let handle_tray = handle.clone();
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("ClaudeCode Proxy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |_app, event| {
                    match event.id().as_ref() {
                        "dashboard" => open_url("http://localhost:3457"),
                        "quit" => {
                            let state = handle_menu.state::<ProxyState>();
                            kill_tracked_process(&state);
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
                .build(app)
                .map_err(|e| format!("Failed to build tray icon: {e}"))?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let state = app_handle.state::<ProxyState>();
                kill_tracked_process(&state);
            }
        });
}

fn toggle_window(app: &tauri::AppHandle, _tray: &tauri::tray::TrayIcon) {
    if let Some(window) = app.get_webview_window("popup") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_port_is_default() {
        assert_eq!(PROXY_PORT, 3456);
    }

    #[test]
    fn health_timeout_is_positive() {
        assert!(HEALTH_TIMEOUT.as_secs() > 0);
    }
}
