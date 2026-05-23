use super::{log, AgentStatus, Sessions};
use super::mcp::write_mcp_config;
use super::spawn::{graceful_kill, spawn_and_stream};
use super::worktree;
#[cfg(target_os = "windows")]
use super::spawn::to_wsl_path;
use crate::config;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Build the base CLI args and optionally resolve MCP config.
fn base_args(permission_mode: Option<&str>) -> Vec<&str> {
    let mode = permission_mode.unwrap_or("bypassPermissions");
    vec![
        "--output-format", "stream-json", "--verbose",
        "--permission-mode", mode,
    ]
}

/// Resolve MCP servers into a temp config file and return (config_path_string, original_path).
/// Always includes the built-in Forge MCP server with the given project slug.
fn resolve_mcp_config(project_slug: &str, mcp_servers: Option<&Value>) -> Result<(Option<String>, Option<std::path::PathBuf>), String> {
    let cfg = config::load_config();
    let path = write_mcp_config(&cfg.strapi_url, &cfg.auth_token, project_slug, mcp_servers)?;
    let path_str = {
        #[cfg(target_os = "windows")]
        { to_wsl_path(&path.to_string_lossy()) }
        #[cfg(not(target_os = "windows"))]
        { path.to_string_lossy().to_string() }
    };
    Ok((Some(path_str), Some(path)))
}

/// Resolve the effective repo path: if a worktree branch is given, create/reuse a worktree.
async fn resolve_worktree(repo_path: &str, worktree_branch: Option<&str>) -> Result<(String, Option<String>), String> {
    if let Some(branch) = worktree_branch {
        let wt_path = worktree::create_worktree(repo_path, branch).await?;
        Ok((wt_path.clone(), Some(wt_path)))
    } else {
        Ok((repo_path.to_string(), None))
    }
}

pub async fn run_agent(
    app: AppHandle,
    sessions: Sessions,
    repo_path: String,
    prompt: String,
    project_slug: Option<String>,
    permission_mode: Option<String>,
    mcp_servers: Option<Value>,
    worktree_branch: Option<String>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    log(&format!("[run_agent] repo_path={repo_path} slug={project_slug:?} worktree_branch={worktree_branch:?}"));

    let (effective_repo, wt_path) = resolve_worktree(&repo_path, worktree_branch.as_deref()).await?;

    let mut args = base_args(permission_mode.as_deref());
    let slug = project_slug.as_deref().unwrap_or("");
    let (mcp_path_str, mcp_temp_path) = resolve_mcp_config(slug, mcp_servers.as_ref())?;
    if let Some(ref p) = mcp_path_str {
        args.push("--mcp-config");
        args.push(p);
    }
    args.push("-p");
    args.push(&prompt);

    spawn_and_stream(app, sessions, &args, &effective_repo, session_id.clone(), mcp_temp_path, wt_path).await?;
    Ok(session_id)
}

pub async fn send_chat(
    app: AppHandle,
    sessions: Sessions,
    repo_path: String,
    message: String,
    session_id: String,
    claude_session_id: Option<String>,
    project_slug: Option<String>,
    permission_mode: Option<String>,
    mcp_servers: Option<Value>,
    worktree_branch: Option<String>,
) -> Result<(), String> {
    log(&format!("[send_chat] session={session_id}, slug={project_slug:?} worktree_branch={worktree_branch:?}"));

    let (effective_repo, wt_path) = resolve_worktree(&repo_path, worktree_branch.as_deref()).await?;

    let mut args = base_args(permission_mode.as_deref());
    let slug = project_slug.as_deref().unwrap_or("");
    let (mcp_path_str, mcp_temp_path) = resolve_mcp_config(slug, mcp_servers.as_ref())?;
    if let Some(ref p) = mcp_path_str {
        args.push("--mcp-config");
        args.push(p);
    }
    if let Some(ref cid) = claude_session_id {
        args.push("--resume");
        args.push(cid);
    }
    args.push("-p");
    args.push(&message);

    spawn_and_stream(app, sessions, &args, &effective_repo, session_id, mcp_temp_path, wt_path).await
}

pub async fn abort_agent(app: AppHandle, sessions: Sessions, session_id: &str) -> Result<(), String> {
    let mut s = sessions.lock().await;
    if let Some(session) = s.get_mut(session_id) {
        if let Some(mut child) = session.child.take() {
            graceful_kill(&mut child).await;
        }
        session.status = AgentStatus::Failed;
        let _ = app.emit("agent:complete", serde_json::json!({
            "sessionId": session_id,
            "error": Some("Agent aborted by user"),
        }));
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn get_status(sessions: Sessions, session_id: &str) -> Result<AgentStatus, String> {
    let s = sessions.lock().await;
    s.get(session_id)
        .map(|sess| sess.status.clone())
        .ok_or_else(|| "Session not found".to_string())
}

pub async fn get_claude_session_id(sessions: Sessions, session_id: &str) -> Result<Option<String>, String> {
    let s = sessions.lock().await;
    s.get(session_id)
        .map(|sess| sess.claude_session_id.clone())
        .ok_or_else(|| "Session not found".to_string())
}

pub async fn index_codebase(
    app: AppHandle,
    sessions: Sessions,
    repo_path: String,
    branch: String,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    log(&format!("[index_codebase] repo={repo_path} branch={branch}"));

    let prompt = format!(
        r#"Analyze this codebase and generate two outputs. First run `git checkout {branch}` (if it fails due to uncommitted changes, stash first with `git stash`, then checkout).

== OUTPUT 1: .forge/knowledge.json ==

Create .forge/knowledge.json with this compact structure:
{{
  "project": "One-line description",
  "architecture": "Brief data-flow summary: how components connect",
  "paths": {{
    "api": "backend/src/api/{{name}}/",
    "frontend": "frontend/src/features/{{domain}}/",
    "types": "frontend/src/lib/types.ts"
  }},
  "domains": {{
    "payroll": ["payroll-run", "payslip", "salary-component", "salary-structure"],
    "leave": ["leave-request", "leave-balance", "leave-policy", "leave-type"],
    "domain-name": ["resource-1", "resource-2"]
  }},
  "conventions": {{ "naming": "...", "api": "...", "state": "..." }},
  "recipes": {{
    "new-endpoint": "step-by-step",
    "new-page": "step-by-step"
  }},
  "commands": {{ "dev": "...", "build": "...", "test": "..." }}
}}

Rules for knowledge.json:
- "paths" defines path templates. The agent constructs full paths by substituting resource names.
- "domains" groups EVERY resource/content-type/API into logical domains. Do not skip any — scan all directories. Each domain lists its resource names (matching the directory names in the API path template).
- Do NOT list individual files. Only directory-level patterns.
- "recipes" should be actionable step-by-step instructions for common tasks.
- Create the .forge directory if it doesn't exist.
- If .forge/lessons.md exists, read it. Validate each lesson against the current codebase. Merge still-valid lessons into the appropriate field (conventions, recipes, or a new field). Discard stale or incorrect ones. After merging, clear .forge/lessons.md (write an empty file).

== OUTPUT 2: CLAUDE.md files ==

Create a CLAUDE.md file at the repo root AND in each major package/app directory.
Each CLAUDE.md should be 20-40 lines with these sections:

# <Package Name>
<One-line description>
## Architecture
<Key directories and what they contain — no individual file listings>
## Key Patterns
<3-5 bullet points: state management, API patterns, naming conventions>
## Recipes
<How to add a new endpoint, page, component, etc. — actionable steps>
## Commands
<dev, build, test commands>

Rules for CLAUDE.md:
- Keep each file under 40 lines. No file listings.
- Focus on what an engineer needs to start contributing.
- The root CLAUDE.md should describe how packages relate to each other.
- Only create CLAUDE.md in directories that are distinct packages (have their own package.json or Cargo.toml).
- Do NOT overwrite an existing CLAUDE.md — skip it if one already exists.

Read package.json, entry points, config files, and src/ structure to understand the codebase."#,
        branch = branch
    );

    let mut args = base_args(Some("bypassPermissions"));
    args.push("-p");
    args.push(&prompt);

    spawn_and_stream(app, sessions, &args, &repo_path, session_id.clone(), None, None).await?;

    Ok(session_id)
}
