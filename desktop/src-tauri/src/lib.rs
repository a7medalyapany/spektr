use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
};

use tauri::{Manager, WindowEvent};

struct DaemonState {
    child: Mutex<Option<Child>>,
}

#[derive(serde::Serialize)]
struct DaemonConfig {
    proxy_bin_path: String,
    proxy_port: u16,
    ws_port: u16,
    socket_path: String,
    db_path: String,
    log_level: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(DaemonState {
                child: Mutex::new(None),
            });

            match start_daemon() {
                Ok(child) => {
                    if let Some(state) = app.try_state::<DaemonState>() {
                        if let Ok(mut guard) = state.child.lock() {
                            *guard = Some(child);
                        }
                    }
                }
                Err(err) => {
                    eprintln!("failed to start spektr daemon: {err}");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                stop_daemon(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn start_daemon() -> Result<Child, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let binaries_dir = manifest_dir.join("binaries");
    let daemon_bin_path = binaries_dir.join("spektr");
    let proxy_bin_path = binaries_dir.join("spektr-proxy");

    ensure_executable(&daemon_bin_path)?;
    ensure_executable(&proxy_bin_path)?;

    let spektr_dir = home_dir()?.join(".spektr");
    let sessions_dir = spektr_dir.join("sessions");
    fs::create_dir_all(&sessions_dir)
        .map_err(|err| format!("create sessions dir {}: {err}", sessions_dir.display()))?;

    let config = DaemonConfig {
        proxy_bin_path: proxy_bin_path.to_string_lossy().into_owned(),
        proxy_port: 0,
        ws_port: 48300,
        socket_path: "/tmp/spektr.sock".to_string(),
        db_path: sessions_dir
            .join("dev.spektr")
            .to_string_lossy()
            .into_owned(),
        log_level: "debug".to_string(),
    };

    let mut child = Command::new(&daemon_bin_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("spawn daemon {}: {err}", daemon_bin_path.display()))?;

    let config_json =
        serde_json::to_vec(&config).map_err(|err| format!("encode daemon config: {err}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&config_json)
            .and_then(|_| stdin.write_all(b"\n"))
            .map_err(|err| format!("write daemon config: {err}"))?;
    } else {
        return Err("daemon stdin was not available".to_string());
    }

    pipe_child_output("spektr", "stdout", child.stdout.take());
    pipe_child_output("spektr", "stderr", child.stderr.take());

    Ok(child)
}

fn stop_daemon(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<DaemonState>() else {
        return;
    };
    let Ok(mut guard) = state.child.lock() else {
        return;
    };
    let Some(mut child) = guard.take() else {
        return;
    };

    terminate_child(&mut child);
    if let Err(err) = child.wait() {
        eprintln!("failed to wait for spektr daemon shutdown: {err}");
    }
}

#[cfg(unix)]
fn terminate_child(child: &mut Child) {
    if let Err(err) = Command::new("kill")
        .arg("-TERM")
        .arg(child.id().to_string())
        .status()
    {
        eprintln!("failed to send SIGTERM to spektr daemon: {err}");
    }
}

#[cfg(not(unix))]
fn terminate_child(child: &mut Child) {
    if let Err(err) = child.kill() {
        eprintln!("failed to stop spektr daemon: {err}");
    }
}

fn ensure_executable(path: &Path) -> Result<(), String> {
    if path.is_file() {
        Ok(())
    } else {
        Err(format!(
            "{} does not exist; run `make proxy-build` from the repo root",
            path.display()
        ))
    }
}

fn pipe_child_output(
    label: &'static str,
    stream_name: &'static str,
    stream: Option<impl std::io::Read + Send + 'static>,
) {
    let Some(stream) = stream else {
        return;
    };

    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(line) => eprintln!("[{label}:{stream_name}] {line}"),
                Err(err) => {
                    eprintln!("[{label}:{stream_name}] failed to read output: {err}");
                    break;
                }
            }
        }
    });
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME is not set".to_string())
}
