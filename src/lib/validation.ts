const ILLEGAL_CHARS = new Set(["\\", "/", ":", "*", "?", "\"", "<", ">", "|"]);
const RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

export function isIllegalCharacter(value: string): boolean {
  return value.length === 1 && ILLEGAL_CHARS.has(value);
}

export function filterIllegalCharacters(value: string): string {
  return Array.from(value)
    .filter((char) => !ILLEGAL_CHARS.has(char))
    .join("");
}

export function validateWindowsStem(stem: string): string | null {
  if (stem.length === 0 || stem.trim().length === 0) {
    return "文件名不能为空";
  }

  const illegal = Array.from(stem).find((char) => ILLEGAL_CHARS.has(char));
  if (illegal) {
    return `文件名不能包含 ${illegal}`;
  }

  if (stem.endsWith(" ") || stem.endsWith(".")) {
    return "文件名末尾不能是空格或点号";
  }

  const deviceName = stem.split(".")[0].trimEnd().toUpperCase();
  if (RESERVED_NAMES.has(deviceName)) {
    return `${deviceName} 是 Windows 保留名称`;
  }

  return null;
}

export function composeFullName(stem: string, extension: string): string {
  return extension ? `${stem}.${extension}` : stem;
}

export function windowsNameKey(value: string): string {
  return value.toLocaleLowerCase("zh-CN");
}

export function measureCaretOffset(text: string, clickX: number, element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return text.length;
  }

  context.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;

  for (let index = 0; index <= text.length; index += 1) {
    const before = text.slice(0, index);
    const next = text.slice(0, index + 1);
    const beforeWidth = context.measureText(before).width;
    const nextWidth = context.measureText(next).width;
    const middle = beforeWidth + (nextWidth - beforeWidth) / 2;

    if (clickX <= middle) {
      return index;
    }
  }

  return text.length;
}
