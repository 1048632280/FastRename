use super::app_error::{AppError, AppResult};

const ILLEGAL_CHARS: [char; 9] = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
    "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
    "LPT9",
];

pub fn validate_windows_stem(stem: &str) -> AppResult<()> {
    if stem.is_empty() || stem.trim().is_empty() {
        return Err(AppError::new("empty_name", "文件名不能为空"));
    }

    if let Some(ch) = stem.chars().find(|ch| ILLEGAL_CHARS.contains(ch)) {
        return Err(AppError::new(
            "illegal_character",
            format!("文件名不能包含字符 {ch}"),
        ));
    }

    if stem.ends_with(' ') || stem.ends_with('.') {
        return Err(AppError::new(
            "invalid_suffix",
            "文件名末尾不能是空格或点号",
        ));
    }

    let device_name = stem
        .split('.')
        .next()
        .unwrap_or(stem)
        .trim_end()
        .to_ascii_uppercase();

    if RESERVED_NAMES.contains(&device_name.as_str()) {
        return Err(AppError::new(
            "reserved_name",
            format!("{device_name} 是 Windows 保留名称"),
        ));
    }

    Ok(())
}

pub fn windows_key(name: &str) -> String {
    name.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::validate_windows_stem;

    #[test]
    fn rejects_empty_names() {
        assert!(validate_windows_stem("").is_err());
        assert!(validate_windows_stem("   ").is_err());
    }

    #[test]
    fn rejects_illegal_characters() {
        assert!(validate_windows_stem("a:b").is_err());
        assert!(validate_windows_stem("a?b").is_err());
    }

    #[test]
    fn rejects_trailing_space_or_dot() {
        assert!(validate_windows_stem("name ").is_err());
        assert!(validate_windows_stem("name.").is_err());
    }

    #[test]
    fn rejects_reserved_names() {
        assert!(validate_windows_stem("CON").is_err());
        assert!(validate_windows_stem("con.backup").is_err());
        assert!(validate_windows_stem("LPT1").is_err());
    }

    #[test]
    fn accepts_regular_names() {
        assert!(validate_windows_stem("测试报告").is_ok());
        assert!(validate_windows_stem("Report 2026").is_ok());
    }
}
