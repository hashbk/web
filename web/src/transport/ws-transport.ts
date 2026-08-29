import { Encrypt } from "./encrypt.js";

interface PendingRecv {
  resolve: (data: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export class WsTransport {
  private encrypt: Encrypt | null = null;
  private pendingRecvs: PendingRecv[] = [];
  private closed = false;
  private earlyMessages: Uint8Array[] = [];
  onMessage: ((data: Uint8Array) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((e: Error) => void) | null = null;

  constructor(private ws: WebSocket) {
    ws.binaryType = "arraybuffer";
    ws.onmessage = (ev) => {
      const bytes = new Uint8Array(ev.data as ArrayBuffer);
      let plain: Uint8Array;
      try {
        plain = this.encrypt ? this.encrypt.dec(bytes) : bytes;
      } catch (e) {
        this.onError?.(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      const pending = this.pendingRecvs.shift();
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve(plain);
      } else if (this.onMessage) {
        this.onMessage(plain);
      } else {
        this.earlyMessages.push(plain);
      }
    };
    ws.onclose = () => {
      this.closed = true;
      this.rejectAllPending(new Error("ws closed"));
      this.onClose?.();
    };
    ws.onerror = () => {
      const err = new Error("ws error");
      if (this.closed) return;
      this.closed = true;
      this.rejectAllPending(err);
      this.onError?.(err);
    };
  }

  private rejectAllPending(err: Error): void {
    for (const p of this.pendingRecvs) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
    this.pendingRecvs = [];
  }

  static connect(url: string, timeoutMs: number = 15000): Promise<WsTransport> {
    return new Promise((resolve, reject) => {
      let wsUrl = url;
      if (
        typeof globalThis.location !== "undefined" &&
        globalThis.location.protocol === "https:" &&
        wsUrl.startsWith("ws://")
      ) {
        wsUrl = "wss://" + wsUrl.slice(5);
      }
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error(`ws connect timeout after ${timeoutMs}ms: ${wsUrl}`));
      }, timeoutMs);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new WsTransport(ws));
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`ws connect failed: ${wsUrl}`));
      };
    });
  }

  send(data: Uint8Array): void {
    const payload = this.encrypt ? this.encrypt.enc(data) : data;
    this.ws.send(payload as unknown as BufferSource);
  }

  setKey(key: Uint8Array): void {
    this.encrypt = new Encrypt(key);
  }

  drainEarlyMessages(handler: (data: Uint8Array) => void): void {
    for (const msg of this.earlyMessages) {
      handler(msg);
    }
    this.earlyMessages = [];
  }

  pushEarlyMessage(data: Uint8Array): void {
    this.earlyMessages.push(data);
  }

  isSecured(): boolean {
    return this.encrypt !== null;
  }

  recv(timeoutMs?: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("ws closed"));
        return;
      }
      const pending: PendingRecv = { resolve, reject, timer: null };
      if (timeoutMs && timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          const idx = this.pendingRecvs.indexOf(pending);
          if (idx !== -1) this.pendingRecvs.splice(idx, 1);
          reject(new Error(`ws recv timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      this.pendingRecvs.push(pending);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectAllPending(new Error("ws closed"));
    this.ws.close();
  }
}