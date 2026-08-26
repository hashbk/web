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

export class RendezvousClient {
  constructor(private config: RendezvousConfig) {}

  async connectForceRelay(
    peerId: string,
    connType: ConnType,
    token?: string,
  ): Promise<PunchHoleResult> {
    const wsUrl = checkWs(this.config.rendezvousServer, {
      apiServer: this.config.apiServer,
    });
    const transport = await WsTransport.connect(wsUrl);

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

    const respBytes = await transport.recv();
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
  }
}