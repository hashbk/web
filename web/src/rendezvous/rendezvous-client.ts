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
        const respBytes = await transport.recv(timeoutMs);
        transport.close();
        const resp = hbb.RendezvousMessage.decode(respBytes);

        if (resp.relayResponse) {
          return {
            relayServer: resp.relayResponse.relayServer ?? "",
            uuid: resp.relayResponse.uuid ?? "",
            signedIdPk: resp.relayResponse.pk as Uint8Array,
          };
        }
        if (resp.punchHoleResponse) {
          const sa = resp.punchHoleResponse.socketAddr as Uint8Array;
          if (sa && sa.length > 0) {
            return {
              relayServer: resp.punchHoleResponse.relayServer ?? "",
              uuid: "",
              signedIdPk: resp.punchHoleResponse.pk as Uint8Array,
            };
          }
        }
        throw new Error("rendezvous: unexpected response (no relay_response/punch_hole_response)");
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