import { describe, it, expect } from "vitest";
import { hbb } from "../src/proto/index.js";
import {
  encodeInputKey,
  encodeInputKeyFromJson,
  encodeInputString,
  encodeFlutterKeyEvent,
  encodeCtrlAltDel,
  encodeLockScreen,
} from "../src/input/keyboard.js";
import { ControlKey, KeyboardMode } from "../src/input/key-codes.js";

describe("encodeInputKey", () => {
  it("single char name → chr in KeyEvent (Legacy mode)", () => {
    const bytes = encodeInputKey({ name: "a", down: "true" });
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent).toBeDefined();
    expect(msg.keyEvent!.chr).toBe(97);
    expect(msg.keyEvent!.down).toBe(true);
    expect(msg.keyEvent!.mode).toBe(KeyboardMode.Legacy);
  });

  it("VK_RETURN → controlKey Return", () => {
    const bytes = encodeInputKey({ name: "VK_RETURN", press: "true" });
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.controlKey).toBe(ControlKey.Return);
    expect(msg.keyEvent!.press).toBe(true);
    expect(msg.keyEvent!.down).toBe(false);
  });

  it("includes modifiers", () => {
    const bytes = encodeInputKey({
      name: "a",
      down: "true",
      alt: "true",
      ctrl: "true",
      shift: "true",
      command: "true",
    });
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.modifiers).toEqual([
      ControlKey.Alt,
      ControlKey.Shift,
      ControlKey.Control,
      ControlKey.Meta,
    ]);
  });

  it("unknown name returns empty bytes", () => {
    const bytes = encodeInputKey({ name: "UNKNOWN_KEY", down: "true" });
    expect(bytes.length).toBe(0);
  });

  it("parses JSON string via encodeInputKeyFromJson", () => {
    const json = JSON.stringify({ name: "VK_SPACE", down: "true" });
    const bytes = encodeInputKeyFromJson(json);
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.controlKey).toBe(ControlKey.Space);
  });
});

describe("encodeInputString", () => {
  it("creates KeyEvent with seq and Legacy mode", () => {
    const bytes = encodeInputString("hello");
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.seq).toBe("hello");
    expect(msg.keyEvent!.mode).toBe(KeyboardMode.Legacy);
  });
});

describe("encodeFlutterKeyEvent", () => {
  it("maps usb_hid for letter 'a' (0x04) to chr 97 in Map mode", () => {
    const bytes = encodeFlutterKeyEvent({
      name: "a",
      usb_hid: 0x04,
      lock_modes: 0,
      down: "true",
    });
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.chr).toBe(97);
    expect(msg.keyEvent!.mode).toBe(KeyboardMode.Map);
    expect(msg.keyEvent!.down).toBe(true);
  });

  it("maps usb_hid for Escape (0x29) to controlKey Escape", () => {
    const bytes = encodeFlutterKeyEvent({
      name: "Escape",
      usb_hid: 0x29,
      lock_modes: 0,
      down: "true",
    });
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.controlKey).toBe(ControlKey.Escape);
    expect(msg.keyEvent!.mode).toBe(KeyboardMode.Map);
  });

  it("maps usb_hid for Left Ctrl (0xe0) to controlKey Control", () => {
    const bytes = encodeFlutterKeyEvent({
      name: "ControlLeft",
      usb_hid: 0xe0,
      lock_modes: 0,
      down: "true",
    });
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.controlKey).toBe(ControlKey.Control);
  });

  it("flutter_key name with VolumeMute (0x7f) → Translate mode", () => {
    const bytes = encodeFlutterKeyEvent({
      name: "flutter_key",
      usb_hid: 0x007f,
      lock_modes: 0,
      down: "true",
    });
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.controlKey).toBe(ControlKey.VolumeMute);
    expect(msg.keyEvent!.mode).toBe(KeyboardMode.Translate);
  });

  it("unknown usb_hid returns empty bytes", () => {
    const bytes = encodeFlutterKeyEvent({
      name: "x",
      usb_hid: 0xffff,
      lock_modes: 0,
      down: "true",
    });
    expect(bytes.length).toBe(0);
  });
});

describe("encodeCtrlAltDel", () => {
  it("creates KeyEvent with CtrlAltDel controlKey", () => {
    const bytes = encodeCtrlAltDel();
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.controlKey).toBe(ControlKey.CtrlAltDel);
    expect(msg.keyEvent!.mode).toBe(KeyboardMode.Legacy);
  });
});

describe("encodeLockScreen", () => {
  it("creates KeyEvent with LockScreen controlKey", () => {
    const bytes = encodeLockScreen();
    const msg = hbb.Message.decode(bytes);
    expect(msg.keyEvent!.controlKey).toBe(ControlKey.LockScreen);
    expect(msg.keyEvent!.mode).toBe(KeyboardMode.Legacy);
  });
});