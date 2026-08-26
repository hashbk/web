import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cursorDataToJson,
  cursorPositionToJson,
  cursorIdToJson,
  parseCursorValue,
  applyCursor,
  rgbaToDataUrl,
} from "../src/cursor/cursor.js";

describe("cursorDataToJson", () => {
  it("produces valid JSON with all fields as strings", () => {
    const colors = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const json = cursorDataToJson(42, 1, 2, 4, 4, colors);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("cursor_data");
    expect(parsed.id).toBe("42");
    expect(parsed.hotx).toBe("1");
    expect(parsed.hoty).toBe("2");
    expect(parsed.width).toBe("4");
    expect(parsed.height).toBe("4");
    expect(typeof parsed.colors).toBe("string");
    const colorArray = JSON.parse(parsed.colors);
    expect(colorArray).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });
});

describe("cursorPositionToJson", () => {
  it("produces valid JSON with x and y as strings", () => {
    const json = cursorPositionToJson(100, 200);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("cursor_position");
    expect(parsed.x).toBe("100");
    expect(parsed.y).toBe("200");
  });
});

describe("cursorIdToJson", () => {
  it("produces valid JSON with id as string", () => {
    const json = cursorIdToJson(12345);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("cursor_id");
    expect(parsed.id).toBe("12345");
  });
});

describe("parseCursorValue", () => {
  it("returns 'auto' for 'auto'", () => {
    expect(parseCursorValue("auto")).toBe("auto");
  });

  it("parses JSON cursor value", () => {
    const json = JSON.stringify({ url: "data:image/rgba;base64,abc", hotx: 0, hoty: 0 });
    const parsed = parseCursorValue(json);
    expect(parsed).not.toBe("auto");
    if (parsed !== "auto") {
      expect(parsed.url).toBe("data:image/rgba;base64,abc");
      expect(parsed.hotx).toBe(0);
      expect(parsed.hoty).toBe(0);
    }
  });
});

describe("applyCursor", () => {
  let mockElement: { style: { cursor: string } };

  beforeEach(() => {
    mockElement = { style: { cursor: "" } };
  });

  it("sets cursor to auto", () => {
    applyCursor(mockElement as unknown as HTMLElement, "auto");
    expect(mockElement.style.cursor).toBe("auto");
  });

  it("sets custom cursor with url and hotspot", () => {
    const json = JSON.stringify({ url: "data:image/rgba;base64,abc", hotx: 3, hoty: 4 });
    applyCursor(mockElement as unknown as HTMLElement, json);
    expect(mockElement.style.cursor).toBe('url("data:image/rgba;base64,abc") 3 4, auto');
  });
});

describe("rgbaToDataUrl", () => {
  it("produces data:image/rgba;base64 URL", () => {
    const colors = new Uint8Array([0, 0, 0, 255]);
    const url = rgbaToDataUrl(colors);
    expect(url.startsWith("data:image/rgba;base64,")).toBe(true);
  });
});
