const encoder = new TextEncoder();

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    data as unknown as ArrayBuffer,
  );
  return new Uint8Array(digest);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0);
  r.set(b, a.length);
  return r;
}

export async function computePassword(
  presetPassword: string,
  salt: string,
  challenge: string,
): Promise<Uint8Array> {
  const h1 = await sha256(concat(encoder.encode(presetPassword), encoder.encode(salt)));
  const h2 = await sha256(concat(h1, encoder.encode(challenge)));
  return h2;
}

export async function hashPasswordFirstRound(
  presetPassword: string,
  salt: string,
): Promise<Uint8Array> {
  return sha256(concat(encoder.encode(presetPassword), encoder.encode(salt)));
}

export async function hashPasswordSecondRound(
  firstRound: Uint8Array,
  challenge: string,
): Promise<Uint8Array> {
  return sha256(concat(firstRound, encoder.encode(challenge)));
}