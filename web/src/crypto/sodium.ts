// @ts-ignore: libsodium-wrappers-sumo ships no bundled type declarations
import _sodium from "libsodium-wrappers-sumo";

type Sodium = typeof _sodium;

let sodium: Sodium | null = null;

export async function initSodium(): Promise<void> {
  if (sodium) return;
  await _sodium.ready;
  sodium = _sodium;
}

function S(): Sodium {
  if (!sodium) {
    throw new Error("sodium not initialized; call initSodium() first");
  }
  return sodium;
}

export function cryptoBoxKeypair(): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} {
  return S().crypto_box_keypair();
}

export function randomBytes(n: number): Uint8Array {
  return S().randombytes_buf(n);
}

export function cryptoBoxEasy(
  msg: Uint8Array,
  nonce: Uint8Array,
  theirPk: Uint8Array,
  mySk: Uint8Array,
): Uint8Array {
  return S().crypto_box_easy(msg, nonce, theirPk, mySk);
}

export function cryptoBoxOpenEasy(
  ct: Uint8Array,
  nonce: Uint8Array,
  theirPk: Uint8Array,
  mySk: Uint8Array,
): Uint8Array {
  return S().crypto_box_open_easy(ct, nonce, theirPk, mySk);
}

export function cryptoSignOpen(signed: Uint8Array, pk: Uint8Array): Uint8Array {
  return S().crypto_sign_open(signed, pk);
}

export function cryptoSecretboxEasy(
  msg: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  return S().crypto_secretbox_easy(msg, nonce, key);
}

export function cryptoSecretboxOpenEasy(
  ct: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  return S().crypto_secretbox_open_easy(ct, nonce, key);
}

export const NONCE_BYTES = 24;
export const SECRETBOX_KEY_BYTES = 32;
export const BOX_PUBLICKEY_BYTES = 32;
export const BOX_SECRETKEY_BYTES = 32;
export const SIGN_PUBLICKEY_BYTES = 32;

export function base64Decode(s: string): Uint8Array {
  return S().from_base64(s, 1);
}

export function base64Encode(bytes: Uint8Array): string {
  return S().to_base64(bytes, 1);
}