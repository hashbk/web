import { RendezvousClient } from "../rendezvous/rendezvous-client.js";
import type { RendezvousConfig } from "../rendezvous/rendezvous-client.js";
import { RelayClient } from "../relay/relay-client.js";
import type { LoginParams, PeerInfo, RelayConfig } from "../relay/relay-client.js";
import { initSodium } from "../crypto/sodium.js";
import { ConnType } from "../constants.js";

export interface SessionConfig {
  rendezvousServer: string;
  apiServer?: string;
  licenceKey?: string;
  rsPubKey?: string;
}

export interface ConnectParams {
  peerId: string;
  password: string;
  myId: string;
  myName: string;
  myPlatform: string;
  connType?: ConnType;
}

export class SessionManager {
  private rendezvous: RendezvousClient;
  private relay: RelayClient;

  constructor(config: SessionConfig) {
    const rendezvousConfig: RendezvousConfig = {
      rendezvousServer: config.rendezvousServer,
      apiServer: config.apiServer,
      licenceKey: config.licenceKey,
    };
    const relayConfig: RelayConfig = {
      apiServer: config.apiServer,
      licenceKey: config.licenceKey,
      rsPubKey: config.rsPubKey,
    };
    this.rendezvous = new RendezvousClient(rendezvousConfig);
    this.relay = new RelayClient(relayConfig);
  }

  async connect(params: ConnectParams): Promise<PeerInfo> {
    await initSodium();
    const connType = params.connType ?? ConnType.DEFAULT_CONN;

    const result = await this.rendezvous.connectForceRelay(
      params.peerId,
      connType,
    );
    await this.relay.connect(
      result.relayServer,
      result.uuid,
      params.peerId,
      connType,
    );
    await this.relay.secureConnection(params.peerId, result.signedIdPk);

    const sessionId = Math.floor(Math.random() * 0xffffffff);
    const loginParams: LoginParams = {
      peerId: params.peerId,
      password: params.password,
      myId: params.myId,
      myName: params.myName,
      myPlatform: params.myPlatform,
      connType,
      sessionId,
    };
    return this.relay.login(loginParams);
  }

  getRelayTransport() {
    return this.relay.getTransport();
  }

  close(): void {
    this.relay.close();
  }
}