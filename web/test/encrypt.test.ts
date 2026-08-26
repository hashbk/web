import { describe, it, expect, beforeAll } from "vitest";
import { initSodium, randomBytes } from "../src/crypto/sodium.js";
import { Encrypt, getNonce } from "../src/transport/encrypt.js";

describe("getNonce", () => {
  it("writes le64 counter in first 8 bytes, rest zero", () => {
    const n = getNonce(1n);
    expect(n.length).toBe(24);
    expect(n[0]).toBe(1);
    for (let i = 1; i < 24; i++) expect(n[i]).toBe(0);
  });

  it("encodes larger counter in little endian", () => {
    const n = getNonce(256n);
    expect(n[0]).toBe(0);
    expect(n[1]).toBe(1);
  });
});

describe("Encrypt", () => {
  beforeAll(async () => {
    await initSodium();
  });

  it("ciphertext length = plaintext + 16 MAC bytes", () => {
    const key = randomBytes(32);
    const enc = new Encrypt(key);
    const data = new TextEncoder().encode("hello");
    const ct = enc.enc(data);
    expect(ct.length).toBe(data.length + 16);
  });

  it("roundtrip: separate send/recv counters start at 1", () => {
    const key = randomBytes(32);
    const sender = new Encrypt(key);
    const receiver = new Encrypt(key);
    const data = new TextEncoder().encode("roundtrip message");
    const ct = sender.enc(data);
    const plain = receiver.dec(ct);
    expect(plain).toEqual(data);
    expect(sender.sendSeq).toBe(1n);
    expect(receiver.recvSeq).toBe(1n);
  });

  it("independent send/recv counters increment per message", () => {
    const key = randomBytes(32);
    const sender = new Encrypt(key);
    const receiver = new Encrypt(key);
    for (let i = 1; i <= 3; i++) {
      const data = new TextEncoder().encode(`msg ${i}`);
      const ct = sender.enc(data);
      const plain = receiver.dec(ct);
      expect(plain).toEqual(data);
      expect(sender.sendSeq).toBe(BigInt(i));
      expect(receiver.recvSeq).toBe(BigInt(i));
    }
  });
});