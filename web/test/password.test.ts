import { describe, it, expect } from "vitest";
import {
  computePassword,
  hashPasswordFirstRound,
  hashPasswordSecondRound,
} from "../src/crypto/password.js";

describe("computePassword", () => {
  it("produces 32-byte digest", async () => {
    const pw = await computePassword("secret", "salt", "challenge");
    expect(pw.length).toBe(32);
  });

  it("is deterministic for same inputs", async () => {
    const a = await computePassword("secret", "salt", "challenge");
    const b = await computePassword("secret", "salt", "challenge");
    expect(a).toEqual(b);
  });

  it("differs for different passwords", async () => {
    const a = await computePassword("secret", "salt", "challenge");
    const b = await computePassword("other", "salt", "challenge");
    expect(a).not.toEqual(b);
  });

  it("two-round split matches combined", async () => {
    const h1 = await hashPasswordFirstRound("secret", "salt");
    const split = await hashPasswordSecondRound(h1, "challenge");
    const combined = await computePassword("secret", "salt", "challenge");
    expect(split).toEqual(combined);
  });
});