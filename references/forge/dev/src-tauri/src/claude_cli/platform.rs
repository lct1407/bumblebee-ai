/// Convert a Windows path to WSL path.
/// Handles UNC paths (//wsl.localhost/..., //wsl$/...) and drive letters (C:\...).
pub(crate) fn to_wsl_path(path: &str) -> String {
    let path = path.trim_matches('"').replace('\\', "/");

    for prefix in &["//wsl.localhost/", "//wsl$/"] {
        if let Some(rest) = path.strip_prefix(prefix) {
            if let Some(pos) = rest.find('/') {
                return rest[pos..].to_string();
            }
        }
    }

    if path.starts_with('/') {
        return path;
    }

    if path.len() >= 2 && path.as_bytes()[1] == b':' {
        let drive = (path.as_bytes()[0] as char).to_ascii_lowercase();
        format!("/mnt/{}{}", drive, &path[2..])
    } else {
        path
    }
}
