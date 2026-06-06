import { invoke } from "@tauri-apps/api/core";
import type { FileEntry, RenameResult, UndoResult } from "../types/file";
import type { AppSettings } from "../types/settings";

export type AppError = {
  code?: string;
  message?: string;
};

export function formatError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const candidate = error as AppError;
    if (candidate.message) {
      return candidate.message;
    }
  }

  return "操作失败，请稍后重试";
}

export function listFiles(
  directory: string,
  showHiddenAndSystemFiles: boolean
): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_files", {
    directory,
    options: { showHiddenAndSystemFiles }
  });
}

export function resolveDropTarget(paths: string[]): Promise<string | null> {
  return invoke<string | null>("resolve_drop_target", { paths });
}

export function renameFile(request: {
  directory: string;
  oldFullName: string;
  desiredStem: string;
  extension: string;
}): Promise<RenameResult> {
  return invoke<RenameResult>("rename_file", { request });
}

export function undoLastRename(): Promise<UndoResult> {
  return invoke<UndoResult>("undo_last_rename");
}

export function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("save_settings", { settings });
}
