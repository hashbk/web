import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setOption, deriveApiServer } from "../src/config/option-store.js";

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

describe("deriveApiServer", () => {
  it("returns api-server option when set", () => {
    setOption("api-server", "https://my-api.example.com");
    expect(deriveApiServer()).toBe("https://my-api.example.com");
  });

  it("strips trailing slash from api-server", () => {
    setOption("api-server", "https://my-api.example.com/");
    expect(deriveApiServer()).toBe("https://my-api.example.com");
  });

  it("derives from custom-rendezvous-server when api-server empty", () => {
    setOption("custom-rendezvous-server", "rs.example.com:21116");
    expect(deriveApiServer()).toBe("http://rs.example.com:21114");
  });

  it("uses default port 21114 when custom-rendezvous-server has no port", () => {
    setOption("custom-rendezvous-server", "rs.example.com");
    expect(deriveApiServer()).toBe("http://rs.example.com:21114");
  });

  it("returns default when both api-server and custom-rendezvous-server empty", () => {
    expect(deriveApiServer()).toBe("https://admin.rustdesk.com");
  });

  it("strips :21114 from https api-server when allow-https-21114 is not Y", () => {
    setOption("api-server", "https://x.example.com:21114");
    expect(deriveApiServer()).toBe("https://x.example.com");
  });

  it("keeps :21114 when allow-https-21114 is Y", () => {
    setOption("api-server", "https://x.example.com:21114");
    mock.setItem("allow-https-21114", "Y");
    expect(deriveApiServer()).toBe("https://x.example.com:21114");
  });

  it("prefers api-server over custom-rendezvous-server", () => {
    setOption("api-server", "https://api.example.com");
    setOption("custom-rendezvous-server", "rs.example.com:21116");
    expect(deriveApiServer()).toBe("https://api.example.com");
  });
});