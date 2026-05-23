use std::collections::HashMap;

use super::{McpServerConfig, load_config, save_config};

pub fn detect_mcp_servers(repo_path: &str) -> HashMap<String, McpServerConfig> {
    let mut servers = HashMap::new();
    let candidates = [
        (".claude.json", "mcpServers"),
        (".mcp.json", "mcpServers"),
        ("claude_desktop_config.json", "mcpServers"),
    ];

    for (filename, key) in &candidates {
        let data = super::wsl::read_file(repo_path, filename);
        if let Some(data) = data {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(mcp_obj) = parsed.get(key).and_then(|v| v.as_object()) {
                    for (name, val) in mcp_obj {
                        if !servers.contains_key(name) {
                            if let Ok(cfg) = serde_json::from_value::<McpServerConfig>(val.clone()) {
                                servers.insert(name.clone(), cfg);
                            }
                        }
                    }
                }
            }
        }
    }

    servers
}

pub fn read_knowledge_index(repo_path: &str) -> Option<serde_json::Value> {
    let data = super::wsl::read_file(repo_path, ".forge/knowledge.json")?;
    serde_json::from_str(&data).ok()
}

pub fn install_mcp_to_cli(name: &str, server: &McpServerConfig, repo_path: &str) -> Result<(), String> {
    let existing = super::wsl::read_file(repo_path, ".mcp.json").unwrap_or_default();
    let mut root: serde_json::Value = if existing.is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&existing).unwrap_or(serde_json::json!({}))
    };

    let mcp_servers = root
        .as_object_mut()
        .ok_or("Invalid .mcp.json format")?
        .entry("mcpServers")
        .or_insert(serde_json::json!({}));

    let server_val = serde_json::to_value(server).map_err(|e| e.to_string())?;
    mcp_servers
        .as_object_mut()
        .ok_or("mcpServers is not an object")?
        .insert(name.to_string(), server_val);

    let json = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    super::wsl::write_file(repo_path, ".mcp.json", &json)
}

pub fn list_library_mcp() -> HashMap<String, McpServerConfig> {
    let config = load_config();
    config.mcp_library.unwrap_or_default()
}

pub fn add_library_mcp(name: String, mcp_config: McpServerConfig) -> Result<(), String> {
    let mut config = load_config();
    let library = config.mcp_library.get_or_insert_with(HashMap::new);
    library.insert(name, mcp_config);
    save_config(&config)
}

pub fn remove_library_mcp(name: String) -> Result<(), String> {
    let mut config = load_config();
    if let Some(library) = config.mcp_library.as_mut() {
        library.remove(&name);
    }
    save_config(&config)
}

pub fn toggle_mcp(project_slug: String, name: String, enabled: bool) -> Result<(), String> {
    let mut config = load_config();
    if let Some(project) = config.projects.get_mut(&project_slug) {
        let servers = project.enabled_mcp_servers.get_or_insert_with(Vec::new);
        if enabled {
            if !servers.contains(&name) {
                servers.push(name);
            }
        } else {
            servers.retain(|s| s != &name);
        }
        save_config(&config)
    } else {
        Err(format!("Project '{}' not found", project_slug))
    }
}
