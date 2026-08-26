export const RENDEZVOUS_PORT = 21116;
export const RELAY_PORT = 21117;
export const WS_RENDEZVOUS_PORT = 21118;
export const WS_RELAY_PORT = 21119;
export const DEFAULT_RS_PUB_KEY = "OeVuKk5nlHiXp+APNn0Y3pC1Iwpwn44JGqrQCsWqmBw=";
export const APP_VERSION = "1.4.9";
export const CONNECT_TIMEOUT_MS = 18_000;
export const REG_INTERVAL_MS = 15_000;

export enum NatType {
  UNKNOWN_NAT = 0,
  ASYMMETRIC = 1,
  SYMMETRIC = 2,
}

export enum ConnType {
  DEFAULT_CONN = 0,
  FILE_TRANSFER = 1,
  PORT_FORWARD = 2,
  RDP = 3,
  VIEW_CAMERA = 4,
  TERMINAL = 5,
}