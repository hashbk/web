import { RENDEZVOUS_PORT, RELAY_PORT } from "../constants.js";

export interface CheckWsOptions {
  useWs?: boolean;
  apiServer?: string;
  rendezvousPort?: number;
  relayPort?: number;
}

function isWsEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("ws://") || endpoint.startsWith("wss://");
}

function isIpHost(host: string): boolean {
  if (host.startsWith("[")) return true;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function splitHostPort(endpoint: string): { host: string; port: number } {
  const s = endpoint.replace(/^[a-z]+:\/\//i, "");
  if (s.startsWith("[")) {
    const idx = s.indexOf("]");
    const host = s.slice(0, idx + 1);
    const port = parseInt(s.slice(idx + 2), 10);
    return { host, port };
  }
  const i = s.lastIndexOf(":");
  return { host: s.slice(0, i), port: parseInt(s.slice(i + 1), 10) };
}

export function checkWs(endpoint: string, opts: CheckWsOptions = {}): string {
  const useWs = opts.useWs ?? true;
  if (!useWs || endpoint === "" || isWsEndpoint(endpoint)) return endpoint;
  const { host, port } = splitHostPort(endpoint);
  const rendezvousPort = opts.rendezvousPort ?? RENDEZVOUS_PORT;
  const relayPort = opts.relayPort ?? RELAY_PORT;

  let relay: boolean;
  let dstPort: number;
  if (port === rendezvousPort) {
    relay = false;
    dstPort = port + 2;
  } else if (port === rendezvousPort - 1) {
    relay = false;
    dstPort = port + 3;
  } else if (port === relayPort || port === rendezvousPort + 1) {
    relay = true;
    dstPort = port + 2;
  } else {
    relay = true;
    dstPort = port + 2;
  }

  const isDomain = !isIpHost(host);
  let address: string;
  if (isDomain) {
    const path = relay ? "/ws/relay" : "/ws/id";
    address = `${host}${path}`;
  } else {
    address = `${host}:${dstPort}`;
  }
  const protocol = isDomain
    ? opts.apiServer?.startsWith("https") ? "wss" : "ws"
    : "ws";
  return `${protocol}://${address}`;
}

export function isWsEndpointUrl(endpoint: string): boolean {
  return isWsEndpoint(endpoint);
}