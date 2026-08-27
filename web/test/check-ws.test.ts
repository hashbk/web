import { describe, it, expect } from "vitest";
import { checkWs } from "../src/transport/check-ws.js";

describe("checkWs", () => {
  it("defaults to wss for domain rendezvous", () => {
    expect(checkWs("example.com:21116")).toBe("wss://example.com/ws/id");
  });
  it("defaults to wss for domain relay", () => {
    expect(checkWs("example.com:21117")).toBe("wss://example.com/ws/relay");
  });
  it("defaults to wss for IP rendezvous", () => {
    expect(checkWs("1.2.3.4:21116")).toBe("wss://1.2.3.4:21118");
  });
  it("defaults to wss for IP relay", () => {
    expect(checkWs("1.2.3.4:21117")).toBe("wss://1.2.3.4:21119");
  });
  it("treats 21115 as rendezvous (port+3)", () => {
    expect(checkWs("1.2.3.4:21115")).toBe("wss://1.2.3.4:21118");
  });
  it("returns wss endpoint as-is", () => {
    expect(checkWs("wss://example.com/ws/id")).toBe("wss://example.com/ws/id");
  });
  it("respects explicit ws:// when page is not https", () => {
    expect(checkWs("ws://example.com/ws/id")).toBe("ws://example.com/ws/id");
  });
  it("returns endpoint as-is when useWs false", () => {
    expect(checkWs("example.com:21116", { useWs: false })).toBe(
      "example.com:21116",
    );
  });
});
