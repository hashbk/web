import { Encrypt } from "./encrypt.js";

export class WsTransport {
  private encrypt: Encrypt | null = null;
  private pendingResolvers: Array<(data: Uint8Array) => void> = [];
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
      const resolver = this.pendingResolvers.shift();
      if (resolver) {
        resolver(plain);
      } else {
        this.onMessage?.(plain);
      }
    };
    ws.onclose = () => this.onClose?.();
    ws.onerror = () => this.onError?.(new Error("ws error"));
  }

  static connect(url: string): Promise<WsTransport> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => resolve(new WsTransport(ws));
      ws.onerror = () => reject(new Error(`ws connect failed: ${url}`));
    });
  }

  send(data: Uint8Array): void {
    const payload = this.encrypt ? this.encrypt.enc(data) : data;
    this.ws.send(payload);
  }

  setKey(key: Uint8Array): void {
    this.encrypt = new Encrypt(key);
  }

  isSecured(): boolean {
    return this.encrypt !== null;
  }

  recv(): Promise<Uint8Array> {
    return new Promise((resolve) => {
      this.pendingResolvers.push(resolve);
    });
  }

  close(): void {
    this.ws.close();
  }
}