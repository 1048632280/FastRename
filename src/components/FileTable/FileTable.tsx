import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { formatBytes, formatDate } from "../../lib/format";
import { isIllegalCharacter, measureCaretOffset } from "../../lib/validation";
import type {
  ColumnKey,
  ColumnWidths,
  EditingState,
  FileEntry,
  SortKey,
  SortState
} from "../../types/file";

type FileTableProps = {
  files: FileEntry[];
  sortState: SortState;
  columnWidths: ColumnWidths;
  editing: EditingState | null;
  onSortChange: (key: SortKey) => void;
  onStartResize: (column: ColumnKey, event: React.MouseEvent) => void;
  onStartEdit: (file: FileEntry, caretOffset: number) => void;
  onDraftChange: (value: string, caretOffset: number) => void;
  onInvalidInput: (message: string) => void;
  onCommitMove: (direction: 1 | -1) => void;
  onCancelEdit: () => void;
  onEditorBlur: () => void;
};

type Header = {
  label: string;
  sortKey: SortKey;
  columnKey: ColumnKey;
  align?: "right";
};

const headers: Header[] = [
  { label: "主文件名", sortKey: "stem", columnKey: "stem" },
  { label: "扩展名", sortKey: "extension", columnKey: "extension" },
  { label: "大小", sortKey: "sizeBytes", columnKey: "size", align: "right" },
  { label: "修改时间", sortKey: "modifiedAt", columnKey: "modifiedAt" }
];

export function FileTable({
  files,
  sortState,
  columnWidths,
  editing,
  onSortChange,
  onStartResize,
  onStartEdit,
  onDraftChange,
  onInvalidInput,
  onCommitMove,
  onCancelEdit,
  onEditorBlur
}: FileTableProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousEditingId = useRef<string | null>(null);
  const editingRef = useRef(editing);
  const suppressClickRef = useRef(false);
  const directSelectionRef = useRef<{
    active: boolean;
    anchorOffset: number;
    complete: boolean;
    file: FileEntry;
    latestClientX: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!editing || !inputRef.current) {
      previousEditingId.current = null;
      return;
    }

    const shouldFocus = previousEditingId.current !== editing.fileId;
    previousEditingId.current = editing.fileId;

    const input = inputRef.current;
    if (!shouldFocus) {
      return;
    }

    input.focus();

    const safeOffset = Math.min(editing.caretOffset, input.value.length);
    input.setSelectionRange(safeOffset, safeOffset);
  }, [editing?.fileId]);

  const gridTemplateColumns = useMemo(
    () =>
      `${columnWidths.stem}px ${columnWidths.extension}px ${columnWidths.size}px ${columnWidths.modifiedAt}px`,
    [columnWidths]
  );

  const getCaretOffset = (element: HTMLElement, clientX: number, text: string) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const clickX = clientX - rect.left - Number.parseFloat(style.paddingLeft || "0");

    return measureCaretOffset(text, clickX, element);
  };

  const applyDirectSelection = () => {
    const directSelection = directSelectionRef.current;
    const input = inputRef.current;
    const currentEditing = editingRef.current;

    if (!directSelection || !input || currentEditing?.fileId !== directSelection.file.id) {
      return;
    }

    const currentOffset = getCaretOffset(
      input,
      directSelection.latestClientX,
      currentEditing.draftStem
    );
    const selectionStart = Math.min(directSelection.anchorOffset, currentOffset);
    const selectionEnd = Math.max(directSelection.anchorOffset, currentOffset);

    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);

    if (directSelection.complete) {
      directSelectionRef.current = null;
    }
  };

  useEffect(() => {
    if (!editing) {
      return;
    }

    window.requestAnimationFrame(applyDirectSelection);
  }, [editing?.fileId]);

  const beginDirectSelection = (
    event: React.MouseEvent<HTMLElement>,
    file: FileEntry,
    caretOffset: number
  ) => {
    const startClientX = event.clientX;
    const startClientY = event.clientY;

    directSelectionRef.current = {
      active: false,
      anchorOffset: caretOffset,
      complete: false,
      file,
      latestClientX: startClientX,
      startClientX,
      startClientY
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    const activate = (moveEvent: MouseEvent) => {
      const directSelection = directSelectionRef.current;
      if (!directSelection || directSelection.active) {
        return;
      }

      directSelection.active = true;
      suppressClickRef.current = true;
      window.getSelection()?.removeAllRanges();
      onStartEdit(file, caretOffset);
      moveEvent.preventDefault();
    };

    const handleMove = (moveEvent: MouseEvent) => {
      const directSelection = directSelectionRef.current;
      if (!directSelection) {
        cleanup();
        return;
      }

      const deltaX = Math.abs(moveEvent.clientX - directSelection.startClientX);
      const deltaY = Math.abs(moveEvent.clientY - directSelection.startClientY);
      if (!directSelection.active && deltaX + deltaY < 4) {
        return;
      }

      activate(moveEvent);
      directSelection.latestClientX = moveEvent.clientX;
      window.requestAnimationFrame(applyDirectSelection);
    };

    const handleUp = (upEvent: MouseEvent) => {
      const directSelection = directSelectionRef.current;
      if (directSelection?.active) {
        directSelection.complete = true;
        directSelection.latestClientX = upEvent.clientX;
        window.requestAnimationFrame(applyDirectSelection);
      } else {
        directSelectionRef.current = null;
      }

      cleanup();
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  if (files.length === 0) {
    return (
      <div className="empty-list">
        <div className="empty-list__title">当前文件夹没有可显示的文件</div>
        <div className="empty-list__subtitle">可在设置中开启隐藏/系统文件显示，或拖入其他文件夹。</div>
      </div>
    );
  }

  return (
    <div className="file-table" role="table" aria-label="文件列表">
      <div className="file-table__header" role="row" style={{ gridTemplateColumns }}>
        {headers.map((header) => (
          <button
            key={header.columnKey}
            className={`file-table__head-cell ${header.align === "right" ? "is-right" : ""}`}
            onClick={() => onSortChange(header.sortKey)}
            type="button"
          >
            <span>{header.label}</span>
            <span className="sort-indicator">
              {sortState.key === header.sortKey ? (
                sortState.direction === "asc" ? (
                  <ArrowUp size={14} />
                ) : (
                  <ArrowDown size={14} />
                )
              ) : (
                <span className="sort-placeholder" />
              )}
            </span>
            <span
              aria-hidden="true"
              className="column-resizer"
              onMouseDown={(event) => onStartResize(header.columnKey, event)}
            >
              <GripVertical size={13} />
            </span>
          </button>
        ))}
      </div>

      <div className="file-table__body">
        {files.map((file) => {
          const isEditing = editing?.fileId === file.id;
          const feedbackClass = isEditing ? `is-${editing.feedback}` : "";

          return (
            <div
              className={`file-table__row ${isEditing ? "is-editing" : ""}`}
              key={file.id}
              role="row"
              style={{ gridTemplateColumns }}
            >
              <div
                className={`file-table__cell file-table__cell--stem ${feedbackClass}`}
                role="cell"
                title={file.stem}
                onMouseDown={(event) => {
                  if (event.button !== 0 || isEditing) {
                    return;
                  }

                  const caretOffset = getCaretOffset(event.currentTarget, event.clientX, file.stem);
                  beginDirectSelection(event, file, caretOffset);
                }}
                onClick={(event) => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }

                  if (isEditing) {
                    return;
                  }

                  const caretOffset = getCaretOffset(event.currentTarget, event.clientX, file.stem);
                  onStartEdit(file, caretOffset);
                }}
              >
                {isEditing ? (
                  <div className="editor-wrap">
                    <input
                      ref={inputRef}
                      className={`rename-editor ${feedbackClass}`}
                      value={editing.draftStem}
                      spellCheck={false}
                      onBeforeInput={(event) => {
                        const data = event.nativeEvent.data;
                        if (data && Array.from(data).some(isIllegalCharacter)) {
                          event.preventDefault();
                          onInvalidInput("文件名不能包含 \\ / : * ? \" < > |");
                        }
                      }}
                      onChange={(event) => {
                        onDraftChange(
                          event.currentTarget.value,
                          event.currentTarget.selectionStart ?? event.currentTarget.value.length
                        );
                      }}
                      onPaste={(event) => {
                        event.preventDefault();
                        const raw = event.clipboardData.getData("text");
                        const filtered = raw
                          .split("")
                          .filter((char) => !isIllegalCharacter(char))
                          .join("");
                        const input = event.currentTarget;
                        const start = input.selectionStart ?? input.value.length;
                        const end = input.selectionEnd ?? input.value.length;
                        const nextValue =
                          input.value.slice(0, start) + filtered + input.value.slice(end);
                        const nextOffset = start + filtered.length;

                        if (filtered !== raw) {
                          onInvalidInput("已过滤粘贴内容中的非法字符");
                        }

                        onDraftChange(nextValue, nextOffset);
                      }}
                      onKeyDown={(event) => {
                        if (event.key.length === 1 && isIllegalCharacter(event.key)) {
                          event.preventDefault();
                          onInvalidInput("文件名不能包含 \\ / : * ? \" < > |");
                          return;
                        }

                        if (event.key === "Enter") {
                          event.preventDefault();
                          onCommitMove(1);
                          return;
                        }

                        if (event.key === "Tab") {
                          event.preventDefault();
                          onCommitMove(event.shiftKey ? -1 : 1);
                          return;
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          onCommitMove(-1);
                          return;
                        }

                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          onCommitMove(1);
                          return;
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          onCancelEdit();
                        }
                      }}
                      onBlur={onEditorBlur}
                    />
                    {editing.message ? (
                      <span className={`editor-message ${feedbackClass}`}>{editing.message}</span>
                    ) : null}
                  </div>
                ) : (
                  <span className="stem-text">{file.stem}</span>
                )}
              </div>
              <div className="file-table__cell file-table__cell--extension" role="cell">
                {file.extension || "无"}
              </div>
              <div className="file-table__cell file-table__cell--size is-right" role="cell">
                {formatBytes(file.sizeBytes)}
              </div>
              <div className="file-table__cell file-table__cell--modified" role="cell">
                {formatDate(file.modifiedAt)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
