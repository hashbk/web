import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { idbGet, idbSet, idbRemove } from "../src/config/idb-store.js";

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

describe("idb-store (localStorage fallback)", () => {
  it("set and get round-trips", async () => {
    await idbSet("ab-cache", "value-1");
    expect(await idbGet("ab-cache")).toBe("value-1");
  });

  it("get returns empty string for missing key", async () => {
    expect(await idbGet("missing")).toBe("");
  });

  it("remove deletes the key", async () => {
    await idbSet("group-cache", "value-2");
    await idbRemove("group-cache");
    expect(await idbGet("group-cache")).toBe("");
  });

  it("persists through localStorage in fallback mode", async () => {
    await idbSet("ab-cache", "from-local");
    expect(mock.getItem("ab-cache")).toBe("from-local");
  });
});