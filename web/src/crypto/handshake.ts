import {
  cryptoBoxKeypair,
  cryptoBoxEasy,
  cryptoSignOpen,
  randomBytes,
  base64Decode,
} from "./sodium.js";
import { hbb } from "../proto/index.js";

export interface SymmetricKeyMsg {
  asymmetricValue: Uint8Array;
  symmetricValue: Uint8Array;
  key: Uint8Array;
}

export function createSymmetricKeyMsg(theirPkB: Uint8Array): SymmetricKeyMsg {
  const { publicKey: ourPkB, privateKey: ourSkB } = cryptoBoxKeypair();
  const key = randomBytes(32);
  const nonce = new Uint8Array(24);
  const sealedKey = cryptoBoxEasy(key, nonce, theirPkB, ourSkB);
  return { asymmetricValue: ourPkB, symmetricValue: sealedKey, key };
}

export function decodeIdPk(
  signed: Uint8Array,
  signPk: Uint8Array,
): { id: string; pk: Uint8Array } {
  const plain = cryptoSignOpen(signed, signPk);
  const idPk = hbb.IdPk.decode(plain);
  return { id: idPk.id, pk: idPk.pk as Uint8Array };
}

export function getRsPubKey(key?: string): Uint8Array {
  return base64Decode(key ?? "");
}