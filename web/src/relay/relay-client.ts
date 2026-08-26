import { hbb } from "../proto/index.js";
import { checkWs } from "../transport/check-ws.js";
import { WsTransport } from "../transport/ws-transport.js";
import { createSymmetricKeyMsg, decodeIdPk, getRsPubKey } from "../crypto/handshake.js";
import { computePassword } from "../crypto/password.js";
import { APP_VERSION, ConnType, DEFAULT_RS_PUB_KEY } from "../constants.js";

export interface RelayConfig {
  apiServer?: string;
  licenceKey?: string;
  rsPubKey?: string;
}

export interface LoginParams {
  peerId: string;
  password: string;
  myId: string;
  myName: string;
  myPlatform: string;
  connType: ConnType;
  sessionId: number;
}

export interface PeerInfo {
  username: string;
  hostname: string;
  platform: string;
  version: string;
}

export class RelayClient {
  private transport: WsTransport | null = null;

  constructor(private config: RelayConfig) {}

  async connect(
    relayServer: string,
    uuid: string,
    peerId: string,
    connType: ConnType,
  ): Promise<void> {
    const wsUrl = checkWs(relayServer, { apiServer: this.config.apiServer });
    this.transport = await WsTransport.connect(wsUrl);

    const req = hbb.RendezvousMessage.create({
      requestRelay: {
        licenceKey: this.config.licenceKey ?? "",
        id: peerId,
        uuid,
        connType,
      },
    });
    this.transport.send(hbb.RendezvousMessage.encode(req).finish());
  }

  async secureConnection(peerId: string, signedIdPk: Uint8Array): Promise<void> {
    if (!this.transport) throw new Error("relay not connected");
    const rsPk = getRsPubKey(this.config.rsPubKey ?? DEFAULT_RS_PUB_KEY);
    if (!signedIdPk || signedIdPk.length === 0) {
      throw new Error("missing signed_id_pk");
    }
    const { id, pk: peerSignPk } = decodeIdPk(signedIdPk, rsPk);
    if (id !== peerId) throw new Error(`peer id mismatch: ${id} != ${peerId}`);

    const signedIdBytes = await this.transport.recv();
    const signedIdMsg = hbb.Message.decode(signedIdBytes);
    if (!signedIdMsg.signedId) throw new Error("expected signed_id from peer");
    const decoded = decodeIdPk(
      signedIdMsg.signedId.id as Uint8Array,
      peerSignPk,
    );
    if (decoded.id !== peerId) {
      throw new Error(`signed_id peer id mismatch: ${decoded.id} != ${peerId}`);
    }
    const theirBoxPk = decoded.pk;

    const { asymmetricValue, symmetricValue, key } = createSymmetricKeyMsg(theirBoxPk);
    const pubKeyMsg = hbb.Message.create({
      publicKey: { asymmetricValue, symmetricValue },
    });
    this.transport.send(hbb.Message.encode(pubKeyMsg).finish());
    this.transport.setKey(key);
  }

  async login(params: LoginParams): Promise<PeerInfo> {
    if (!this.transport) throw new Error("relay not connected");
    const hashBytes = await this.transport.recv();
    const hashMsg = hbb.Message.decode(hashBytes);
    if (!hashMsg.hash) throw new Error("expected hash challenge");
    const password = await computePassword(
      params.password,
      hashMsg.hash.salt ?? "",
      hashMsg.hash.challenge ?? "",
    );

    const loginMsg = hbb.Message.create({
      loginRequest: {
        username: params.peerId,
        password,
        myId: params.myId,
        myName: params.myName,
        myPlatform: params.myPlatform,
        version: APP_VERSION,
        sessionId: params.sessionId as unknown as never,
        videoAckRequired: false,
      },
    });
    this.transport.send(hbb.Message.encode(loginMsg).finish());

    const respBytes = await this.transport.recv();
    const respMsg = hbb.Message.decode(respBytes);
    if (respMsg.loginResponse) {
      if (respMsg.loginResponse.error) {
        throw new Error(`login failed: ${respMsg.loginResponse.error}`);
      }
      if (respMsg.loginResponse.peerInfo) {
        const pi = respMsg.loginResponse.peerInfo;
        return {
          username: pi.username ?? "",
          hostname: pi.hostname ?? "",
          platform: pi.platform ?? "",
          version: pi.version ?? "",
        };
      }
    }
    throw new Error("login: unexpected response");
  }

  getTransport(): WsTransport | null {
    return this.transport;
  }

  close(): void {
    this.transport?.close();
    this.transport = null;
  }
}