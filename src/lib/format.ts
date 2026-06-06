export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatDate(timestampSeconds: number): string {
  if (!timestampSeconds) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestampSeconds * 1000));
}

export function compactPath(path: string): string {
  if (path.length <= 72) {
    return path;
  }

  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const tail = parts.slice(-2).join("/");

  return `${parts[0]}/.../${tail}`.replaceAll("/", "\\");
}
