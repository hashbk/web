import {
  cryptoSecretboxEasy,
  cryptoSecretboxOpenEasy,
} from "../crypto/sodium.js";

export function getNonce(seqnum: bigint): Uint8Array {
  const nonce = new Uint8Array(24);
  new DataView(nonce.buffer, 0, 8).setBigUint64(0, seqnum, true);
  return nonce;
}

export class Encrypt {
  private sendCounter = 0n;
  private recvCounter = 0n;
  private readonly key: Uint8Array;

  constructor(key: Uint8Array) {
    this.key = key;
  }

  enc(data: Uint8Array): Uint8Array {
    this.sendCounter += 1n;
    return cryptoSecretboxEasy(data, getNonce(this.sendCounter), this.key);
  }

  dec(ciphertext: Uint8Array): Uint8Array {
    this.recvCounter += 1n;
    return cryptoSecretboxOpenEasy(ciphertext, getNonce(this.recvCounter), this.key);
  }

  get sendSeq(): bigint {
    return this.sendCounter;
  }

  get recvSeq(): bigint {
    return this.recvCounter;
  }
}