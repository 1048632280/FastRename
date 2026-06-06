use serde::Serialize;
use std::path::PathBuf;
use std::time::SystemTime;

#[derive(Debug, Clone)]
pub struct RenameHistoryItem {
    pub directory: PathBuf,
    pub from_name: String,
    pub to_name: String,
    pub timestamp: SystemTime,
}

#[derive(Debug, Default)]
pub struct RenameHistory {
    items: Vec<RenameHistoryItem>,
}

impl RenameHistory {
    pub fn push(&mut self, item: RenameHistoryItem) {
        self.items.push(item);
    }

    pub fn pop(&mut self) -> Option<RenameHistoryItem> {
        self.items.pop()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoResult {
    pub changed: bool,
    pub from_full_name: String,
    pub restored_full_name: String,
    pub conflict_resolved: bool,
    pub message: Option<String>,
}

impl UndoResult {
    pub fn empty() -> Self {
        Self {
            changed: false,
            from_full_name: String::new(),
            restored_full_name: String::new(),
            conflict_resolved: false,
            message: Some("没有可撤销的重命名记录".to_string()),
        }
    }
}
