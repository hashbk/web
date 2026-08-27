import { RendezvousClient } from "../rendezvous/rendezvous-client.js";
import type { RendezvousConfig } from "../rendezvous/rendezvous-client.js";
import { RelayClient } from "../relay/relay-client.js";
import type { LoginParams, RelayConfig } from "../relay/relay-client.js";
import { initSodium } from "../crypto/sodium.js";
import { ConnType } from "../constants.js";
import { VideoDecoderManager } from "../video/video-decoder.js";
import { MessageDispatcher } from "./message-dispatcher.js";
import { buildConnectionReadyEventJson } from "./message-dispatcher.js";

import { hbb } from "../proto/index.js";

export interface SessionConfig {
  rendezvousServer: string;
  apiServer?: string;
  licenceKey?: string;
  rsPubKey?: string;
  onGlobalEvent?: (json: string) => void;
  onVideoFrame?: (display: number, frame: unknown) => void;
  onRgba?: (display: number, rgba: Uint8Array) => void;
  onFileResponse?: (fileResponse: hbb.IFileResponse) => void;
  onFileAction?: (fileAction: hbb.IFileAction) => void;
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
  private videoDecoder: VideoDecoderManager;
  private dispatcher: MessageDispatcher | null = null;
  private onGlobalEvent?: (json: string) => void;

  constructor(config: SessionConfig) {
    this.onGlobalEvent = config.onGlobalEvent;
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

    this.videoDecoder = new VideoDecoderManager({
      onVideoFrame: config.onVideoFrame,
      onRgba: config.onRgba,
    });

    this.dispatcher = new MessageDispatcher(this.videoDecoder, {
      onGlobalEvent: config.onGlobalEvent,
      onFileResponse: config.onFileResponse,
      onFileAction: config.onFileAction,
    });
  }

  async connect(params: ConnectParams): Promise<hbb.IPeerInfo> {
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

    const relayTransport = this.relay.getTransport();
    const isSecured = relayTransport ? relayTransport.isSecured() : false;
    this.onGlobalEvent?.(
      buildConnectionReadyEventJson(isSecured, false, ""),
    );

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
    const peerInfo = await this.relay.login(loginParams);

    this.installMessageDispatcher();

    return peerInfo;
  }

  private installMessageDispatcher(): void {
    const transport = this.relay.getTransport();
    if (!transport || !this.dispatcher) return;
    transport.onMessage = (bytes: Uint8Array) => {
      this.dispatcher!.dispatch(bytes);
    };
  }

  getRelayTransport() {
    return this.relay.getTransport();
  }

  getVideoDecoder(): VideoDecoderManager {
    return this.videoDecoder;
  }

  setFileResponseHandler(
    handler: (fr: hbb.IFileResponse) => void,
  ): void {
    if (this.dispatcher) {
      this.dispatcher.setFileResponseHandler(handler);
    }
  }

  close(): void {
    this.videoDecoder.close();
    this.relay.close();
  }
}
