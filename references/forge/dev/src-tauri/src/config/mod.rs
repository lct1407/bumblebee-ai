use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

mod sessions;
mod mcp;
mod skills;
pub(crate) mod wsl;

// Re-export public items from submodules
pub use sessions::{SessionMeta, SessionData, list_sessions, save_session, load_session, delete_session};
pub use mcp::{detect_mcp_servers, read_knowledge_index, install_mcp_to_cli, list_library_mcp, add_library_mcp, remove_library_mcp, toggle_mcp};
pub use skills::{list_library_skills, install_skill_from_git, install_skill_from_strapi, StrapiSkillData, toggle_skill, remove_library_skill, read_skill_detail};

// ── Skill & MCP library structs ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillLibraryEntry {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subfolder: Option<String>,
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    pub name: String,
    pub description: String,
    pub content: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    // Local stdio server
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    // Remote HTTP server
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub server_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    // Common
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoConfig {
    pub name: String,
    pub path: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub slug: String,
    pub repo_path: String,
    pub branch: Option<String>,
    pub instructions: Option<String>,
    pub repos: Option<Vec<RepoConfig>>,
    pub mcp_servers: Option<HashMap<String, McpServerConfig>>,
    #[serde(default)]
    pub enabled_skills: Option<Vec<String>>,
    #[serde(default)]
    pub enabled_mcp_servers: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub strapi_url: String,
    pub auth_token: String,
    pub projects: HashMap<String, ProjectConfig>,
    #[serde(default)]
    pub skill_library: Option<HashMap<String, SkillLibraryEntry>>,
    #[serde(default)]
    pub mcp_library: Option<HashMap<String, McpServerConfig>>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            strapi_url: "http://localhost:1337".to_string(),
            auth_token: String::new(),
            projects: HashMap::new(),
            skill_library: None,
            mcp_library: None,
        }
    }
}

fn config_path() -> PathBuf {
    let mut path = dirs_next::config_dir().unwrap_or_else(|| {
        eprintln!("[config] WARNING: config_dir() returned None, falling back to current directory");
        PathBuf::from(".")
    });
    path.push("forge-dev");
    fs::create_dir_all(&path).ok();
    path.push("config.json");
    path
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}
