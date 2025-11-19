import io from "socket.io-client";
import { createLogger } from "./logger.js";

const API_V2_NAMESPACE = "/api/v2/socket_io";
const log = createLogger("SocketBridge");

export class SocketBridge {
  constructor(smartboxClient, deviceId, onUpdate) {
    this.smartboxClient = smartboxClient;
    this.deviceId = deviceId;
    this.onUpdate = onUpdate;
    this.socket = null;
    this.connected = false;
    this.receivedDevData = false;
  }

  async connect() {
    await this.smartboxClient.checkRefreshAuth();

    const token = encodeURIComponent(this.smartboxClient.accessToken);
    const url = `${this.smartboxClient.apiHost}${API_V2_NAMESPACE}?token=${token}&dev_id=${this.deviceId}`;

    log.info({ host: this.smartboxClient.apiHost, deviceId: this.deviceId }, "Connecting");

    this.socket = io(url, {
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      log.info({ deviceId: this.deviceId }, "Connected");
      this.connected = true;
      this.socket.emit("dev_data");
    });

    this.socket.on("disconnect", (reason) => {
      log.warn({ reason, deviceId: this.deviceId }, "Disconnected");
      this.connected = false;
      this.receivedDevData = false;
    });

    this.socket.on("dev_data", (data) => {
      log.debug({ deviceId: this.deviceId }, "Received dev_data");
      this.receivedDevData = true;
      if (this.onUpdate) {
        this.onUpdate(data);
      }
    });

    this.socket.on("update", (data) => {
      log.debug({ path: data.path, deviceId: this.deviceId }, "Received update");
      if (!this.receivedDevData) {
        log.debug("Dev data not received yet, requesting");
        this.socket.emit("dev_data");
        return;
      }
      if (this.onUpdate) {
        this.onUpdate(data);
      }
    });

    this.socket.on("connect_error", (error) => {
      log.error({ err: error, deviceId: this.deviceId }, "Connection error");
    });

    this.socket.on("error", (error) => {
      log.error({ err: error, deviceId: this.deviceId }, "Socket error");
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  async reconnect() {
    this.disconnect();
    await this.connect();
  }
}
