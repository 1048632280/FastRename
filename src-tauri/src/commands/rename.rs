use super::files::ensure_plain_file_name;
use crate::domain::app_error::{AppError, AppResult};
use crate::domain::file_entry::{compose_full_name, split_full_name};
use crate::domain::rename_history::{RenameHistoryItem, UndoResult};
use crate::domain::validation::{validate_windows_stem, windows_key};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRequest {
    pub directory: String,
    pub old_full_name: String,
    pub desired_stem: String,
    pub extension: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub old_full_name: String,
    pub new_full_name: String,
    pub final_stem: String,
    pub extension: String,
    pub conflict_resolved: bool,
    pub warning: Option<String>,
}

#[tauri::command]
pub fn rename_file(
    request: RenameRequest,
    state: State<'_, AppState>,
) -> AppResult<RenameResult> {
    let directory = PathBuf::from(&request.directory);
    if !directory.is_dir() {
        return Err(AppError::new("invalid_directory", "目标文件夹不存在"));
    }

    ensure_plain_file_name(&request.old_full_name)?;
    let old_path = directory.join(&request.old_full_name);
    if !old_path.is_file() {
        return Err(AppError::new("missing_file", "原文件不存在，请刷新列表"));
    }

    validate_windows_stem(&request.desired_stem)?;

    let (old_stem, original_extension) = split_full_name(&request.old_full_name);
    let requested_extension = request.extension;
    let extension = original_extension;
    let target_full_name = compose_full_name(&request.desired_stem, &extension);

    if target_full_name == request.old_full_name {
        return Ok(RenameResult {
            old_full_name: request.old_full_name,
            new_full_name: target_full_name,
            final_stem: old_stem,
            extension,
            conflict_resolved: false,
            warning: None,
        });
    }

    let existing = collect_file_names(&directory)?;
    let old_key = windows_key(&request.old_full_name);
    let (new_full_name, conflict_resolved) =
        next_available_name(&request.desired_stem, &extension, &existing, Some(&old_key));
    let new_path = directory.join(&new_full_name);

    rename_path(&old_path, &new_path).map_err(|error| AppError::io("重命名失败", error))?;

    let mut history = state
        .history
        .lock()
        .map_err(|_| AppError::new("history_lock_failed", "撤销历史不可用"))?;
    history.push(RenameHistoryItem {
        directory,
        from_name: request.old_full_name.clone(),
        to_name: new_full_name.clone(),
        timestamp: SystemTime::now(),
    });

    let (final_stem, _) = split_full_name(&new_full_name);
    let warning = if conflict_resolved {
        Some(format!("目标重名，已自动保存为 {new_full_name}"))
    } else if requested_extension != extension {
        Some("扩展名由后端按原文件保护，未采用前端传入值".to_string())
    } else {
        None
    };

    Ok(RenameResult {
        old_full_name: request.old_full_name,
        new_full_name,
        final_stem,
        extension,
        conflict_resolved,
        warning,
    })
}

#[tauri::command]
pub fn undo_last_rename(state: State<'_, AppState>) -> AppResult<UndoResult> {
    let item = {
        let mut history = state
            .history
            .lock()
            .map_err(|_| AppError::new("history_lock_failed", "撤销历史不可用"))?;
        history.pop()
    };

    let Some(item) = item else {
        return Ok(UndoResult::empty());
    };

    let current_path = item.directory.join(&item.to_name);
    if !current_path.is_file() {
        return Ok(UndoResult {
            changed: false,
            from_full_name: item.to_name,
            restored_full_name: String::new(),
            conflict_resolved: false,
            message: Some("撤销失败：目标文件已不存在".to_string()),
        });
    }

    let (restore_stem, restore_extension) = split_full_name(&item.from_name);
    let existing = collect_file_names(&item.directory)?;
    let current_key = windows_key(&item.to_name);
    let (restored_full_name, conflict_resolved) =
        next_available_name(&restore_stem, &restore_extension, &existing, Some(&current_key));
    let restored_path = item.directory.join(&restored_full_name);

    rename_path(&current_path, &restored_path)
        .map_err(|error| AppError::io("撤销重命名失败", error))?;

    let message = if conflict_resolved {
        Some(format!("原文件名已被占用，已恢复为 {restored_full_name}"))
    } else {
        Some(format!("已撤销重命名，恢复为 {restored_full_name}"))
    };

    Ok(UndoResult {
        changed: true,
        from_full_name: item.to_name,
        restored_full_name,
        conflict_resolved,
        message,
    })
}

fn collect_file_names(directory: &Path) -> AppResult<HashSet<String>> {
    let entries = fs::read_dir(directory).map_err(|error| AppError::io("读取文件夹失败", error))?;
    let mut names = HashSet::new();

    for entry in entries {
        let entry = entry.map_err(|error| AppError::io("读取文件条目失败", error))?;
        let metadata = entry
            .metadata()
            .map_err(|error| AppError::io("读取文件信息失败", error))?;

        if metadata.is_file() {
            names.insert(windows_key(&entry.file_name().to_string_lossy()));
        }
    }

    Ok(names)
}

fn next_available_name(
    desired_stem: &str,
    extension: &str,
    existing: &HashSet<String>,
    excluded_key: Option<&str>,
) -> (String, bool) {
    let first = compose_full_name(desired_stem, extension);
    let first_key = windows_key(&first);

    if !existing.contains(&first_key) || excluded_key == Some(first_key.as_str()) {
        return (first, false);
    }

    for index in 1.. {
        let candidate = compose_full_name(&format!("{desired_stem}({index})"), extension);
        let key = windows_key(&candidate);
        if !existing.contains(&key) || excluded_key == Some(key.as_str()) {
            return (candidate, true);
        }
    }

    unreachable!("numbered rename candidates are unbounded")
}

fn rename_path(from: &Path, to: &Path) -> std::io::Result<()> {
    if windows_key(&from.to_string_lossy()) == windows_key(&to.to_string_lossy())
        && from.to_string_lossy() != to.to_string_lossy()
    {
        let temp_path = temporary_sibling_path(from);
        fs::rename(from, &temp_path)?;
        match fs::rename(&temp_path, to) {
            Ok(()) => Ok(()),
            Err(error) => {
                let _ = fs::rename(&temp_path, from);
                Err(error)
            }
        }
    } else {
        fs::rename(from, to)
    }
}

fn temporary_sibling_path(path: &Path) -> PathBuf {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("fastrename");

    for index in 0.. {
        let candidate = directory.join(format!(
            ".__fastrename_case_tmp_{}_{}_{}",
            std::process::id(),
            index,
            file_name
        ));
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("temporary rename candidates are unbounded")
}

#[cfg(test)]
mod tests {
    use super::next_available_name;
    use crate::domain::validation::windows_key;
    use std::collections::HashSet;

    fn names(values: &[&str]) -> HashSet<String> {
        values.iter().map(|value| windows_key(value)).collect()
    }

    #[test]
    fn keeps_available_name() {
        let existing = names(&["其他.txt"]);
        let (name, conflict) = next_available_name("测试报告", "txt", &existing, None);

        assert_eq!(name, "测试报告.txt");
        assert!(!conflict);
    }

    #[test]
    fn appends_number_for_conflict() {
        let existing = names(&["测试报告.txt", "测试报告(1).txt"]);
        let (name, conflict) = next_available_name("测试报告", "txt", &existing, None);

        assert_eq!(name, "测试报告(2).txt");
        assert!(conflict);
    }

    #[test]
    fn excludes_current_file_from_conflict() {
        let existing = names(&["Report.txt"]);
        let old_key = windows_key("Report.txt");
        let (name, conflict) = next_available_name("report", "txt", &existing, Some(&old_key));

        assert_eq!(name, "report.txt");
        assert!(!conflict);
    }
}
