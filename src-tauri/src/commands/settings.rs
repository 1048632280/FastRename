use crate::domain::app_error::{AppError, AppResult};
use crate::domain::settings::AppSettings;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn get_settings() -> AppResult<AppSettings> {
    let path = settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let contents =
        fs::read_to_string(&path).map_err(|error| AppError::io("读取设置失败", error))?;
    serde_json::from_str(&contents)
        .map_err(|error| AppError::new("settings_parse_failed", format!("解析设置失败：{error}")))
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> AppResult<()> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| AppError::io("创建设置目录失败", error))?;
    }

    let contents = serde_json::to_string_pretty(&settings).map_err(|error| {
        AppError::new(
            "settings_serialize_failed",
            format!("保存设置失败：{error}"),
        )
    })?;
    fs::write(&path, contents).map_err(|error| AppError::io("写入设置失败", error))
}

fn settings_path() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("FastRename").join("settings.json")
}
