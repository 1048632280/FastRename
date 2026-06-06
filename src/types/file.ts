export type FileEntry = {
  id: string;
  directory: string;
  stem: string;
  extension: string;
  fullName: string;
  sizeBytes: number;
  modifiedAt: number;
  isHidden: boolean;
  isSystem: boolean;
};

export type SortKey = "stem" | "extension" | "sizeBytes" | "modifiedAt";

export type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

export type ColumnKey = "stem" | "extension" | "size" | "modifiedAt";

export type ColumnWidths = Record<ColumnKey, number>;

export type EditingState = {
  fileId: string;
  originalStem: string;
  draftStem: string;
  caretOffset: number;
  feedback: "none" | "invalid" | "duplicate";
  message?: string;
};

export type RenameResult = {
  oldFullName: string;
  newFullName: string;
  finalStem: string;
  extension: string;
  conflictResolved: boolean;
  warning?: string;
};

export type UndoResult = {
  changed: boolean;
  fromFullName: string;
  restoredFullName: string;
  conflictResolved: boolean;
  message?: string;
};
