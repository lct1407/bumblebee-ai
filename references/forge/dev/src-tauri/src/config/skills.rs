use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use super::{SkillDetail, SkillLibraryEntry, load_config, save_config};

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let filtered: Vec<u8> = input.bytes().filter(|b| !b" \t\n\r".contains(b)).collect();
    let mut out = Vec::with_capacity(filtered.len() * 3 / 4);
    let table = |c: u8| -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(format!("invalid base64 char: {}", c as char)),
        }
    };
    let mut i = 0;
    while i < filtered.len() {
        if filtered[i] == b'=' { break; }
        let a = table(filtered[i])?;
        let b = if i + 1 < filtered.len() && filtered[i + 1] != b'=' { table(filtered[i + 1])? } else { 0 };
        out.push((a << 2) | (b >> 4));
        if i + 2 >= filtered.len() || filtered[i + 2] == b'=' { break; }
        let c = table(filtered[i + 2])?;
        out.push((b << 4) | (c >> 2));
        if i + 3 >= filtered.len() || filtered[i + 3] == b'=' { break; }
        let d = table(filtered[i + 3])?;
        out.push((c << 6) | d);
        i += 4;
    }
    Ok(out)
}

fn skills_dir() -> PathBuf {
    let mut path = dirs_next::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("forge-dev");
    path.push("skills");
    fs::create_dir_all(&path).ok();
    path
}

pub fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        // Skip .git directories
        if name == ".git" {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn list_files_recursive(dir: &std::path::Path, prefix: &str) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = if prefix.is_empty() {
                entry.file_name().to_string_lossy().to_string()
            } else {
                format!("{}/{}", prefix, entry.file_name().to_string_lossy())
            };
            if path.is_dir() {
                files.extend(list_files_recursive(&path, &name));
            } else {
                files.push(name);
            }
        }
    }
    files
}

pub fn list_library_skills() -> HashMap<String, SkillLibraryEntry> {
    let config = load_config();
    config.skill_library.unwrap_or_default()
}

pub fn install_skill_from_git(git_url: String, subfolder: Option<String>) -> Result<SkillLibraryEntry, String> {
    // Clone to temp dir
    let temp_dir = std::env::temp_dir().join(format!("forge-skill-{}", std::process::id()));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }

    let output = std::process::Command::new("git")
        .args(["clone", "--depth", "1", &git_url, &temp_dir.to_string_lossy()])
        .output()
        .map_err(|e| format!("Failed to run git clone: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        fs::remove_dir_all(&temp_dir).ok();
        return Err(format!("git clone failed: {stderr}"));
    }

    // Determine skill source dir and name
    let source_dir = if let Some(ref sub) = subfolder {
        temp_dir.join(sub)
    } else {
        temp_dir.clone()
    };

    if !source_dir.exists() {
        fs::remove_dir_all(&temp_dir).ok();
        return Err(format!("Subfolder not found: {}", subfolder.unwrap_or_default()));
    }

    // Parse name from git URL or subfolder
    let name = if let Some(ref sub) = subfolder {
        sub.split('/').last().unwrap_or("skill").to_string()
    } else {
        git_url
            .trim_end_matches('/')
            .trim_end_matches(".git")
            .split('/')
            .last()
            .unwrap_or("skill")
            .to_string()
    };

    // Copy to skills dir
    let dest = skills_dir().join(&name);
    if dest.exists() {
        fs::remove_dir_all(&dest).ok();
    }
    copy_dir_recursive(&source_dir, &dest)?;

    // Clean up temp
    fs::remove_dir_all(&temp_dir).ok();

    // Read description from SKILL.md if present
    let description = fs::read_to_string(dest.join("SKILL.md"))
        .unwrap_or_default()
        .lines()
        .next()
        .unwrap_or("")
        .trim_start_matches('#')
        .trim()
        .to_string();

    let entry = SkillLibraryEntry {
        name: name.clone(),
        description,
        version: String::new(),
        git_url: Some(git_url),
        subfolder,
        source_path: dest.to_string_lossy().to_string(),
    };

    // Save to config
    let mut config = load_config();
    let library = config.skill_library.get_or_insert_with(HashMap::new);
    library.insert(name, entry.clone());
    save_config(&config)?;

    Ok(entry)
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
pub struct StrapiSkillFile {
    pub path: String,
    pub content: String,
    pub encoding: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrapiSkillData {
    pub name: String,
    pub description: String,
    pub version: String,
    pub skill_md: String,
    #[serde(default)]
    pub files: Vec<StrapiSkillFile>,
}

pub fn install_skill_from_strapi(data: StrapiSkillData) -> Result<SkillLibraryEntry, String> {
    let dest = skills_dir().join(&data.name);
    if dest.exists() {
        fs::remove_dir_all(&dest).ok();
    }
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    // Write SKILL.md
    fs::write(dest.join("SKILL.md"), &data.skill_md).map_err(|e| e.to_string())?;

    // Write bundled files
    for file in &data.files {
        let file_path = dest.join(&file.path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if file.encoding == "base64" {
            let bytes = decode_base64(&file.content)
                .map_err(|e| format!("base64 decode error for {}: {}", file.path, e))?;
            fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
        } else {
            fs::write(&file_path, &file.content).map_err(|e| e.to_string())?;
        }
    }

    let entry = SkillLibraryEntry {
        name: data.name.clone(),
        description: data.description,
        version: data.version,
        git_url: None,
        subfolder: None,
        source_path: dest.to_string_lossy().to_string(),
    };

    // Save to config
    let mut config = load_config();
    let library = config.skill_library.get_or_insert_with(HashMap::new);
    library.insert(data.name, entry.clone());
    save_config(&config)?;

    Ok(entry)
}

pub fn toggle_skill(repo_path: String, skill_name: String, enabled: bool) -> Result<(), String> {
    let mut config = load_config();
    let rel_path = format!(".claude/skills/{}", skill_name);

    if enabled {
        // Find skill in library
        let library = config.skill_library.as_ref().ok_or("No skills in library")?;
        let entry = library.get(&skill_name).ok_or(format!("Skill '{}' not found in library", skill_name))?;
        let source = PathBuf::from(&entry.source_path);
        // Clean destination first to remove stale files from previous versions
        super::wsl::rm_rf(&repo_path, &rel_path)?;
        super::wsl::copy_dir(&source, &repo_path, &rel_path)?;
    } else {
        super::wsl::rm_rf(&repo_path, &rel_path)?;
    }

    // Update project config enabled_skills
    for project in config.projects.values_mut() {
        if project.repo_path == repo_path {
            let skills = project.enabled_skills.get_or_insert_with(Vec::new);
            if enabled {
                if !skills.contains(&skill_name) {
                    skills.push(skill_name.clone());
                }
            } else {
                skills.retain(|s| s != &skill_name);
            }
            break;
        }
    }

    save_config(&config)
}

pub fn remove_library_skill(skill_name: String) -> Result<(), String> {
    let mut config = load_config();
    if let Some(library) = config.skill_library.as_mut() {
        if let Some(entry) = library.remove(&skill_name) {
            let path = PathBuf::from(&entry.source_path);
            if path.exists() {
                fs::remove_dir_all(&path).ok();
            }
        }
    }
    save_config(&config)
}

pub fn read_skill_detail(source_path: String, skill_name: String) -> Result<SkillDetail, String> {
    let dir = PathBuf::from(&source_path);
    if !dir.exists() {
        return Err(format!("Skill directory not found: {}", source_path));
    }

    let content = fs::read_to_string(dir.join("SKILL.md")).unwrap_or_default();
    let description = content
        .lines()
        .next()
        .unwrap_or("")
        .trim_start_matches('#')
        .trim()
        .to_string();

    let files = list_files_recursive(&dir, "");

    Ok(SkillDetail {
        name: skill_name,
        description,
        content,
        files,
    })
}
