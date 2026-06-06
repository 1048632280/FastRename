use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub show_hidden_and_system_files: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            show_hidden_and_system_files: false,
        }
    }
}
