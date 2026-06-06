use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub directory: String,
    pub stem: String,
    pub extension: String,
    pub full_name: String,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub is_hidden: bool,
    pub is_system: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFilesOptions {
    pub show_hidden_and_system_files: bool,
}

pub fn compose_full_name(stem: &str, extension: &str) -> String {
    if extension.is_empty() {
        stem.to_string()
    } else {
        format!("{stem}.{extension}")
    }
}

pub fn split_full_name(full_name: &str) -> (String, String) {
    let path = std::path::Path::new(full_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(full_name)
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();

    (stem, extension)
}
