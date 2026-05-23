use super::{log, AgentSession, AgentStatus, Sessions, prune_sessions};
pub(crate) use super::platform::to_wsl_path;
use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

/// Default agent timeout: 30 minutes.
const AGENT_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// Resolve the claude binary path by checking common locations.
/// Caches result in a OnceLock for subsequent calls.
#[cfg(not(target_os = "windows"))]
fn resolve_claude_bin() -> &'static str {
    use std::sync::OnceLock;
    static CLAUDE_BIN: OnceLock<String> = OnceLock::new();
    CLAUDE_BIN.get_or_init(|| {
        // Try to resolve via NVM on the host (non-Windows)
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(output) = std::process::Command::new("bash")
                .args(["-lc", "which claude"])
                .output()
            {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        log(&format!("[resolve] claude binary: {path}"));
                        return path;
                    }
                }
            }
        }
        // Fallback: assume it's in PATH
        "claude".to_string()
    })
}

/// Build a tokio Command that spawns claude directly (no shell wrapper).
/// On Windows: writes a temp bash script and runs it via cmd→wsl.
/// On Linux/Mac: spawns claude binary directly with args.
/// Returns (Command, Option<temp_script_path>) — caller should clean up the script.
pub(crate) fn build_command(args: &[&str], repo_path: &str) -> Result<(Command, Option<std::path::PathBuf>), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let wsl_path = to_wsl_path(repo_path);
        // Build shell command for WSL — necessary because we need NVM + cd
        let claude_args: Vec<String> = args.iter().map(|a| {
            if a.contains(' ') || a.contains('"') || a.contains('\'') || a.contains('\n') {
                format!("'{}'", a.replace('\'', "'\\''"))
            } else {
                a.to_string()
            }
        }).collect();
        let shell_cmd = format!(
            "unset CLAUDECODE && export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\" && cd '{}' && claude {}",
            wsl_path, claude_args.join(" ")
        );

        let script_path = std::env::temp_dir().join(format!("forge-cmd-{}.sh", uuid::Uuid::new_v4()));
        std::fs::write(&script_path, &shell_cmd)
            .map_err(|e| format!("Failed to write temp script: {e}"))?;
        let wsl_script = to_wsl_path(&script_path.to_string_lossy());

        let wsl_distro = resolve_wsl_distro();
        let wsl_cmd = format!("wsl -d {} bash -l {}", wsl_distro, wsl_script);
        log(&format!("[cmd] {wsl_cmd}"));

        let mut std_cmd = std::process::Command::new("cmd");
        std_cmd.args(["/c", &wsl_cmd])
            .creation_flags(CREATE_NO_WINDOW);
        Ok((Command::from(std_cmd), Some(script_path)))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let claude_bin = resolve_claude_bin();
        log(&format!("[cmd] {} {} (cwd={})", claude_bin, args.join(" "), repo_path));
        let mut cmd = Command::new(claude_bin);
        cmd.args(args)
            .current_dir(repo_path);
        // Unset CLAUDECODE to avoid conflicts
        cmd.env_remove("CLAUDECODE");
        Ok((cmd, None))
    }
}

/// Resolve the default WSL distro name.
#[cfg(target_os = "windows")]
fn resolve_wsl_distro() -> String {
    use std::sync::OnceLock;
    static WSL_DISTRO: OnceLock<String> = OnceLock::new();
    WSL_DISTRO.get_or_init(|| {
        if let Ok(output) = std::process::Command::new("wsl")
            .args(["--list", "--quiet"])
            .output()
        {
            if output.status.success() {
                // wsl --list outputs UTF-16LE on Windows; decode accordingly
                let out = if output.stdout.len() >= 2 && output.stdout[0] == 0xFF && output.stdout[1] == 0xFE {
                    // Has BOM — skip it
                    let u16s: Vec<u16> = output.stdout[2..].chunks_exact(2)
                        .map(|c| u16::from_le_bytes([c[0], c[1]]))
                        .collect();
                    String::from_utf16_lossy(&u16s)
                } else if output.stdout.iter().any(|&b| b == 0) {
                    // No BOM but contains null bytes — likely UTF-16LE
                    let u16s: Vec<u16> = output.stdout.chunks_exact(2)
                        .map(|c| u16::from_le_bytes([c[0], c[1]]))
                        .collect();
                    String::from_utf16_lossy(&u16s)
                } else {
                    String::from_utf8_lossy(&output.stdout).into_owned()
                };
                // Find first non-empty, non-docker distro
                let distros: Vec<String> = out.lines()
                    .map(|l| l.trim().trim_start_matches('\u{feff}').to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                log(&format!("[wsl] available distros: {:?}", distros));
                if let Some(distro) = distros.iter().find(|d| !d.to_lowercase().contains("docker")) {
                    log(&format!("[wsl] detected distro: {distro}"));
                    return distro.clone();
                }
                if let Some(distro) = distros.first() {
                    log(&format!("[wsl] detected distro (docker): {distro}"));
                    return distro.clone();
                }
            }
        }
        log("[wsl] fallback to Ubuntu-24.04");
        "Ubuntu-24.04".to_string()
    }).clone()
}

/// Gracefully kill a child process: SIGTERM first, then SIGKILL after 5s.
pub(crate) async fn graceful_kill(child: &mut tokio::process::Child) {
    #[cfg(target_os = "windows")]
    {
        if let Some(pid) = child.id() {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }
        let _ = child.wait().await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        if let Some(pid) = child.id() {
            // Send SIGTERM to process group (negative PID)
            let pgid = Pid::from_raw(-(pid as i32));
            let _ = kill(pgid, Signal::SIGTERM);

            // Wait up to 5s for graceful exit
            let wait_result = tokio::time::timeout(
                Duration::from_secs(5),
                child.wait(),
            ).await;

            if wait_result.is_err() {
                // Timeout — force kill
                log(&format!("[kill] SIGTERM timeout, sending SIGKILL to pgid {}", pid));
                let _ = kill(pgid, Signal::SIGKILL);
                let _ = child.wait().await;
            }
        } else {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
    }
}

/// Spawn claude CLI, stream stdout as events, and handle completion.
/// `temp_mcp_config` is an optional path to a temp MCP config file to clean up on completion.
pub(crate) async fn spawn_and_stream(
    app: AppHandle,
    sessions: Sessions,
    args: &[&str],
    repo_path: &str,
    session_id: String,
    temp_mcp_config: Option<std::path::PathBuf>,
    worktree_path: Option<String>,
) -> Result<(), String> {
    let (mut cmd, temp_script) = build_command(args, repo_path)?;

    // Create new process group so we can kill the entire tree
    #[cfg(not(target_os = "windows"))]
    unsafe {
        cmd.pre_exec(|| {
            nix::unistd::setsid().map(|_| ()).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });
    }

    let mut child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            log(&format!("[spawn] Failed: {e}"));
            if let Some(ref p) = temp_script { let _ = std::fs::remove_file(p); }
            format!("Failed to spawn claude: {e}")
        })?;

    log(&format!("[spawn] OK session={session_id}"));

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    {
        let mut s = sessions.lock().await;
        s.insert(session_id.clone(), AgentSession {
            status: AgentStatus::Running,
            child: Some(child),
            claude_session_id: None,
            worktree_path,
        });
    }

    let sid2 = session_id.clone();
    let sessions_for_capture = sessions.clone();

    // Bounded channel for backpressure between stdout reader and event emitter
    let (tx, mut rx) = mpsc::channel::<Value>(100);

    let stderr_handle = tokio::spawn(async move {
        let mut err_output = String::new();
        let mut err_reader = BufReader::new(stderr);
        let _ = err_reader.read_to_string(&mut err_output).await;
        if !err_output.is_empty() {
            log(&format!("[stderr] {err_output}"));
        }
        err_output
    });

    // Stdout reader: parse JSONL and send to channel
    let stdout_reader = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut succeeded: Option<bool> = None;
        let mut captured_claude_session_id: Option<String> = None;

        while let Ok(Some(line)) = lines.next_line().await {
            log(&format!("[stdout] {}", line.chars().take(200).collect::<String>()));
            if let Ok(json) = serde_json::from_str::<Value>(&line) {
                // Capture claude session ID from the stream
                if captured_claude_session_id.is_none() {
                    if let Some(sid) = json.get("session_id").and_then(|v| v.as_str()) {
                        captured_claude_session_id = Some(sid.to_string());
                    }
                }

                if json.get("type").and_then(|t| t.as_str()) == Some("result") {
                    let is_error = json.get("is_error").and_then(|v| v.as_bool()).unwrap_or(true);
                    succeeded = Some(!is_error);
                }
                if tx.send(json).await.is_err() {
                    log("[stdout] event channel closed");
                    break;
                }
            }
        }

        // Store captured session ID
        if let Some(ref cid) = captured_claude_session_id {
            let mut s = sessions_for_capture.lock().await;
            if let Some(session) = s.get_mut(&sid2) {
                session.claude_session_id = Some(cid.clone());
            }
        }

        log("[stdout] stream ended");
        succeeded
    });

    // Event emitter: reads from channel, emits to Tauri frontend
    let app_emitter = app.clone();
    let sid_emitter = session_id.clone();
    let emitter_handle = tokio::spawn(async move {
        while let Some(json) = rx.recv().await {
            let r = app_emitter.emit("agent:message", serde_json::json!({
                "sessionId": sid_emitter,
                "data": json,
            }));
            log(&format!("[emit] agent:message -> {r:?}"));
        }
    });

    let sid_complete = session_id.clone();
    let sessions2 = sessions.clone();
    tokio::spawn(async move {
        // Wait for stdout with timeout
        let timed_result = tokio::time::timeout(AGENT_TIMEOUT, stdout_reader).await;

        let succeeded = match timed_result {
            Ok(Ok(s)) => s.unwrap_or(false),
            Ok(Err(_)) => false, // join error
            Err(_) => {
                // Timeout — kill the agent
                log(&format!("[timeout] session={sid_complete} exceeded {}s", AGENT_TIMEOUT.as_secs()));
                let mut s = sessions2.lock().await;
                if let Some(session) = s.get_mut(&sid_complete) {
                    if let Some(mut child) = session.child.take() {
                        graceful_kill(&mut child).await;
                    }
                }
                drop(s);
                false
            }
        };

        let _err_output = stderr_handle.await.unwrap_or_default();
        // Wait for emitter to flush
        let _ = emitter_handle.await;
        log(&format!("[complete] succeeded={succeeded}"));

        let mut s = sessions2.lock().await;
        if let Some(session) = s.get_mut(&sid_complete) {
            // Reap child process to avoid zombies
            if let Some(mut child) = session.child.take() {
                let _ = child.wait().await;
            }
            session.status = if succeeded {
                AgentStatus::Completed
            } else {
                AgentStatus::Failed
            };
        }
        drop(s);

        let error_msg = if succeeded { None } else {
            Some("Agent completed with errors".to_string())
        };

        let _ = app.emit("agent:complete", serde_json::json!({
            "sessionId": sid_complete,
            "error": error_msg,
        }));
        log("[emit] agent:complete");

        // Clean up temp files
        if let Some(p) = temp_script { let _ = std::fs::remove_file(p); }
        if let Some(p) = temp_mcp_config { let _ = std::fs::remove_file(p); }
        prune_sessions(&sessions2).await;
    });

    Ok(())
}
