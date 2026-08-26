import { SessionManager } from "../session/session-manager.js";
import type { SessionConfig } from "../session/session-manager.js";
import { ConnType } from "../constants.js";

export interface BridgeConfig extends SessionConfig {}

interface SessionEntry {
  manager: SessionManager;
  peerId: string;
  connected: boolean;
}

export class BridgeDispatcher {
  private sessions = new Map<string, SessionEntry>();

  constructor(private config: BridgeConfig) {}

  async setByName(name: string, value: string): Promise<string> {
    switch (name) {
      case "session_add_sync": {
        const args = JSON.parse(value) as { id?: string; peer?: string };
        const id = args.id ?? "";
        const manager = new SessionManager(this.config);
        this.sessions.set(id, {
          manager,
          peerId: args.peer ?? "",
          connected: false,
        });
        return JSON.stringify({ id });
      }
      case "session_start": {
        return "";
      }
      case "session_login": {
        const args = JSON.parse(value) as {
          id?: string;
          peer?: string;
          password?: string;
          my_id?: string;
          my_name?: string;
        };
        const entry = args.id ? this.sessions.get(args.id) : undefined;
        if (!entry) throw new Error(`session not found: ${args.id}`);
        const peerInfo = await entry.manager.connect({
          peerId: args.peer ?? entry.peerId,
          password: args.password ?? "",
          myId: args.my_id ?? "",
          myName: args.my_name ?? "web",
          myPlatform: "Web",
          connType: ConnType.DEFAULT_CONN,
        });
        entry.connected = true;
        return JSON.stringify(peerInfo);
      }
      case "session_close": {
        const args = JSON.parse(value) as { id?: string };
        const entry = args.id ? this.sessions.get(args.id) : undefined;
        entry?.manager.close();
        if (args.id) this.sessions.delete(args.id);
        return "";
      }
      default:
        return "";
    }
  }

  async getByName(_name: string, _arg: string): Promise<string> {
    return "";
  }
}