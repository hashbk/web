import { describe, it, expect, beforeAll } from "vitest";
import {
  initSodium,
  cryptoBoxKeypair,
  cryptoBoxOpenEasy,
} from "../src/crypto/sodium.js";
import { createSymmetricKeyMsg, getRsPubKey } from "../src/crypto/handshake.js";
import { DEFAULT_RS_PUB_KEY } from "../src/constants.js";

describe("handshake", () => {
  beforeAll(async () => {
    await initSodium();
  });

  it("createSymmetricKeyMsg returns 32B pk, 48B sealed, 32B key", () => {
    const { publicKey } = cryptoBoxKeypair();
    const m = createSymmetricKeyMsg(publicKey);
    expect(m.asymmetricValue.length).toBe(32);
    expect(m.symmetricValue.length).toBe(48);
    expect(m.key.length).toBe(32);
  });

  it("sealed symmetric key can be opened with peer sk (box_open)", () => {
    const { publicKey: theirPk, privateKey: theirSk } = cryptoBoxKeypair();
    const m = createSymmetricKeyMsg(theirPk);
    const nonce = new Uint8Array(24);

    const opened = cryptoBoxOpenEasy(
      m.symmetricValue,
      nonce,
      m.asymmetricValue,
      theirSk,
    );
    expect(opened).toEqual(m.key);
  });

  it("getRsPubKey decodes default base64 key to 32 bytes", () => {
    const k = getRsPubKey(DEFAULT_RS_PUB_KEY);
    expect(k.length).toBe(32);
  });
});