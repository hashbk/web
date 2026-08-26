import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getOption,
  setOption,
  getAllOptions,
  setAllOptions,
  getUserDefaultOption,
  setUserDefaultOption,
} from "../src/config/option-store.js";

class LocalStorageMock {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

let mock: LocalStorageMock;

beforeEach(() => {
  mock = new LocalStorageMock();
  vi.stubGlobal("localStorage", mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("option get/set", () => {
  it("round-trips a value", () => {
    setOption("access-mode", "full");
    expect(getOption("access-mode")).toBe("full");
  });

  it("returns empty string for missing key", () => {
    expect(getOption("missing")).toBe("");
  });

  it("removes key when value is empty", () => {
    setOption("disable-udp", "Y");
    expect(getOption("disable-udp")).toBe("Y");
    setOption("disable-udp", "");
    expect(getOption("disable-udp")).toBe("");
    expect(mock.getItem("rustdesk:option:disable-udp")).toBeNull();
  });

  it("uses rustdesk:option: prefix", () => {
    setOption("api-server", "https://example.com");
    expect(mock.getItem("rustdesk:option:api-server")).toBe("https://example.com");
  });
});

describe("getAllOptions", () => {
  it("returns only option-prefixed entries as JSON map", () => {
    setOption("a", "1");
    setOption("b", "2");
    mock.setItem("unrelated", "x");
    const parsed = JSON.parse(getAllOptions()) as Record<string, string>;
    expect(parsed).toEqual({ a: "1", b: "2" });
  });

  it("returns {} when empty", () => {
    expect(getAllOptions()).toBe("{}");
  });
});

describe("setAllOptions", () => {
  it("replaces entire option map", () => {
    setOption("old", "1");
    setAllOptions(JSON.stringify({ new1: "a", new2: "b" }));
    expect(getOption("old")).toBe("");
    expect(getOption("new1")).toBe("a");
    expect(getOption("new2")).toBe("b");
  });

  it("ignores empty values", () => {
    setAllOptions(JSON.stringify({ keep: "x", drop: "" }));
    expect(getOption("keep")).toBe("x");
    expect(mock.getItem("rustdesk:option:drop")).toBeNull();
  });

  it("ignores invalid JSON", () => {
    setOption("a", "1");
    setAllOptions("{not json");
    expect(getOption("a")).toBe("1");
  });
});

describe("user default option", () => {
  it("returns stored value when present", () => {
    setUserDefaultOption("view_style", "adaptive");
    expect(getUserDefaultOption("view_style")).toBe("adaptive");
  });

  it("returns default when not stored", () => {
    expect(getUserDefaultOption("view_style")).toBe("original");
    expect(getUserDefaultOption("scroll_style")).toBe("scrollauto");
    expect(getUserDefaultOption("image_quality")).toBe("balanced");
    expect(getUserDefaultOption("codec-preference")).toBe("auto");
    expect(getUserDefaultOption("trackpad-speed")).toBe("100");
    expect(getUserDefaultOption("custom-fps")).toBe("30");
    expect(getUserDefaultOption("custom-image-quality")).toBe("50");
    expect(getUserDefaultOption("enable-file-copy-paste")).toBe("Y");
    expect(getUserDefaultOption("edge-scroll-edge-thickness")).toBe("100");
  });

  it("returns empty string for unknown key without default", () => {
    expect(getUserDefaultOption("unknown-key")).toBe("");
  });

  it("removes key when value is empty", () => {
    setUserDefaultOption("view_style", "adaptive");
    setUserDefaultOption("view_style", "");
    expect(getUserDefaultOption("view_style")).toBe("original");
  });

  it("uses rustdesk:ud: prefix", () => {
    setUserDefaultOption("custom-fps", "60");
    expect(mock.getItem("rustdesk:ud:custom-fps")).toBe("60");
  });
});