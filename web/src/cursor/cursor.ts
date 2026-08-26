export interface CursorDataEvent {
  name: "cursor_data";
  id: string;
  hotx: string;
  hoty: string;
  width: string;
  height: string;
  colors: string;
}

export interface CursorPositionEvent {
  name: "cursor_position";
  x: string;
  y: string;
}

export interface CursorIdEvent {
  name: "cursor_id";
  id: string;
}

export type CursorEvent = CursorDataEvent | CursorPositionEvent | CursorIdEvent;

export function cursorDataToJson(
  id: number | string,
  hotx: number,
  hoty: number,
  width: number,
  height: number,
  colors: Uint8Array,
): string {
  return JSON.stringify({
    name: "cursor_data",
    id: String(id),
    hotx: String(hotx),
    hoty: String(hoty),
    width: String(width),
    height: String(height),
    colors: JSON.stringify(Array.from(colors)),
  });
}

export function cursorPositionToJson(x: number, y: number): string {
  return JSON.stringify({
    name: "cursor_position",
    x: String(x),
    y: String(y),
  });
}

export function cursorIdToJson(id: number | string): string {
  return JSON.stringify({
    name: "cursor_id",
    id: String(id),
  });
}

export interface CursorDomValue {
  url: string;
  hotx: number;
  hoty: number;
}

export function parseCursorValue(value: string): CursorDomValue | "auto" {
  if (value === "auto") return "auto";
  return JSON.parse(value) as CursorDomValue;
}

export function applyCursor(element: HTMLElement, value: string): void {
  const parsed = parseCursorValue(value);
  if (parsed === "auto") {
    element.style.cursor = "auto";
    return;
  }
  element.style.cursor = `url("${parsed.url}") ${parsed.hotx} ${parsed.hoty}, auto`;
}

export function rgbaToDataUrl(colors: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < colors.length; i++) {
    binary += String.fromCharCode(colors[i]);
  }
  return `data:image/rgba;base64,${btoa(binary)}`;
}