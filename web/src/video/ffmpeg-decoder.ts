interface FFmpegDecodeResult {
  data: ArrayBuffer;
  yuvFormat: number;
}

interface FFmpegWorkerMessage {
  id: number;
  type: string;
  data: unknown;
}

export class FFmpegDecoder {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  private bufferPool: ArrayBuffer[] = [];
  private loaded = false;
  private loading: Promise<void> | null = null;
  private baseDir: string;

  constructor(baseDir: string = ".") {
    this.baseDir = baseDir;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;
    this.loading = this._load();
    await this.loading;
  }

  private async _load(): Promise<void> {
    const workerUrl = `${this.baseDir}/ffmpeg.js`;
    this.worker = new Worker(workerUrl, { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FFmpegWorkerMessage>) => {
      const { id, type, data } = e.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (type === "ERROR") {
        entry.reject(data);
      } else if (type === "DECODE") {
        const result = data as { data: ArrayBuffer };
        if (result && result.data) {
          this.bufferPool.push(result.data);
          if (this.bufferPool.length > 8) this.bufferPool.shift();
        }
        entry.resolve(data);
      } else {
        entry.resolve(data);
      }
    };
    this.worker.onerror = (e) => {
      console.error("[ffmpeg] worker error:", e);
    };

    const coreURL = await this.toBlobUrl(
      `${this.baseDir}/ffmpeg-core.js`,
      "text/javascript",
    );
    const wasmURL = await this.toBlobUrl(
      `${this.baseDir}/ffmpeg-core.wasm`,
      "application/wasm",
    );

    await this.send("LOAD", { coreURL, wasmURL });
    this.loaded = true;
  }

  private async toBlobUrl(url: string, type: string): Promise<string> {
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const blob = new Blob([buf], { type });
    return URL.createObjectURL(blob);
  }

  private send(type: string, data: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("FFmpeg worker not initialized"));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, data });
    });
  }

  async decode(codec: number, data: ArrayBuffer): Promise<FFmpegDecodeResult | null> {
    if (!this.loaded || !this.worker) return null;
    let arrayBuffer: ArrayBuffer | null = null;
    while (this.bufferPool.length > 0) {
      const buf = this.bufferPool.pop()!;
      if (buf.byteLength === data.byteLength) {
        arrayBuffer = buf;
        break;
      }
    }
    const transferList: ArrayBuffer[] = [data];
    const sendData: { codec: number; data: ArrayBuffer; arrayBuffer: ArrayBuffer | null } = {
      codec,
      data,
      arrayBuffer,
    };
    if (arrayBuffer) transferList.push(arrayBuffer);

    const result = await new Promise<unknown>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("FFmpeg worker not initialized"));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: "DECODE", data: sendData }, transferList);
    });

    if (!result) return null;
    const decoded = result as { data: ArrayBuffer; yuvFormat: number };
    if (!decoded.data) return null;
    return { data: decoded.data, yuvFormat: decoded.yuvFormat ?? 0 };
  }

  close(): void {
    if (this.worker) {
      try {
        this.send("CLOSE", {});
      } catch {
        // ignore
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.loaded = false;
    this.loading = null;
    this.pending.clear();
    this.bufferPool = [];
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}