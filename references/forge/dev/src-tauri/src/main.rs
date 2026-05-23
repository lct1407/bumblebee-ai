#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod claude_cli;
mod config;
mod websocket;

use claude_cli::{new_sessions, Sessions, WorktreeInfo};
use claude_cli::worktree::BranchDiff;
use config::{AppConfig, SessionData, SessionMeta, McpServerConfig, SkillLibraryEntry, SkillDetail, StrapiSkillData};
use tauri::State;
use std::sync::Arc;
use tokio::sync::{watch, Mutex as TokioMutex};

struct AppState {
    sessions: Sessions,
    ws_cancel: Arc<TokioMutex<Option<watch::Sender<bool>>>>,
}

#[tauri::command]
async fn connect_ws(app: tauri::AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    // Cancel previous WS connection if any
    let mut guard = state.ws_cancel.lock().await;
    if let Some(old_tx) = guard.take() {
        let _ = old_tx.send(true);
    }
    let (tx, rx) = watch::channel(false);
    *guard = Some(tx);
    drop(guard);
    tokio::spawn(websocket::connect_ws(app, url, rx));
    Ok(())
}

#[tauri::command]
async fn run_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_path: String,
    prompt: String,
    project_slug: Option<String>,
    permission_mode: Option<String>,
    mcp_servers: Option<serde_json::Value>,
    worktree_branch: Option<String>,
) -> Result<String, String> {
    claude_cli::run_agent(app, state.sessions.clone(), repo_path, prompt, project_slug, permission_mode, mcp_servers, worktree_branch).await
}

#[tauri::command]
async fn abort_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    claude_cli::abort_agent(app, state.sessions.clone(), &session_id).await
}

#[tauri::command]
async fn get_agent_status(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<claude_cli::AgentStatus, String> {
    claude_cli::get_status(state.sessions.clone(), &session_id).await
}

#[tauri::command]
async fn get_claude_session_id(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<String>, String> {
    claude_cli::get_claude_session_id(state.sessions.clone(), &session_id).await
}

#[tauri::command]
async fn open_terminal(
    repo_path: String,
    system_prompt: Option<String>,
    claude_session_id: Option<String>,
) -> Result<(), String> {
    claude_cli::open_terminal(repo_path, system_prompt, claude_session_id).await
}

#[tauri::command]
async fn send_chat(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_path: String,
    message: String,
    session_id: String,
    claude_session_id: Option<String>,
    project_slug: Option<String>,
    permission_mode: Option<String>,
    mcp_servers: Option<serde_json::Value>,
    worktree_branch: Option<String>,
) -> Result<(), String> {
    claude_cli::send_chat(app, state.sessions.clone(), repo_path, message, session_id, claude_session_id, project_slug, permission_mode, mcp_servers, worktree_branch).await
}

#[tauri::command]
async fn index_codebase(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo_path: String,
    branch: String,
) -> Result<String, String> {
    claude_cli::index_codebase(app, state.sessions.clone(), repo_path, branch).await
}

#[tauri::command]
async fn start_session(
    repo_path: String,
    branch_name: String,
    selected_issues: Vec<claude_cli::SelectedIssue>,
    selected_tasks: Vec<claude_cli::SelectedTask>,
    forge_url: String,
    forge_token: String,
    project_slug: String,
) -> Result<(), String> {
    claude_cli::start_session(repo_path, branch_name, selected_issues, selected_tasks, forge_url, forge_token, project_slug).await
}

#[tauri::command]
fn fe_log(msg: String) {
    claude_cli::log_pub(&msg);
}

#[tauri::command]
fn get_config() -> AppConfig {
    config::load_config()
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    config::save_config(&config)
}

#[tauri::command]
fn list_sessions(slug: Option<String>) -> Vec<SessionMeta> {
    config::list_sessions(slug)
}

#[tauri::command]
fn save_session_cmd(data: SessionData) -> Result<(), String> {
    config::save_session(&data)
}

#[tauri::command]
fn load_session(id: String) -> Result<SessionData, String> {
    config::load_session(&id)
}

#[tauri::command]
fn delete_session(id: String) -> Result<(), String> {
    config::delete_session(&id)
}

#[tauri::command]
fn detect_mcp_servers(repo_path: String) -> std::collections::HashMap<String, McpServerConfig> {
    config::detect_mcp_servers(&repo_path)
}

#[tauri::command]
fn read_knowledge_index(repo_path: String) -> Option<serde_json::Value> {
    config::read_knowledge_index(&repo_path)
}

#[tauri::command]
fn install_mcp_to_cli(name: String, server: McpServerConfig, repo_path: String) -> Result<(), String> {
    config::install_mcp_to_cli(&name, &server, &repo_path)
}

#[tauri::command]
fn list_library_skills() -> std::collections::HashMap<String, SkillLibraryEntry> {
    config::list_library_skills()
}

#[tauri::command]
fn install_skill_from_git(git_url: String, subfolder: Option<String>) -> Result<SkillLibraryEntry, String> {
    config::install_skill_from_git(git_url, subfolder)
}

#[tauri::command]
fn install_skill_from_strapi(data: StrapiSkillData) -> Result<SkillLibraryEntry, String> {
    config::install_skill_from_strapi(data)
}

#[tauri::command]
fn toggle_skill(repo_path: String, skill_name: String, enabled: bool) -> Result<(), String> {
    config::toggle_skill(repo_path, skill_name, enabled)
}

#[tauri::command]
fn remove_library_skill(skill_name: String) -> Result<(), String> {
    config::remove_library_skill(skill_name)
}

#[tauri::command]
fn read_skill_detail(source_path: String, skill_name: String) -> Result<SkillDetail, String> {
    config::read_skill_detail(source_path, skill_name)
}

#[tauri::command]
fn list_library_mcp() -> std::collections::HashMap<String, McpServerConfig> {
    config::list_library_mcp()
}

#[tauri::command]
fn add_library_mcp(name: String, mcp_config: McpServerConfig) -> Result<(), String> {
    config::add_library_mcp(name, mcp_config)
}

#[tauri::command]
fn remove_library_mcp(name: String) -> Result<(), String> {
    config::remove_library_mcp(name)
}

#[tauri::command]
fn toggle_mcp(project_slug: String, name: String, enabled: bool) -> Result<(), String> {
    config::toggle_mcp(project_slug, name, enabled)
}

#[tauri::command]
async fn create_worktree(repo_path: String, branch_name: String) -> Result<String, String> {
    claude_cli::worktree::create_worktree(&repo_path, &branch_name).await
}

#[tauri::command]
async fn remove_worktree(repo_path: String, branch_name: String) -> Result<(), String> {
    claude_cli::worktree::remove_worktree(&repo_path, &branch_name).await
}

#[tauri::command]
async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    claude_cli::worktree::list_worktrees(&repo_path).await
}

#[tauri::command]
async fn cleanup_merged_worktrees(repo_path: String, main_branch: String) -> Result<Vec<String>, String> {
    claude_cli::worktree::cleanup_merged_worktrees(&repo_path, &main_branch).await
}

#[tauri::command]
async fn get_branch_diff(repo_path: String, branch: String, base: String) -> Result<BranchDiff, String> {
    claude_cli::worktree::get_branch_diff(&repo_path, &branch, &base).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        // .plugin(tauri_plugin_updater::Builder::new().build()) // TODO: enable when update server is configured
        .manage(AppState {
            sessions: new_sessions(),
            ws_cancel: Arc::new(TokioMutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            connect_ws,
            run_agent,
            abort_agent,
            get_agent_status,
            get_claude_session_id,
            open_terminal,
            send_chat,
            index_codebase,
            start_session,
            fe_log,
            get_config,
            save_config,
            list_sessions,
            save_session_cmd,
            load_session,
            delete_session,
            detect_mcp_servers,
            read_knowledge_index,
            install_mcp_to_cli,
            list_library_skills,
            install_skill_from_git,
            install_skill_from_strapi,
            toggle_skill,
            remove_library_skill,
            read_skill_detail,
            list_library_mcp,
            add_library_mcp,
            remove_library_mcp,
            toggle_mcp,
            create_worktree,
            remove_worktree,
            list_worktrees,
            cleanup_merged_worktrees,
            get_branch_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
