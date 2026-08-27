import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WsTransport } from "../src/transport/ws-transport.js";

class MockWebSocket {
  binaryType: string = "arraybuffer";
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentData: Uint8Array[] = [];
  closed = false;

  send(data: Uint8Array): void {
    this.sentData.push(data);
  }

  close(): void {
    this.closed = true;
  }

  triggerOpen(): void {
    this.onopen?.();
  }

  triggerMessage(bytes: Uint8Array): void {
    this.onmessage?.({ data: bytes.buffer.slice(0) });
  }

  triggerClose(): void {
    this.onclose?.();
  }

  triggerError(): void {
    this.onerror?.();
  }
}

function createTransport(): { transport: WsTransport; ws: MockWebSocket } {
  const ws = new MockWebSocket();
  const transport = new WsTransport(ws as unknown as WebSocket);
  return { transport, ws };
}

describe("WsTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recv resolves when message arrives", async () => {
    const { transport, ws } = createTransport();
    const data = new Uint8Array([1, 2, 3]);
    const promise = transport.recv();
    ws.triggerMessage(data);
    await expect(promise).resolves.toEqual(data);
  });

  it("recv rejects on timeout", async () => {
    const { transport } = createTransport();
    const promise = transport.recv(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).rejects.toThrow("ws recv timeout after 1000ms");
  });

  it("recv rejects immediately if already closed", async () => {
    const { transport, ws } = createTransport();
    ws.triggerClose();
    await expect(transport.recv(5000)).rejects.toThrow("ws closed");
  });

  it("recv rejects when ws closes while pending", async () => {
    const { transport, ws } = createTransport();
    const promise = transport.recv(10000);
    ws.triggerClose();
    await expect(promise).rejects.toThrow("ws closed");
  });

  it("recv rejects when ws errors while pending", async () => {
    const { transport, ws } = createTransport();
    const promise = transport.recv(10000);
    ws.triggerError();
    await expect(promise).rejects.toThrow("ws error");
  });

  it("multiple pending recvs all reject on close", async () => {
    const { transport, ws } = createTransport();
    const p1 = transport.recv(10000);
    const p2 = transport.recv(10000);
    const p3 = transport.recv(10000);
    ws.triggerClose();
    await expect(p1).rejects.toThrow("ws closed");
    await expect(p2).rejects.toThrow("ws closed");
    await expect(p3).rejects.toThrow("ws closed");
  });

  it("timeout is cleared when message arrives in time", async () => {
    const { transport, ws } = createTransport();
    const data = new Uint8Array([42]);
    const promise = transport.recv(5000);
    ws.triggerMessage(data);
    vi.advanceTimersByTime(5000);
    await expect(promise).resolves.toEqual(data);
  });

  it("only the timed-out recv is rejected, others remain pending", async () => {
    const { transport, ws } = createTransport();
    const p1 = transport.recv(1000);
    const p2 = transport.recv(10000);
    vi.advanceTimersByTime(1000);
    await expect(p1).rejects.toThrow("ws recv timeout after 1000ms");
    const data = new Uint8Array([99]);
    ws.triggerMessage(data);
    await expect(p2).resolves.toEqual(data);
  });

  it("close() rejects pending recvs", async () => {
    const { transport } = createTransport();
    const promise = transport.recv(10000);
    transport.close();
    await expect(promise).rejects.toThrow("ws closed");
  });

  it("close() is idempotent", () => {
    const { transport } = createTransport();
    expect(() => {
      transport.close();
      transport.close();
    }).not.toThrow();
  });

  it("onMessage callback fires when no pending recv", () => {
    const { transport, ws } = createTransport();
    const received: Uint8Array[] = [];
    transport.onMessage = (data) => received.push(data);
    ws.triggerMessage(new Uint8Array([1, 2]));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(new Uint8Array([1, 2]));
  });

  it("onClose callback fires on ws close", () => {
    const { transport, ws } = createTransport();
    let closed = false;
    transport.onClose = () => { closed = true; };
    ws.triggerClose();
    expect(closed).toBe(true);
  });

  it("onError callback fires on ws error", () => {
    const { transport, ws } = createTransport();
    let errored = false;
    transport.onError = () => { errored = true; };
    ws.triggerError();
    expect(errored).toBe(true);
  });

  it("send pushes payload to underlying ws", () => {
    const { transport, ws } = createTransport();
    const data = new Uint8Array([10, 20, 30]);
    transport.send(data);
    expect(ws.sentData).toHaveLength(1);
    expect(ws.sentData[0]).toEqual(data);
  });
});