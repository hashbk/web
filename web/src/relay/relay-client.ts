import { hbb } from "../proto/index.js";
import { checkWs } from "../transport/check-ws.js";
import { WsTransport } from "../transport/ws-transport.js";
import { createSymmetricKeyMsg, decodeIdPk, getRsPubKey } from "../crypto/handshake.js";
import { computePassword } from "../crypto/password.js";
import { APP_VERSION, ConnType, DEFAULT_RS_PUB_KEY, RELAY_PORT } from "../constants.js";

function ensureRelayPort(endpoint: string): string {
  if (!endpoint) return endpoint;
  const s = endpoint.replace(/^[a-z]+:\/\//i, "");
  if (s.startsWith("[")) {
    const idx = s.indexOf("]");
    if (idx !== -1 && s.slice(idx + 1).startsWith(":")) return endpoint;
    return `${endpoint}:${RELAY_PORT}`;
  }
  const lastColon = s.lastIndexOf(":");
  if (lastColon === -1) return `${endpoint}:${RELAY_PORT}`;
  return endpoint;
}

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
  salt: string;
  challenge: string;
  fileTransfer?: { dir: string; showHidden: boolean };
  viewCamera?: Record<string, never>;
  terminal?: { serviceId: string };
  avatar?: string;
}

export interface LoginResult {
  peerInfo?: hbb.IPeerInfo;
  error?: string;
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
    const wsUrl = checkWs(ensureRelayPort(relayServer), { apiServer: this.config.apiServer });
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
      const emptyMsg = hbb.Message.create({});
      this.transport.send(hbb.Message.encode(emptyMsg).finish());
      return;
    }
    const { id, pk: peerSignPk } = decodeIdPk(signedIdPk, rsPk);
    if (id !== peerId) throw new Error(`peer id mismatch: ${id} != ${peerId}`);

    const signedIdBytes = await this.transport.recv(15000);
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

  async recvHash(): Promise<{ salt: string; challenge: string }> {
    if (!this.transport) throw new Error("relay not connected");
    const hashBytes = await this.transport.recv(15000);
    const hashMsg = hbb.Message.decode(hashBytes);
    if (!hashMsg.hash) throw new Error("expected hash challenge");
    return {
      salt: hashMsg.hash.salt ?? "",
      challenge: hashMsg.hash.challenge ?? "",
    };
  }

  async login(params: LoginParams): Promise<LoginResult> {
    if (!this.transport) throw new Error("relay not connected");
    const password = await computePassword(
      params.password,
      params.salt,
      params.challenge,
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
        fileTransfer: params.fileTransfer
          ? { dir: params.fileTransfer.dir, showHidden: params.fileTransfer.showHidden }
          : undefined,
        viewCamera: params.viewCamera,
        terminal: params.terminal,
        avatar: params.avatar,
      },
    });
    this.transport.send(hbb.Message.encode(loginMsg).finish());

    let respBytes = await this.transport.recv(15000);
    let respMsg = hbb.Message.decode(respBytes);
    while (!respMsg.loginResponse) {
      this.transport.pushEarlyMessage(respBytes);
      respBytes = await this.transport.recv(15000);
      respMsg = hbb.Message.decode(respBytes);
    }
    if (respMsg.loginResponse) {
      if (respMsg.loginResponse.error) {
        return { error: respMsg.loginResponse.error };
      }
      if (respMsg.loginResponse.peerInfo) {
        return { peerInfo: respMsg.loginResponse.peerInfo };
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