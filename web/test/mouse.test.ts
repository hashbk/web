import { describe, it, expect } from "vitest";
import { hbb } from "../src/proto/index.js";
import {
  encodeMouseEvent,
  encodeMouseEventFromJson,
  buildMask,
  buildModifiers,
} from "../src/input/mouse.js";
import {
  MOUSE_TYPE_DOWN,
  MOUSE_TYPE_UP,
  MOUSE_TYPE_MOVE,
  MOUSE_TYPE_WHEEL,
  MOUSE_TYPE_TRACKPAD,
  MOUSE_TYPE_MOVE_RELATIVE,
  MOUSE_BUTTON_LEFT,
  MOUSE_BUTTON_RIGHT,
  MOUSE_BUTTON_WHEEL,
  ControlKey,
} from "../src/input/key-codes.js";

describe("buildMask", () => {
  it("move with no buttons = 0", () => {
    expect(buildMask({})).toBe(0);
  });

  it("down + left = DOWN | (LEFT << 3)", () => {
    expect(buildMask({ type: "down", buttons: "left" })).toBe(
      MOUSE_TYPE_DOWN | (MOUSE_BUTTON_LEFT << 3),
    );
  });

  it("up + right = UP | (RIGHT << 3)", () => {
    expect(buildMask({ type: "up", buttons: "right" })).toBe(
      MOUSE_TYPE_UP | (MOUSE_BUTTON_RIGHT << 3),
    );
  });

  it("wheel + wheel button = WHEEL | (WHEEL << 3)", () => {
    expect(buildMask({ type: "wheel", buttons: "wheel" })).toBe(
      MOUSE_TYPE_WHEEL | (MOUSE_BUTTON_WHEEL << 3),
    );
  });

  it("trackpad type", () => {
    expect(buildMask({ type: "trackpad" })).toBe(MOUSE_TYPE_TRACKPAD);
  });

  it("move_relative type", () => {
    expect(buildMask({ type: "move_relative" })).toBe(MOUSE_TYPE_MOVE_RELATIVE);
  });

  it("unknown type defaults to MOVE (0)", () => {
    expect(buildMask({ type: "unknown" })).toBe(MOUSE_TYPE_MOVE);
  });
});

describe("buildModifiers", () => {
  it("no modifiers = empty array", () => {
    expect(buildModifiers(false, false, false, false)).toEqual([]);
  });

  it("alt only = [Alt]", () => {
    expect(buildModifiers(true, false, false, false)).toEqual([ControlKey.Alt]);
  });

  it("all modifiers in order Alt, Shift, Control, Meta", () => {
    expect(buildModifiers(true, true, true, true)).toEqual([
      ControlKey.Alt,
      ControlKey.Shift,
      ControlKey.Control,
      ControlKey.Meta,
    ]);
  });
});

describe("encodeMouseEvent", () => {
  it("produces valid Message with mouseEvent", () => {
    const bytes = encodeMouseEvent({
      type: "down",
      buttons: "left",
      x: "100",
      y: "200",
    });
    const msg = hbb.Message.decode(bytes);
    expect(msg.mouseEvent).toBeDefined();
    expect(msg.mouseEvent!.mask).toBe(
      MOUSE_TYPE_DOWN | (MOUSE_BUTTON_LEFT << 3),
    );
    expect(msg.mouseEvent!.x).toBe(100);
    expect(msg.mouseEvent!.y).toBe(200);
  });

  it("includes modifiers when alt/ctrl/shift/command present", () => {
    const bytes = encodeMouseEvent({
      type: "move",
      x: "10",
      y: "20",
      alt: "true",
      ctrl: "true",
      shift: "true",
      command: "true",
    });
    const msg = hbb.Message.decode(bytes);
    expect(msg.mouseEvent!.modifiers).toEqual([
      ControlKey.Alt,
      ControlKey.Shift,
      ControlKey.Control,
      ControlKey.Meta,
    ]);
  });

  it("parses JSON string via encodeMouseEventFromJson", () => {
    const json = JSON.stringify({ type: "up", buttons: "right", x: "5", y: "5" });
    const bytes = encodeMouseEventFromJson(json);
    const msg = hbb.Message.decode(bytes);
    expect(msg.mouseEvent!.mask).toBe(
      MOUSE_TYPE_UP | (MOUSE_BUTTON_RIGHT << 3),
    );
  });

  it("defaults x and y to 0 when missing", () => {
    const bytes = encodeMouseEvent({ type: "down", buttons: "left" });
    const msg = hbb.Message.decode(bytes);
    expect(msg.mouseEvent!.x).toBe(0);
    expect(msg.mouseEvent!.y).toBe(0);
  });
});