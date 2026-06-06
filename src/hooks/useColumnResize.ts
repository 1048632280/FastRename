import { useCallback, useState } from "react";
import type { ColumnKey, ColumnWidths } from "../types/file";

const MIN_WIDTHS: ColumnWidths = {
  stem: 260,
  extension: 92,
  size: 112,
  modifiedAt: 172
};

const MAX_WIDTHS: ColumnWidths = {
  stem: 720,
  extension: 180,
  size: 180,
  modifiedAt: 260
};

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  stem: 420,
  extension: 112,
  size: 128,
  modifiedAt: 190
};

export function useColumnResize(initialWidths = DEFAULT_COLUMN_WIDTHS) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(initialWidths);

  const startResize = useCallback(
    (column: ColumnKey, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = columnWidths[column];

      const handleMove = (moveEvent: MouseEvent) => {
        const nextWidth = Math.min(
          Math.max(startWidth + moveEvent.clientX - startX, MIN_WIDTHS[column]),
          MAX_WIDTHS[column]
        );

        setColumnWidths((current) => ({
          ...current,
          [column]: nextWidth
        }));
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [columnWidths]
  );

  return { columnWidths, startResize };
}
