import { describe, it, expect } from "vitest";
import { hbb } from "../src/proto/index.js";
import { VideoDecoderManager } from "../src/video/video-decoder.js";
import {
  MessageDispatcher,
  buildPeerInfoEventJson,
  buildConnectionReadyEventJson,
} from "../src/session/message-dispatcher.js";

function makeDispatcher(callbacks: Record<string, (...args: any[]) => void> = {}) {
  const videoDecoder = new VideoDecoderManager({});
  const dispatcher = new MessageDispatcher(videoDecoder, callbacks);
  return { dispatcher, videoDecoder };
}

describe("MessageDispatcher", () => {
  it("dispatches cursorData to onGlobalEvent", () => {
    const events: string[] = [];
    const { dispatcher } = makeDispatcher({
      onGlobalEvent: (json: string) => events.push(json),
    });
    const msg = hbb.Message.create({
      cursorData: {
        id: 42,
        hotx: 1,
        hoty: 2,
        width: 4,
        height: 4,
        colors: new Uint8Array([255, 0, 0, 255]),
      },
    });
    const bytes = hbb.Message.encode(msg).finish();
    dispatcher.dispatch(bytes);
    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("cursor_data");
    expect(parsed.id).toBe("42");
    expect(parsed.hotx).toBe("1");
    expect(parsed.width).toBe("4");
  });

  it("dispatches cursorPosition to onGlobalEvent", () => {
    const events: string[] = [];
    const { dispatcher } = makeDispatcher({
      onGlobalEvent: (json: string) => events.push(json),
    });
    const msg = hbb.Message.create({
      cursorPosition: { x: 100, y: 200 },
    });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("cursor_position");
    expect(parsed.x).toBe("100");
    expect(parsed.y).toBe("200");
  });

  it("dispatches cursorId to onGlobalEvent", () => {
    const events: string[] = [];
    const { dispatcher } = makeDispatcher({
      onGlobalEvent: (json: string) => events.push(json),
    });
    const msg = hbb.Message.create({ cursorId: 999 });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("cursor_id");
    expect(parsed.id).toBe("999");
  });

  it("dispatches clipboard to onClipboard and onGlobalEvent", () => {
    const events: string[] = [];
    const clips: string[] = [];
    const { dispatcher } = makeDispatcher({
      onGlobalEvent: (json: string) => events.push(json),
      onClipboard: (text: string) => clips.push(text),
    });
    const msg = hbb.Message.create({
      clipboard: {
        content: new TextEncoder().encode("hello clipboard"),
        format: hbb.ClipboardFormat.Text,
      },
    });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    expect(clips).toEqual(["hello clipboard"]);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("clipboard");
    expect(parsed.content).toBe("hello clipboard");
  });

  it("dispatches misc.switchDisplay to onGlobalEvent", () => {
    const events: string[] = [];
    const { dispatcher } = makeDispatcher({
      onGlobalEvent: (json: string) => events.push(json),
    });
    const msg = hbb.Message.create({
      misc: {
        switchDisplay: { display: 1, x: 0, y: 0, width: 1920, height: 1080 },
      },
    });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("switch_display");
    expect(parsed.display).toBe("1");
    expect(parsed.width).toBe("1920");
    expect(parsed.height).toBe("1080");
  });

  it("dispatches misc.permissionInfo to onGlobalEvent", () => {
    const events: string[] = [];
    const { dispatcher } = makeDispatcher({
      onGlobalEvent: (json: string) => events.push(json),
    });
    const msg = hbb.Message.create({
      misc: {
        permissionInfo: { permission: 0, enabled: true },
      },
    });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("permission");
    expect(parsed.keyboard).toBe("true");
  });

  it("dispatches peerInfo to onPeerInfo callback", () => {
    let peerInfo: hbb.IPeerInfo | undefined;
    const { dispatcher } = makeDispatcher({
      onPeerInfo: (pi: hbb.IPeerInfo) => { peerInfo = pi; },
    });
    const msg = hbb.Message.create({
      peerInfo: { username: "test", hostname: "host", platform: "Linux", version: "1.4.9" },
    });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    expect(peerInfo).toBeDefined();
    expect(peerInfo!.username).toBe("test");
    expect(peerInfo!.platform).toBe("Linux");
  });

  it("forwards peerInfo as peer_info event via onGlobalEvent", () => {
    const events: string[] = [];
    const { dispatcher } = makeDispatcher({
      onGlobalEvent: (json: string) => events.push(json),
    });
    const msg = hbb.Message.create({
      peerInfo: {
        username: "user1",
        hostname: "host1",
        platform: "Linux",
        version: "1.4.9",
        sasEnabled: true,
        currentDisplay: 0,
        displays: [{ x: 0, y: 0, width: 1920, height: 1080, cursorEmbedded: false }],
        features: { privacyMode: false },
      },
    });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("peer_info");
    expect(parsed.username).toBe("user1");
    expect(parsed.hostname).toBe("host1");
    expect(parsed.platform).toBe("Linux");
    expect(parsed.version).toBe("1.4.9");
    expect(parsed.sas_enabled).toBe("true");
    expect(parsed.current_display).toBe("0");
    const displays = JSON.parse(parsed.displays);
    expect(displays[0].width).toBe(1920);
    expect(displays[0].height).toBe(1080);
    const features = JSON.parse(parsed.features);
    expect(features.privacy_mode).toBe(false);
  });

  it("silently ignores audioFrame", () => {
    const { dispatcher } = makeDispatcher({});
    const msg = hbb.Message.create({
      audioFrame: { data: new Uint8Array([1, 2, 3]) },
    });
    expect(() => dispatcher.dispatch(hbb.Message.encode(msg).finish())).not.toThrow();
  });

  it("calls onDefault for unhandled message types", () => {
    let defaultCalled = false;
    const { dispatcher } = makeDispatcher({
      onDefault: () => { defaultCalled = true; },
    });
    const msg = hbb.Message.create({
      screenshotRequest: {},
    });
    dispatcher.dispatch(hbb.Message.encode(msg).finish());
    expect(defaultCalled).toBe(true);
  });

  it("handles invalid bytes gracefully", () => {
    const { dispatcher } = makeDispatcher({});
    expect(() => dispatcher.dispatch(new Uint8Array([0xff, 0xff]))).not.toThrow();
  });
});

describe("buildPeerInfoEventJson", () => {
  it("builds a complete peer_info event with all fields", () => {
    const pi: hbb.IPeerInfo = {
      username: "alice",
      hostname: "bob-pc",
      platform: "Windows",
      version: "1.4.10",
      sasEnabled: false,
      currentDisplay: 1,
      displays: [
        { x: 0, y: 0, width: 2560, height: 1440, cursorEmbedded: true, scale: 1.5 },
      ],
      features: { privacyMode: true, terminal: false },
      resolutions: { resolutions: [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }] },
      platformAdditions: "extra",
    };
    const json = buildPeerInfoEventJson(pi);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("peer_info");
    expect(parsed.username).toBe("alice");
    expect(parsed.hostname).toBe("bob-pc");
    expect(parsed.platform).toBe("Windows");
    expect(parsed.version).toBe("1.4.10");
    expect(parsed.sas_enabled).toBe("false");
    expect(parsed.current_display).toBe("1");
    expect(parsed.platform_additions).toBe("extra");
    const displays = JSON.parse(parsed.displays);
    expect(displays[0].width).toBe(2560);
    expect(displays[0].height).toBe(1440);
    expect(displays[0].cursor_embedded).toBe(1);
    expect(displays[0].scaled_width).toBe(1707);
    const features = JSON.parse(parsed.features);
    expect(features.privacy_mode).toBe(true);
    const resolutions = JSON.parse(parsed.resolutions);
    expect(resolutions.length).toBe(2);
    expect(resolutions[0].width).toBe(1920);
  });

  it("handles empty/null fields with defaults", () => {
    const json = buildPeerInfoEventJson({});
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("peer_info");
    expect(parsed.username).toBe("");
    expect(parsed.sas_enabled).toBe("false");
    expect(parsed.current_display).toBe("0");
    expect(JSON.parse(parsed.displays)).toEqual([]);
    expect(JSON.parse(parsed.features)).toEqual({});
    expect(JSON.parse(parsed.resolutions)).toEqual([]);
  });
});

describe("buildConnectionReadyEventJson", () => {
  it("builds a connection_ready event", () => {
    const json = buildConnectionReadyEventJson(true, false, "");
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("connection_ready");
    expect(parsed.secure).toBe("true");
    expect(parsed.direct).toBe("false");
    expect(parsed.stream_type).toBe("");
  });

  it("builds a direct unsecured connection_ready event", () => {
    const json = buildConnectionReadyEventJson(false, true, "texture");
    const parsed = JSON.parse(json);
    expect(parsed.secure).toBe("false");
    expect(parsed.direct).toBe("true");
    expect(parsed.stream_type).toBe("texture");
  });
});