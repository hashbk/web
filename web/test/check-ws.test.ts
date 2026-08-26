import { describe, it, expect } from "vitest";
import { checkWs } from "../src/transport/check-ws.js";

describe("checkWs", () => {
  it("converts rendezvous domain to wss /ws/id", () => {
    expect(checkWs("example.com:21116", { apiServer: "https://x" })).toBe(
      "wss://example.com/ws/id",
    );
  });
  it("converts relay domain to wss /ws/relay", () => {
    expect(checkWs("example.com:21117", { apiServer: "https://x" })).toBe(
      "wss://example.com/ws/relay",
    );
  });
  it("uses ws for domain when apiServer is http", () => {
    expect(checkWs("example.com:21116", { apiServer: "http://x" })).toBe(
      "ws://example.com/ws/id",
    );
  });
  it("converts rendezvous IP to ws with port+2", () => {
    expect(checkWs("1.2.3.4:21116")).toBe("ws://1.2.3.4:21118");
  });
  it("converts relay IP to ws with port+2", () => {
    expect(checkWs("1.2.3.4:21117")).toBe("ws://1.2.3.4:21119");
  });
  it("treats 21115 as rendezvous (port+3)", () => {
    expect(checkWs("1.2.3.4:21115")).toBe("ws://1.2.3.4:21118");
  });
  it("returns endpoint as-is when already ws", () => {
    expect(checkWs("wss://example.com/ws/id")).toBe("wss://example.com/ws/id");
  });
  it("returns endpoint as-is when useWs false", () => {
    expect(checkWs("example.com:21116", { useWs: false })).toBe(
      "example.com:21116",
    );
  });
});