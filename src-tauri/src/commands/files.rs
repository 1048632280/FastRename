use crate::domain::app_error::{AppError, AppResult};
use crate::domain::file_entry::{split_full_name, FileEntry, ListFilesOptions};
use crate::platform::windows::file_flags;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[tauri::command]
pub fn list_files(directory: String, options: ListFilesOptions) -> AppResult<Vec<FileEntry>> {
    let directory_path = PathBuf::from(&directory);

    if !directory_path.is_dir() {
        return Err(AppError::new("invalid_directory", "请选择有效文件夹"));
    }

    let entries = fs::read_dir(&directory_path)
        .map_err(|error| AppError::io("读取文件夹失败", error))?;

    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| AppError::io("读取文件条目失败", error))?;
        let metadata = entry
            .metadata()
            .map_err(|error| AppError::io("读取文件信息失败", error))?;

        if !metadata.is_file() {
            continue;
        }

        let flags = file_flags(&metadata);
        if !options.show_hidden_and_system_files && (flags.is_hidden || flags.is_system) {
            continue;
        }

        let full_name = entry.file_name().to_string_lossy().to_string();
        let (stem, extension) = split_full_name(&full_name);
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or_default();

        files.push(FileEntry {
            id: entry.path().to_string_lossy().to_string(),
            directory: directory_path.to_string_lossy().to_string(),
            stem,
            extension,
            full_name,
            size_bytes: metadata.len(),
            modified_at,
            is_hidden: flags.is_hidden,
            is_system: flags.is_system,
        });
    }

    Ok(files)
}

#[tauri::command]
pub fn resolve_drop_target(paths: Vec<String>) -> AppResult<Option<String>> {
    for path in paths {
        let candidate = PathBuf::from(path);
        if candidate.is_dir() {
            return Ok(Some(candidate.to_string_lossy().to_string()));
        }

        if candidate.is_file() {
            if let Some(parent) = candidate.parent() {
                return Ok(Some(parent.to_string_lossy().to_string()));
            }
        }
    }

    Ok(None)
}

pub fn ensure_plain_file_name(name: &str) -> AppResult<()> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('\\')
        || name.contains('/')
    {
        return Err(AppError::new("invalid_file_name", "文件名不合法"));
    }

    let path = Path::new(name);
    if path.file_name().and_then(|value| value.to_str()) != Some(name) {
        return Err(AppError::new("invalid_file_name", "文件名不合法"));
    }

    Ok(())
}
