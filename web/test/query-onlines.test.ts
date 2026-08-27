import { describe, it, expect } from "vitest";
import {
  deriveOnlineEndpoint,
  parseOnlineStates,
} from "../src/rendezvous/rendezvous-client.js";

describe("deriveOnlineEndpoint", () => {
  it("decrements the port by 1", () => {
    expect(deriveOnlineEndpoint("rs.example.com:21116")).toBe("rs.example.com:21115");
  });

  it("returns empty for empty input", () => {
    expect(deriveOnlineEndpoint("")).toBe("");
  });

  it("returns as-is when no port present", () => {
    expect(deriveOnlineEndpoint("rs.example.com")).toBe("rs.example.com");
  });

  it("strips a ws:// protocol prefix", () => {
    expect(deriveOnlineEndpoint("ws://rs.example.com:21116")).toBe("rs.example.com:21115");
  });

  it("handles IPv6 endpoints", () => {
    expect(deriveOnlineEndpoint("[::1]:21116")).toBe("[::1]:21115");
  });
});

describe("parseOnlineStates", () => {
  it("returns empty for no peers", () => {
    expect(parseOnlineStates([], new Uint8Array([0xff]))).toEqual({
      onlines: [],
      offlines: [],
    });
  });

  it("marks all online when all bits set", () => {
    const peers = ["a", "b", "c"];
    const states = new Uint8Array([0b11100000]);
    expect(parseOnlineStates(peers, states)).toEqual({
      onlines: ["a", "b", "c"],
      offlines: [],
    });
  });

  it("marks all offline when all bits clear", () => {
    const peers = ["a", "b"];
    const states = new Uint8Array([0b00000000]);
    expect(parseOnlineStates(peers, states)).toEqual({
      onlines: [],
      offlines: ["a", "b"],
    });
  });

  it("parses a mixed bitmap", () => {
    const peers = ["a", "b", "c"];
    const states = new Uint8Array([0b10100000]);
    expect(parseOnlineStates(peers, states)).toEqual({
      onlines: ["a", "c"],
      offlines: ["b"],
    });
  });

  it("reads across byte boundaries", () => {
    const peers = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const states = new Uint8Array([0b00000000, 0b10000000]);
    const result = parseOnlineStates(peers, states);
    expect(result.onlines).toEqual(["p8"]);
    expect(result.offlines).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
  });

  it("treats missing bytes as offline", () => {
    const peers = ["a", "b"];
    const states = new Uint8Array([]);
    expect(parseOnlineStates(peers, states)).toEqual({
      onlines: [],
      offlines: ["a", "b"],
    });
  });
});