import { hbb } from "../proto/index.js";

export const ControlKey = hbb.ControlKey;
export const KeyboardMode = hbb.KeyboardMode;

export const MOUSE_TYPE_MOVE = 0;
export const MOUSE_TYPE_DOWN = 1;
export const MOUSE_TYPE_UP = 2;
export const MOUSE_TYPE_WHEEL = 3;
export const MOUSE_TYPE_TRACKPAD = 4;
export const MOUSE_TYPE_MOVE_RELATIVE = 5;
export const MOUSE_TYPE_MASK = 0x7;

export const MOUSE_BUTTON_LEFT = 0x01;
export const MOUSE_BUTTON_RIGHT = 0x02;
export const MOUSE_BUTTON_WHEEL = 0x04;
export const MOUSE_BUTTON_BACK = 0x08;
export const MOUSE_BUTTON_FORWARD = 0x10;

export const LOCK_CAPSLOCK = 1 << 1;
export const LOCK_NUMLOCK = 1 << 2;
export const LOCK_SCROLLLOCK = 1 << 3;

export interface KeyMapping {
  controlKey?: hbb.ControlKey;
  chr?: number;
}

export const KEY_MAP: Record<string, KeyMapping> = {
  VK_A: { chr: 97 },
  VK_B: { chr: 98 },
  VK_C: { chr: 99 },
  VK_D: { chr: 100 },
  VK_E: { chr: 101 },
  VK_F: { chr: 102 },
  VK_G: { chr: 103 },
  VK_H: { chr: 104 },
  VK_I: { chr: 105 },
  VK_J: { chr: 106 },
  VK_K: { chr: 107 },
  VK_L: { chr: 108 },
  VK_M: { chr: 109 },
  VK_N: { chr: 110 },
  VK_O: { chr: 111 },
  VK_P: { chr: 112 },
  VK_Q: { chr: 113 },
  VK_R: { chr: 114 },
  VK_S: { chr: 115 },
  VK_T: { chr: 116 },
  VK_U: { chr: 117 },
  VK_V: { chr: 118 },
  VK_W: { chr: 119 },
  VK_X: { chr: 120 },
  VK_Y: { chr: 121 },
  VK_Z: { chr: 122 },
  VK_0: { chr: 48 },
  VK_1: { chr: 49 },
  VK_2: { chr: 50 },
  VK_3: { chr: 51 },
  VK_4: { chr: 52 },
  VK_5: { chr: 53 },
  VK_6: { chr: 54 },
  VK_7: { chr: 55 },
  VK_8: { chr: 56 },
  VK_9: { chr: 57 },
  VK_COMMA: { chr: 44 },
  VK_SLASH: { chr: 47 },
  VK_SEMICOLON: { chr: 59 },
  VK_QUOTE: { chr: 39 },
  VK_LBRACKET: { chr: 91 },
  VK_RBRACKET: { chr: 93 },
  VK_BACKSLASH: { chr: 92 },
  VK_MINUS: { chr: 45 },
  VK_PLUS: { chr: 61 },
  VK_DIVIDE: { controlKey: hbb.ControlKey.Divide },
  VK_MULTIPLY: { controlKey: hbb.ControlKey.Multiply },
  VK_SUBTRACT: { controlKey: hbb.ControlKey.Subtract },
  VK_ADD: { controlKey: hbb.ControlKey.Add },
  VK_DECIMAL: { controlKey: hbb.ControlKey.Decimal },
  VK_F1: { controlKey: hbb.ControlKey.F1 },
  VK_F2: { controlKey: hbb.ControlKey.F2 },
  VK_F3: { controlKey: hbb.ControlKey.F3 },
  VK_F4: { controlKey: hbb.ControlKey.F4 },
  VK_F5: { controlKey: hbb.ControlKey.F5 },
  VK_F6: { controlKey: hbb.ControlKey.F6 },
  VK_F7: { controlKey: hbb.ControlKey.F7 },
  VK_F8: { controlKey: hbb.ControlKey.F8 },
  VK_F9: { controlKey: hbb.ControlKey.F9 },
  VK_F10: { controlKey: hbb.ControlKey.F10 },
  VK_F11: { controlKey: hbb.ControlKey.F11 },
  VK_F12: { controlKey: hbb.ControlKey.F12 },
  VK_ENTER: { controlKey: hbb.ControlKey.Return },
  VK_CANCEL: { controlKey: hbb.ControlKey.Cancel },
  VK_BACK: { controlKey: hbb.ControlKey.Backspace },
  VK_TAB: { controlKey: hbb.ControlKey.Tab },
  VK_CLEAR: { controlKey: hbb.ControlKey.Clear },
  VK_RETURN: { controlKey: hbb.ControlKey.Return },
  VK_SHIFT: { controlKey: hbb.ControlKey.Shift },
  VK_CONTROL: { controlKey: hbb.ControlKey.Control },
  VK_MENU: { controlKey: hbb.ControlKey.Alt },
  VK_PAUSE: { controlKey: hbb.ControlKey.Pause },
  VK_CAPITAL: { controlKey: hbb.ControlKey.CapsLock },
  VK_KANA: { controlKey: hbb.ControlKey.Kana },
  VK_HANGUL: { controlKey: hbb.ControlKey.Hangul },
  VK_JUNJA: { controlKey: hbb.ControlKey.Junja },
  VK_FINAL: { controlKey: hbb.ControlKey.Final },
  VK_HANJA: { controlKey: hbb.ControlKey.Hanja },
  VK_KANJI: { controlKey: hbb.ControlKey.Kanji },
  VK_ESCAPE: { controlKey: hbb.ControlKey.Escape },
  VK_CONVERT: { controlKey: hbb.ControlKey.Convert },
  VK_SPACE: { controlKey: hbb.ControlKey.Space },
  VK_PRIOR: { controlKey: hbb.ControlKey.PageUp },
  VK_NEXT: { controlKey: hbb.ControlKey.PageDown },
  VK_END: { controlKey: hbb.ControlKey.End },
  VK_HOME: { controlKey: hbb.ControlKey.Home },
  VK_LEFT: { controlKey: hbb.ControlKey.LeftArrow },
  VK_UP: { controlKey: hbb.ControlKey.UpArrow },
  VK_RIGHT: { controlKey: hbb.ControlKey.RightArrow },
  VK_DOWN: { controlKey: hbb.ControlKey.DownArrow },
  VK_SELECT: { controlKey: hbb.ControlKey.Select },
  VK_PRINT: { controlKey: hbb.ControlKey.Print },
  VK_EXECUTE: { controlKey: hbb.ControlKey.Execute },
  VK_SNAPSHOT: { controlKey: hbb.ControlKey.Snapshot },
  VK_SCROLL: { controlKey: hbb.ControlKey.Scroll },
  VK_INSERT: { controlKey: hbb.ControlKey.Insert },
  VK_DELETE: { controlKey: hbb.ControlKey.Delete },
  VK_HELP: { controlKey: hbb.ControlKey.Help },
  VK_SLEEP: { controlKey: hbb.ControlKey.Sleep },
  VK_SEPARATOR: { controlKey: hbb.ControlKey.Separator },
  VK_NUMPAD0: { controlKey: hbb.ControlKey.Numpad0 },
  VK_NUMPAD1: { controlKey: hbb.ControlKey.Numpad1 },
  VK_NUMPAD2: { controlKey: hbb.ControlKey.Numpad2 },
  VK_NUMPAD3: { controlKey: hbb.ControlKey.Numpad3 },
  VK_NUMPAD4: { controlKey: hbb.ControlKey.Numpad4 },
  VK_NUMPAD5: { controlKey: hbb.ControlKey.Numpad5 },
  VK_NUMPAD6: { controlKey: hbb.ControlKey.Numpad6 },
  VK_NUMPAD7: { controlKey: hbb.ControlKey.Numpad7 },
  VK_NUMPAD8: { controlKey: hbb.ControlKey.Numpad8 },
  VK_NUMPAD9: { controlKey: hbb.ControlKey.Numpad9 },
  Apps: { controlKey: hbb.ControlKey.Apps },
  Meta: { controlKey: hbb.ControlKey.Meta },
  RAlt: { controlKey: hbb.ControlKey.RAlt },
  RWin: { controlKey: hbb.ControlKey.RWin },
  RControl: { controlKey: hbb.ControlKey.RControl },
  RShift: { controlKey: hbb.ControlKey.RShift },
  CTRL_ALT_DEL: { controlKey: hbb.ControlKey.CtrlAltDel },
  LOCK_SCREEN: { controlKey: hbb.ControlKey.LockScreen },
};

const USB_HID_TO_CONTROL_KEY: Record<number, hbb.ControlKey> = {
  0x28: hbb.ControlKey.Return,
  0x29: hbb.ControlKey.Escape,
  0x2a: hbb.ControlKey.Backspace,
  0x2b: hbb.ControlKey.Tab,
  0x2c: hbb.ControlKey.Space,
  0x39: hbb.ControlKey.CapsLock,
  0x3a: hbb.ControlKey.F1,
  0x3b: hbb.ControlKey.F2,
  0x3c: hbb.ControlKey.F3,
  0x3d: hbb.ControlKey.F4,
  0x3e: hbb.ControlKey.F5,
  0x3f: hbb.ControlKey.F6,
  0x40: hbb.ControlKey.F7,
  0x41: hbb.ControlKey.F8,
  0x42: hbb.ControlKey.F9,
  0x43: hbb.ControlKey.F10,
  0x44: hbb.ControlKey.F11,
  0x45: hbb.ControlKey.F12,
  0x46: hbb.ControlKey.Print,
  0x47: hbb.ControlKey.Scroll,
  0x48: hbb.ControlKey.Pause,
  0x49: hbb.ControlKey.Insert,
  0x4a: hbb.ControlKey.Home,
  0x4b: hbb.ControlKey.PageUp,
  0x4c: hbb.ControlKey.Delete,
  0x4d: hbb.ControlKey.End,
  0x4e: hbb.ControlKey.PageDown,
  0x4f: hbb.ControlKey.RightArrow,
  0x50: hbb.ControlKey.LeftArrow,
  0x51: hbb.ControlKey.DownArrow,
  0x52: hbb.ControlKey.UpArrow,
  0x53: hbb.ControlKey.NumLock,
  0x54: hbb.ControlKey.Divide,
  0x55: hbb.ControlKey.Multiply,
  0x56: hbb.ControlKey.Subtract,
  0x57: hbb.ControlKey.Add,
  0x58: hbb.ControlKey.NumpadEnter,
  0x59: hbb.ControlKey.Numpad1,
  0x5a: hbb.ControlKey.Numpad2,
  0x5b: hbb.ControlKey.Numpad3,
  0x5c: hbb.ControlKey.Numpad4,
  0x5d: hbb.ControlKey.Numpad5,
  0x5e: hbb.ControlKey.Numpad6,
  0x5f: hbb.ControlKey.Numpad7,
  0x60: hbb.ControlKey.Numpad8,
  0x61: hbb.ControlKey.Numpad9,
  0x62: hbb.ControlKey.Numpad0,
  0x63: hbb.ControlKey.Decimal,
  0x65: hbb.ControlKey.Apps,
  0x66: hbb.ControlKey.Power,
  0xe0: hbb.ControlKey.Control,
  0xe1: hbb.ControlKey.Shift,
  0xe2: hbb.ControlKey.Alt,
  0xe3: hbb.ControlKey.Meta,
  0xe4: hbb.ControlKey.RControl,
  0xe5: hbb.ControlKey.RShift,
  0xe6: hbb.ControlKey.RAlt,
  0xe7: hbb.ControlKey.RWin,
};

const USB_HID_TO_CHR: Record<number, number> = {
  0x04: 97, 0x05: 98, 0x06: 99, 0x07: 100, 0x08: 101, 0x09: 102,
  0x0a: 103, 0x0b: 104, 0x0c: 105, 0x0d: 106, 0x0e: 107, 0x0f: 108,
  0x10: 109, 0x11: 110, 0x12: 111, 0x13: 112, 0x14: 113, 0x15: 114,
  0x16: 115, 0x17: 116, 0x18: 117, 0x19: 118, 0x1a: 119, 0x1b: 120,
  0x1c: 121, 0x1d: 122,
  0x1e: 49, 0x1f: 50, 0x20: 51, 0x21: 52, 0x22: 53,
  0x23: 54, 0x24: 55, 0x25: 56, 0x26: 57, 0x27: 48,
  0x2d: 45, 0x2e: 61, 0x2f: 91, 0x30: 93, 0x31: 92,
  0x33: 59, 0x34: 39, 0x35: 96, 0x36: 44, 0x37: 46, 0x38: 47,
};

export function usbHidToKey(usbHid: number): KeyMapping | undefined {
  const ck = USB_HID_TO_CONTROL_KEY[usbHid];
  if (ck !== undefined) return { controlKey: ck };
  const chr = USB_HID_TO_CHR[usbHid];
  if (chr !== undefined) return { chr };
  return undefined;
}

export function lookupKey(name: string): KeyMapping | undefined {
  const chars = [...name];
  if (chars.length === 1) {
    return { chr: chars[0].charCodeAt(0) };
  }
  return KEY_MAP[name];
}
