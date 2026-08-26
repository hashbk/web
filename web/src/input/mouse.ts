import { hbb } from "../proto/index.js";
import {
  ControlKey,
  MOUSE_TYPE_DOWN,
  MOUSE_TYPE_UP,
  MOUSE_TYPE_WHEEL,
  MOUSE_TYPE_TRACKPAD,
  MOUSE_TYPE_MOVE_RELATIVE,
  MOUSE_BUTTON_LEFT,
  MOUSE_BUTTON_RIGHT,
  MOUSE_BUTTON_WHEEL,
  MOUSE_BUTTON_BACK,
  MOUSE_BUTTON_FORWARD,
} from "./key-codes.js";

export interface MouseJson {
  type?: string;
  buttons?: string;
  x?: string;
  y?: string;
  alt?: string;
  ctrl?: string;
  shift?: string;
  command?: string;
  [key: string]: string | undefined;
}

export function buildMask(json: MouseJson): number {
  let mask = 0;
  if (json.type) {
    mask = matchType(json.type);
  }
  if (json.buttons) {
    mask |= matchButton(json.buttons) << 3;
  }
  return mask;
}

function matchType(type: string): number {
  switch (type) {
    case "down": return MOUSE_TYPE_DOWN;
    case "up": return MOUSE_TYPE_UP;
    case "wheel": return MOUSE_TYPE_WHEEL;
    case "trackpad": return MOUSE_TYPE_TRACKPAD;
    case "move_relative": return MOUSE_TYPE_MOVE_RELATIVE;
    default: return 0;
  }
}

function matchButton(buttons: string): number {
  switch (buttons) {
    case "left": return MOUSE_BUTTON_LEFT;
    case "right": return MOUSE_BUTTON_RIGHT;
    case "wheel": return MOUSE_BUTTON_WHEEL;
    case "back": return MOUSE_BUTTON_BACK;
    case "forward": return MOUSE_BUTTON_FORWARD;
    default: return 0;
  }
}

export function buildModifiers(
  alt: boolean,
  ctrl: boolean,
  shift: boolean,
  command: boolean,
): hbb.ControlKey[] {
  const mods: hbb.ControlKey[] = [];
  if (alt) mods.push(ControlKey.Alt);
  if (shift) mods.push(ControlKey.Shift);
  if (ctrl) mods.push(ControlKey.Control);
  if (command) mods.push(ControlKey.Meta);
  return mods;
}

export function encodeMouseEvent(json: MouseJson): Uint8Array {
  const mask = buildMask(json);
  const x = json.x ? parseInt(json.x, 10) || 0 : 0;
  const y = json.y ? parseInt(json.y, 10) || 0 : 0;
  const modifiers = buildModifiers(
    json.alt !== undefined,
    json.ctrl !== undefined,
    json.shift !== undefined,
    json.command !== undefined,
  );
  const msg = hbb.Message.create({
    mouseEvent: { mask, x, y, modifiers },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeMouseEventFromJson(jsonStr: string): Uint8Array {
  return encodeMouseEvent(JSON.parse(jsonStr) as MouseJson);
}