import { hbb } from "../proto/index.js";
import { checkWs } from "../transport/check-ws.js";
import { WsTransport } from "../transport/ws-transport.js";
import { APP_VERSION, ConnType, NatType } from "../constants.js";

export interface RendezvousConfig {
  rendezvousServer: string;
  apiServer?: string;
  licenceKey?: string;
}

export interface PunchHoleResult {
  relayServer: string;
  uuid: string;
  signedIdPk: Uint8Array;
}

export interface OnlineQueryResult {
  onlines: string[];
  offlines: string[];
}

export function deriveOnlineEndpoint(rendezvousServer: string): string {
  if (!rendezvousServer) return "";
  const s = rendezvousServer.replace(/^[a-z]+:\/\//i, "");
  if (s.startsWith("[")) {
    const idx = s.indexOf("]");
    const host = s.slice(0, idx + 1);
    const port = parseInt(s.slice(idx + 2), 10);
    return Number.isNaN(port) ? s : `${host}:${port - 1}`;
  }
  const i = s.lastIndexOf(":");
  if (i < 0) return s;
  const host = s.slice(0, i);
  const port = parseInt(s.slice(i + 1), 10);
  return Number.isNaN(port) ? s : `${host}:${port - 1}`;
}

export function parseOnlineStates(peers: string[], states: Uint8Array): OnlineQueryResult {
  const onlines: string[] = [];
  const offlines: string[] = [];
  for (let i = 0; i < peers.length; i++) {
    const bit = 0x01 << (7 - (i % 8));
    const byte = states[Math.floor(i / 8)] ?? 0;
    if ((byte & bit) === bit) {
      onlines.push(peers[i]);
    } else {
      offlines.push(peers[i]);
    }
  }
  return { onlines, offlines };
}

function punchHoleFailureMsg(failure: number): string {
  switch (failure) {
    case 0: return "ID does not exist";
    case 2: return "Remote desktop is offline";
    case 3: return "Key mismatch";
    case 4: return "Key overuse";
    default: return `punch hole failure (${failure})`;
  }
}

function detectRendezvousMsgType(msg: hbb.RendezvousMessage): string {
  if (msg.punchHoleRequest) return "punch_hole_request";
  if (msg.punchHoleResponse) return "punch_hole_response";
  if (msg.registerPeer) return "register_peer";
  if (msg.registerPk) return "register_pk";
  if (msg.registerPkResponse) return "register_pk_response";
  if (msg.relayResponse) return "relay_response";
  if (msg.requestRelay) return "request_relay";
  if (msg.onlineRequest) return "online_request";
  if (msg.onlineResponse) return "online_response";
  if (msg.configureUpdate) return "configure_update";
  if (msg.softwareUpdate) return "software_update";
  if (msg.testNatRequest) return "test_nat_request";
  if (msg.testNatResponse) return "test_nat_response";
  if (msg.keyExchange) return "key_exchange";
  if (msg.registerPeerResponse) return "register_peer_response";
  if (msg.punchHole) return "punch_hole";
  if (msg.punchHoleSent) return "punch_hole_sent";
  if (msg.fetchLocalAddr) return "fetch_local_addr";
  if (msg.localAddr) return "local_addr";
  if (msg.peerDiscovery) return "peer_discovery";
  if (msg.hc) return "health_check";
  if (msg.httpProxyRequest) return "http_proxy_request";
  if (msg.httpProxyResponse) return "http_proxy_response";
  return "unknown/empty";
}

export class RendezvousClient {
  constructor(private config: RendezvousConfig) {}

  async connectForceRelay(
    peerId: string,
    connType: ConnType,
    token?: string,
  ): Promise<PunchHoleResult> {
    const maxRetries = 3;
    let lastErr: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const wsUrl = checkWs(this.config.rendezvousServer, {
        apiServer: this.config.apiServer,
      });
      let transport: WsTransport;
      try {
        transport = await WsTransport.connect(wsUrl);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        continue;
      }

      try {
        const req = hbb.RendezvousMessage.create({
          punchHoleRequest: {
            id: peerId,
            token: token ?? "",
            natType: NatType.SYMMETRIC,
            licenceKey: this.config.licenceKey ?? "",
            connType,
            version: APP_VERSION,
            udpPort: 0,
            forceRelay: true,
            upnpPort: 0,
            switchCode: "",
          },
        });
        transport.send(hbb.RendezvousMessage.encode(req).finish());

        const timeoutMs = attempt * 3000;
        let resp: hbb.RendezvousMessage | null = null;
        for (let i = 0; i < 2; i++) {
          const respBytes = await transport.recv(timeoutMs);
          const msg = hbb.RendezvousMessage.decode(respBytes);
          if (msg.keyExchange) {
            continue;
          }
          resp = msg;
          break;
        }
        transport.close();
        if (!resp) {
          throw new Error("rendezvous: only key_exchange received");
        }

        if (resp.relayResponse) {
          return {
            relayServer: resp.relayResponse.relayServer ?? "",
            uuid: resp.relayResponse.uuid ?? "",
            signedIdPk: resp.relayResponse.pk as Uint8Array,
          };
        }
        if (resp.punchHoleResponse) {
          const ph = resp.punchHoleResponse;
          const sa = ph.socketAddr as Uint8Array;
          if (sa && sa.length > 0) {
            return {
              relayServer: ph.relayServer ?? "",
              uuid: "",
              signedIdPk: ph.pk as Uint8Array,
            };
          }
          const otherFailure = ph.otherFailure ?? "";
          if (otherFailure) {
            throw new Error(`rendezvous: ${otherFailure}`);
          }
          const failure = ph.failure ?? 0;
          const failureMsg = punchHoleFailureMsg(failure);
          throw new Error(`rendezvous: ${failureMsg}`);
        }
        const msgType = detectRendezvousMsgType(resp);
        throw new Error(`rendezvous: unexpected response type: ${msgType}`);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        try { transport.close(); } catch { /* ignore */ }
      }
    }

    throw lastErr ?? new Error("rendezvous: all retries failed");
  }

  async queryOnlines(myId: string, peers: string[]): Promise<OnlineQueryResult> {
    if (peers.length === 0) return { onlines: [], offlines: [] };
    const onlineEndpoint = deriveOnlineEndpoint(this.config.rendezvousServer);
    const wsUrl = checkWs(onlineEndpoint, { apiServer: this.config.apiServer });
    const transport = await WsTransport.connect(wsUrl);
    try {
      const req = hbb.RendezvousMessage.create({
        onlineRequest: { id: myId, peers },
      });
      transport.send(hbb.RendezvousMessage.encode(req).finish());
      const respBytes = await transport.recv(6000);
      const resp = hbb.RendezvousMessage.decode(respBytes);
      if (!resp.onlineResponse) {
        throw new Error("rendezvous: no online_response");
      }
      const states = (resp.onlineResponse.states as Uint8Array) ?? new Uint8Array();
      return parseOnlineStates(peers, states);
    } finally {
      transport.close();
    }
  }
}