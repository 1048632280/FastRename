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
  const currentEditingRef = useRef(editing);
  const dragSelectionRef = useRef<{
    anchorOffset: number;
    fileId: string;
  } | null>(null);

  useEffect(() => {
    currentEditingRef.current = editing;
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
  }, [editing]);

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

  const applyDragSelection = (clientX: number) => {
    const dragSelection = dragSelectionRef.current;
    const input = inputRef.current;
    const currentEditing = currentEditingRef.current;

    if (!dragSelection || !input || currentEditing?.fileId !== dragSelection.fileId) {
      return;
    }

    const currentOffset = getCaretOffset(input, clientX, currentEditing.draftStem);
    const selectionStart = Math.min(dragSelection.anchorOffset, currentOffset);
    const selectionEnd = Math.max(dragSelection.anchorOffset, currentOffset);

    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);
  };

  const beginDragSelection = (
    event: React.MouseEvent<HTMLElement>,
    file: FileEntry,
    caretOffset: number
  ) => {
    dragSelectionRef.current = {
      anchorOffset: caretOffset,
      fileId: file.id
    };

    const handleMove = (moveEvent: MouseEvent) => {
      window.requestAnimationFrame(() => applyDragSelection(moveEvent.clientX));
    };

    const handleUp = (upEvent: MouseEvent) => {
      applyDragSelection(upEvent.clientX);
      dragSelectionRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.requestAnimationFrame(() => applyDragSelection(event.clientX));
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
                  if (event.button !== 0) {
                    return;
                  }

                  const caretOffset = getCaretOffset(event.currentTarget, event.clientX, file.stem);

                  if (isEditing) {
                    return;
                  }

                  onStartEdit(file, caretOffset);
                  beginDragSelection(event, file, caretOffset);
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
                      onSelect={(event) => {
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
