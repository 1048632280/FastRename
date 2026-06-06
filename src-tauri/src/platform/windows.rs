use std::fs::Metadata;

#[derive(Debug, Clone, Copy)]
pub struct FileFlags {
    pub is_hidden: bool,
    pub is_system: bool,
}

#[cfg(windows)]
pub fn file_flags(metadata: &Metadata) -> FileFlags {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;

    let attributes = metadata.file_attributes();

    FileFlags {
        is_hidden: attributes & FILE_ATTRIBUTE_HIDDEN != 0,
        is_system: attributes & FILE_ATTRIBUTE_SYSTEM != 0,
    }
}

#[cfg(not(windows))]
pub fn file_flags(_metadata: &Metadata) -> FileFlags {
    FileFlags {
        is_hidden: false,
        is_system: false,
    }
}
