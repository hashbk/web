import ffmpegWorkerUrl from "./ffmpeg.js?url";
import ffmpegCoreJsUrl from "./ffmpeg-core.js?url";
import ffmpegCoreWasmUrl from "./ffmpeg-core.wasm?url";

interface FFmpegDecodeResult {
  data: ArrayBuffer;
  yuvFormat: number;
}

interface FFmpegWorkerMessage {
  id: number;
  type: string;
  data: unknown;
}

interface FFmpegDecodeResponse {
  data: {
    data: ArrayBuffer;
    yuvFormat: number;
  };
}

export class FFmpegDecoder {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  private recycledBuffers: ArrayBuffer[] = [];
  private loaded = false;
  private loading: Promise<void> | null = null;


  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;
    this.loading = this._load();
    await this.loading;
  }

  private async _load(): Promise<void> {
    this.worker = new Worker(ffmpegWorkerUrl, { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FFmpegWorkerMessage>) => {
      const { id, type, data } = e.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (type === "ERROR") {
        entry.reject(data);
        return;
      }
      if (type === "DECODE") {
        const resp = data as FFmpegDecodeResponse;
        const buffer = resp?.data?.data;
        if (buffer) {
          this.recycledBuffers.push(buffer);
          if (this.recycledBuffers.length > 8) {
            this.recycledBuffers.shift();
          }
        }
      }
      entry.resolve(data);
    };
    this.worker.onerror = (e) => {
      console.error("[ffmpeg] worker error:", e);
    };

    const coreURL = await this.toBlobUrl(ffmpegCoreJsUrl, "text/javascript");
    const wasmURL = await this.toBlobUrl(ffmpegCoreWasmUrl, "application/wasm");

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
    return this.sendWithTransfer(type, data, undefined);
  }

  private sendWithTransfer(
    type: string,
    data: unknown,
    transfer: Transferable[] | undefined,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("FFmpeg worker not initialized"));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, data }, transfer ?? []);
    });
  }

  async decode(codec: number, data: ArrayBuffer): Promise<FFmpegDecodeResult | null> {
    if (!this.loaded || !this.worker) return null;

    let recycled: ArrayBuffer | null = null;
    if (this.recycledBuffers.length > 0) {
      recycled = this.recycledBuffers.pop()!;
    }

    const transfer: ArrayBuffer[] = [data];
    if (recycled) transfer.push(recycled);

    const sendData = { codec, data, arrayBuffer: recycled };

    const result = await this.sendWithTransfer("DECODE", sendData, transfer);
    if (!result) return null;

    const resp = result as FFmpegDecodeResponse;
    if (!resp?.data?.data) return null;
    return { data: resp.data.data, yuvFormat: resp.data.yuvFormat ?? 0 };
  }

  close(): void {
    if (this.worker) {
      try {
        void this.send("CLOSE", {});
      } catch {
        // ignore
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.loaded = false;
    this.loading = null;
    this.pending.clear();
    this.recycledBuffers = [];
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}