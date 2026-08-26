import { hbb } from "../proto/index.js";
import {
  ControlKey,
  KeyboardMode,
  KeyMapping,
  lookupKey,
  usbHidToKey,
} from "./key-codes.js";

export interface InputKeyJson {
  name: string;
  down?: string;
  press?: string;
  alt?: string;
  ctrl?: string;
  shift?: string;
  command?: string;
}

export interface FlutterKeyEventJson {
  name: string;
  usb_hid: number;
  lock_modes: number;
  down?: string;
}

function buildLegacyModifiers(
  keyEvent: hbb.IKeyEvent,
  alt: boolean,
  ctrl: boolean,
  shift: boolean,
  command: boolean,
): void {
  if (alt) keyEvent.modifiers!.push(ControlKey.Alt);
  if (shift) keyEvent.modifiers!.push(ControlKey.Shift);
  if (ctrl) keyEvent.modifiers!.push(ControlKey.Control);
  if (command) keyEvent.modifiers!.push(ControlKey.Meta);
}

function applyKeyMapping(keyEvent: hbb.IKeyEvent, mapping: KeyMapping): void {
  if (mapping.controlKey !== undefined) {
    keyEvent.controlKey = mapping.controlKey;
  } else if (mapping.chr !== undefined) {
    keyEvent.chr = mapping.chr;
  }
}

export function encodeInputKey(json: InputKeyJson): Uint8Array {
  const mapping = lookupKey(json.name);
  if (!mapping) return new Uint8Array(0);

  const keyEvent: hbb.IKeyEvent = {
    modifiers: [],
    mode: KeyboardMode.Legacy,
  };

  applyKeyMapping(keyEvent, mapping);

  if (json.press !== undefined) {
    keyEvent.press = true;
  } else if (json.down !== undefined) {
    keyEvent.down = true;
  }

  buildLegacyModifiers(
    keyEvent,
    json.alt !== undefined,
    json.ctrl !== undefined,
    json.shift !== undefined,
    json.command !== undefined,
  );

  const msg = hbb.Message.create({ keyEvent });
  return hbb.Message.encode(msg).finish();
}

export function encodeInputKeyFromJson(jsonStr: string): Uint8Array {
  return encodeInputKey(JSON.parse(jsonStr) as InputKeyJson);
}

export function encodeInputString(value: string): Uint8Array {
  const keyEvent: hbb.IKeyEvent = {
    seq: value,
    modifiers: [],
    mode: KeyboardMode.Legacy,
  };
  const msg = hbb.Message.create({ keyEvent });
  return hbb.Message.encode(msg).finish();
}

export function encodeFlutterKeyEvent(json: FlutterKeyEventJson): Uint8Array {
  if (json.name === "flutter_key") {
    const ctrlKey = matchFlutterKeySpecial(json.usb_hid);
    if (ctrlKey === undefined) return new Uint8Array(0);
    const keyEvent: hbb.IKeyEvent = {
      controlKey: ctrlKey,
      down: json.down !== undefined,
      modifiers: [],
      mode: KeyboardMode.Translate,
    };
    const msg = hbb.Message.create({ keyEvent });
    return hbb.Message.encode(msg).finish();
  }

  const mapping = usbHidToKey(json.usb_hid);
  if (!mapping) return new Uint8Array(0);

  const keyEvent: hbb.IKeyEvent = {
    modifiers: [],
    mode: KeyboardMode.Map,
  };

  applyKeyMapping(keyEvent, mapping);

  if (json.down !== undefined) {
    keyEvent.down = true;
  }

  const msg = hbb.Message.create({ keyEvent });
  return hbb.Message.encode(msg).finish();
}

export function encodeFlutterKeyEventFromJson(jsonStr: string): Uint8Array {
  return encodeFlutterKeyEvent(JSON.parse(jsonStr) as FlutterKeyEventJson);
}

function matchFlutterKeySpecial(platformCode: number): hbb.ControlKey | undefined {
  switch (platformCode) {
    case 0x007f: return ControlKey.VolumeMute;
    case 0x0080: return ControlKey.VolumeUp;
    case 0x0081: return ControlKey.VolumeDown;
    case 0x0066: return ControlKey.Power;
    default: return undefined;
  }
}

export function encodeCtrlAltDel(): Uint8Array {
  const keyEvent: hbb.IKeyEvent = {
    controlKey: ControlKey.CtrlAltDel,
    modifiers: [],
    mode: KeyboardMode.Legacy,
  };
  const msg = hbb.Message.create({ keyEvent });
  return hbb.Message.encode(msg).finish();
}

export function encodeLockScreen(): Uint8Array {
  const keyEvent: hbb.IKeyEvent = {
    controlKey: ControlKey.LockScreen,
    modifiers: [],
    mode: KeyboardMode.Legacy,
  };
  const msg = hbb.Message.create({ keyEvent });
  return hbb.Message.encode(msg).finish();
}