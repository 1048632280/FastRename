import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  CheckCircle2,
  FolderOpen,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Settings,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTable } from "./components/FileTable/FileTable";
import { useColumnResize } from "./hooks/useColumnResize";
import {
  formatError,
  getSettings,
  listFiles,
  renameFile,
  resolveDropTarget,
  saveSettings,
  undoLastRename
} from "./lib/commands";
import { compactPath } from "./lib/format";
import {
  composeFullName,
  filterIllegalCharacters,
  validateWindowsStem,
  windowsNameKey
} from "./lib/validation";
import type { EditingState, FileEntry, SortKey, SortState } from "./types/file";
import type { AppSettings } from "./types/settings";

const DEFAULT_SETTINGS: AppSettings = {
  showHiddenAndSystemFiles: false
};

type ToastState = {
  tone: "success" | "warning" | "error" | "info";
  message: string;
};

type PendingEdit = {
  fileId: string;
  fullName: string;
  caretOffset: number;
};

export function App() {
  const [directory, setDirectory] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [sortState, setSortState] = useState<SortState>({ key: "stem", direction: "asc" });
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { columnWidths, startResize } = useColumnResize();

  const filesRef = useRef(files);
  const sortedFilesRef = useRef<FileEntry[]>([]);
  const editingRef = useRef<EditingState | null>(null);
  const directoryRef = useRef(directory);
  const settingsRef = useRef(settings);
  const commitLockRef = useRef(false);
  const pendingEditRef = useRef<PendingEdit | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    directoryRef.current = directory;
  }, [directory]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const showToast = useCallback((message: string, tone: ToastState["tone"] = "info") => {
    setToast({ message, tone });

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  const sortedFiles = useMemo(() => {
    const collator = new Intl.Collator("zh-CN", {
      numeric: true,
      sensitivity: "base"
    });
    const direction = sortState.direction === "asc" ? 1 : -1;

    const next = [...files].sort((left, right) => {
      if (sortState.key === "sizeBytes" || sortState.key === "modifiedAt") {
        return (left[sortState.key] - right[sortState.key]) * direction;
      }

      return collator.compare(left[sortState.key], right[sortState.key]) * direction;
    });

    return next;
  }, [files, sortState]);

  useEffect(() => {
    sortedFilesRef.current = sortedFiles;
  }, [sortedFiles]);

  const refreshDirectory = useCallback(
    async (targetDirectory = directoryRef.current) => {
      if (!targetDirectory) {
        return [];
      }

      setIsBusy(true);
      try {
        const nextFiles = await listFiles(
          targetDirectory,
          settingsRef.current.showHiddenAndSystemFiles
        );
        setFiles(nextFiles);
        setDirectory(targetDirectory);
        return nextFiles;
      } catch (error) {
        showToast(formatError(error), "error");
        return filesRef.current;
      } finally {
        setIsBusy(false);
      }
    },
    [showToast]
  );

  const loadDirectory = useCallback(
    async (targetDirectory: string) => {
      setEditing(null);
      setDirectory(targetDirectory);
      const loaded = await refreshDirectory(targetDirectory);
      showToast(`已加载 ${loaded.length} 个文件`, "success");
    },
    [refreshDirectory, showToast]
  );

  useEffect(() => {
    getSettings()
      .then((loadedSettings) => {
        setSettings(loadedSettings);
      })
      .catch((error) => {
        showToast(formatError(error), "warning");
      });
  }, [showToast]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        const payload = event.payload;

        if (payload.type === "enter" || payload.type === "over") {
          setIsDragging(true);
          return;
        }

        if (payload.type === "leave") {
          setIsDragging(false);
          return;
        }

        setIsDragging(false);
        try {
          const target = await resolveDropTarget(payload.paths);
          if (target) {
            await loadDirectory(target);
          } else {
            showToast("请拖入文件夹或单个文件", "warning");
          }
        } catch (error) {
          showToast(formatError(error), "error");
        }
      })
      .then((handler) => {
        unlisten = handler;
      })
      .catch(() => {
        // Browser preview does not expose Tauri webview APIs.
      });

    return () => {
      unlisten?.();
    };
  }, [loadDirectory, showToast]);

  const findDuplicateMessage = useCallback((draftStem: string, currentFile: FileEntry) => {
    const targetName = composeFullName(draftStem, currentFile.extension);
    const targetKey = windowsNameKey(targetName);
    const hasDuplicate = filesRef.current.some((file) => {
      if (file.id === currentFile.id) {
        return false;
      }

      return windowsNameKey(file.fullName) === targetKey;
    });

    return hasDuplicate ? "同目录已有同名文件，保存时将自动编号" : null;
  }, []);

  const buildEditingState = useCallback(
    (
      currentFile: FileEntry,
      value: string,
      caretOffset: number,
      preferredMessage?: string
    ): EditingState => {
      const validationMessage = validateWindowsStem(value);
      const duplicateMessage = validationMessage ? null : findDuplicateMessage(value, currentFile);

      return {
        fileId: currentFile.id,
        originalStem: currentFile.stem,
        draftStem: value,
        caretOffset,
        feedback: validationMessage ? "invalid" : duplicateMessage ? "duplicate" : "none",
        message: preferredMessage ?? validationMessage ?? duplicateMessage ?? undefined
      };
    },
    [findDuplicateMessage]
  );

  const startEditNow = useCallback(
    (file: FileEntry, caretOffset: number) => {
      setEditing(buildEditingState(file, file.stem, caretOffset));
    },
    [buildEditingState]
  );

  const findMoveTarget = useCallback((currentFileId: string, direction: 1 | -1) => {
    const visibleFiles = sortedFilesRef.current;
    const currentIndex = visibleFiles.findIndex((file) => file.id === currentFileId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= visibleFiles.length) {
      return null;
    }

    const target = visibleFiles[nextIndex];
    return {
      fileId: target.id,
      fullName: target.fullName,
      caretOffset: Math.min(editingRef.current?.caretOffset ?? target.stem.length, target.stem.length)
    };
  }, []);

  const startPendingEdit = useCallback(
    (freshFiles: FileEntry[] = filesRef.current) => {
      const pending = pendingEditRef.current;
      pendingEditRef.current = null;

      if (!pending) {
        return;
      }

      const target =
        freshFiles.find((file) => file.id === pending.fileId) ??
        freshFiles.find((file) => file.fullName === pending.fullName);

      if (target) {
        startEditNow(target, Math.min(pending.caretOffset, target.stem.length));
      }
    },
    [startEditNow]
  );

  const commitEditing = useCallback(
    async (moveDirection?: 1 | -1) => {
      if (commitLockRef.current) {
        if (moveDirection) {
          const currentEditing = editingRef.current;
          if (currentEditing) {
            pendingEditRef.current = findMoveTarget(currentEditing.fileId, moveDirection);
          }
        }
        return;
      }

      const currentEditing = editingRef.current;
      if (!currentEditing) {
        return;
      }

      const currentFile = filesRef.current.find((file) => file.id === currentEditing.fileId);
      if (!currentFile) {
        setEditing(null);
        return;
      }

      const moveTarget = moveDirection ? findMoveTarget(currentFile.id, moveDirection) : null;
      if (moveTarget) {
        pendingEditRef.current = moveTarget;
      }

      const draftStem = currentEditing.draftStem;
      const validationMessage = validateWindowsStem(draftStem);
      if (validationMessage) {
        pendingEditRef.current = null;
        if (draftStem.length === 0 || draftStem.trim().length === 0) {
          setEditing(null);
          showToast("文件名不能为空，已恢复原名", "warning");
        } else {
          setEditing(buildEditingState(currentFile, draftStem, currentEditing.caretOffset));
        }
        return;
      }

      commitLockRef.current = true;
      try {
        if (draftStem === currentFile.stem) {
          setEditing(null);
          startPendingEdit(filesRef.current);
          return;
        }

        const result = await renameFile({
          directory: currentFile.directory,
          oldFullName: currentFile.fullName,
          desiredStem: draftStem,
          extension: currentFile.extension
        });
        setEditing(null);

        const freshFiles = await refreshDirectory(currentFile.directory);
        if (result.warning) {
          showToast(result.warning, result.conflictResolved ? "warning" : "info");
        } else {
          showToast(`已重命名为 ${result.newFullName}`, "success");
        }
        startPendingEdit(freshFiles);
      } catch (error) {
        pendingEditRef.current = null;
        setEditing(buildEditingState(currentFile, draftStem, currentEditing.caretOffset, formatError(error)));
        showToast(formatError(error), "error");
      } finally {
        commitLockRef.current = false;
      }
    },
    [buildEditingState, findMoveTarget, refreshDirectory, showToast, startPendingEdit]
  );

  const handleStartEdit = useCallback(
    async (file: FileEntry, caretOffset: number) => {
      const currentEditing = editingRef.current;
      if (currentEditing && currentEditing.fileId !== file.id) {
        pendingEditRef.current = {
          fileId: file.id,
          fullName: file.fullName,
          caretOffset
        };
        await commitEditing();
        return;
      }

      startEditNow(file, caretOffset);
    },
    [commitEditing, startEditNow]
  );

  const handleDraftChange = useCallback(
    (value: string, caretOffset: number) => {
      const currentEditing = editingRef.current;
      if (!currentEditing) {
        return;
      }

      const currentFile = filesRef.current.find((file) => file.id === currentEditing.fileId);
      if (!currentFile) {
        return;
      }

      const filtered = filterIllegalCharacters(value);
      const nextOffset = Math.min(caretOffset, filtered.length);
      const message = filtered !== value ? "已过滤非法字符" : undefined;
      setEditing(buildEditingState(currentFile, filtered, nextOffset, message));
    },
    [buildEditingState]
  );

  const handleInvalidInput = useCallback(
    (message: string) => {
      const currentEditing = editingRef.current;
      if (!currentEditing) {
        return;
      }

      setEditing({ ...currentEditing, feedback: "invalid", message });
    },
    []
  );

  const handleCancelEdit = useCallback(() => {
    pendingEditRef.current = null;
    setEditing(null);
    showToast("已放弃未保存输入", "info");
  }, [showToast]);

  const handleSortChange = useCallback((key: SortKey) => {
    setSortState((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }

      return { key, direction: "asc" };
    });
  }, []);

  const handleChooseDirectory = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false
      });

      if (typeof selected === "string") {
        await loadDirectory(selected);
      }
    } catch (error) {
      showToast(formatError(error), "error");
    }
  }, [loadDirectory, showToast]);

  const handleToggleHiddenFiles = useCallback(async () => {
    const nextSettings = {
      ...settingsRef.current,
      showHiddenAndSystemFiles: !settingsRef.current.showHiddenAndSystemFiles
    };
    setSettings(nextSettings);

    try {
      await saveSettings(nextSettings);
      if (directoryRef.current) {
        await refreshDirectory(directoryRef.current);
      }
      showToast(
        nextSettings.showHiddenAndSystemFiles ? "已显示隐藏/系统文件" : "已隐藏隐藏/系统文件",
        "success"
      );
    } catch (error) {
      showToast(formatError(error), "error");
    }
  }, [refreshDirectory, showToast]);

  const handleUndo = useCallback(async () => {
    if (editingRef.current) {
      return;
    }

    try {
      const result = await undoLastRename();
      if (directoryRef.current) {
        await refreshDirectory(directoryRef.current);
      }

      showToast(result.message ?? "撤销完成", result.changed ? "success" : "warning");
    } catch (error) {
      showToast(formatError(error), "error");
    }
  }, [refreshDirectory, showToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !editingRef.current) {
        event.preventDefault();
        void handleUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo]);

  const currentSortLabel = useMemo(() => {
    const labels: Record<SortKey, string> = {
      stem: "主文件名",
      extension: "扩展名",
      sizeBytes: "大小",
      modifiedAt: "修改时间"
    };

    return `${labels[sortState.key]} ${sortState.direction === "asc" ? "升序" : "降序"}`;
  }, [sortState]);

  return (
    <main className={`app-shell ${isDragging ? "is-dragging" : ""}`}>
      <header className="toolbar">
        <div className="brand">
          <div className="brand__mark">FR</div>
          <div>
            <h1>FastRename</h1>
            <p>{directory ? compactPath(directory) : "未选择文件夹"}</p>
          </div>
        </div>

        <div className="toolbar__actions">
          <button className="icon-button with-label" type="button" onClick={handleChooseDirectory}>
            <FolderOpen size={17} />
            <span>选择文件夹</span>
          </button>
          <button
            className="icon-button"
            type="button"
            title="刷新"
            disabled={!directory || isBusy}
            onClick={() => void refreshDirectory()}
          >
            <RefreshCcw size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="撤销"
            disabled={Boolean(editing)}
            onClick={() => void handleUndo()}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className={`icon-button ${isSettingsOpen ? "is-active" : ""}`}
            type="button"
            title="设置"
            onClick={() => setIsSettingsOpen((value) => !value)}
          >
            <Settings size={17} />
          </button>
        </div>
      </header>

      {isSettingsOpen ? (
        <section className="settings-panel" aria-label="设置">
          <label className="switch-row">
            <span>
              <strong>显示隐藏/系统文件</strong>
              <small>默认关闭，开启后会重新读取当前文件夹。</small>
            </span>
            <input
              type="checkbox"
              checked={settings.showHiddenAndSystemFiles}
              onChange={() => void handleToggleHiddenFiles()}
            />
          </label>
        </section>
      ) : null}

      <section className="workbench" onClick={(event) => {
        if (event.target === event.currentTarget && editingRef.current) {
          void commitEditing();
        }
      }}>
        {directory ? (
          <FileTable
            files={sortedFiles}
            sortState={sortState}
            columnWidths={columnWidths}
            editing={editing}
            onSortChange={handleSortChange}
            onStartResize={startResize}
            onStartEdit={(file, caretOffset) => void handleStartEdit(file, caretOffset)}
            onDraftChange={handleDraftChange}
            onInvalidInput={handleInvalidInput}
            onCommitMove={(direction) => void commitEditing(direction)}
            onCancelEdit={handleCancelEdit}
            onEditorBlur={() => void commitEditing()}
          />
        ) : (
          <div className="empty-state">
            <FolderOpen size={42} />
            <h2>选择或拖入一个文件夹</h2>
            <p>FastRename 会展示该目录下的文件，子目录不会出现在列表中。</p>
            <button className="icon-button with-label primary" type="button" onClick={handleChooseDirectory}>
              <FolderOpen size={17} />
              <span>选择文件夹</span>
            </button>
          </div>
        )}
      </section>

      <footer className="statusbar">
        <span>{directory ? `${files.length} 个文件` : "等待选择文件夹"}</span>
        <span>{directory ? `排序：${currentSortLabel}` : "单目录模式"}</span>
        <span>{settings.showHiddenAndSystemFiles ? "显示隐藏/系统文件" : "普通文件"}</span>
      </footer>

      {isBusy ? (
        <div className="busy-indicator">
          <Loader2 size={16} />
          <span>处理中</span>
        </div>
      ) : null}

      {toast ? (
        <div className={`toast is-${toast.tone}`}>
          {toast.tone === "success" ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
          <span>{toast.message}</span>
        </div>
      ) : null}

      {isDragging ? (
        <div className="drop-overlay">
          <FolderOpen size={40} />
          <span>释放以加载文件夹</span>
        </div>
      ) : null}
    </main>
  );
}
