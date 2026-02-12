import io from "socket.io-client";
import { createLogger } from "./logger.js";

const API_V2_NAMESPACE = "/api/v2/socket_io";
const log = createLogger("SocketBridge");

export class SocketBridge {
  constructor(smartboxClient, deviceId, onUpdate, reconnectInterval = 600000) {
    this.smartboxClient = smartboxClient;
    this.deviceId = deviceId;
    this.onUpdate = onUpdate;
    this.socket = null;
    this.connected = false;
    this.receivedDevData = false;
    this.reconnectInterval = reconnectInterval;
    this.reconnectTimer = null;
  }

  async connect() {
    await this.smartboxClient.checkRefreshAuth();

    const token = encodeURIComponent(this.smartboxClient.accessToken);
    const url = `${this.smartboxClient.apiHost}${API_V2_NAMESPACE}?token=${token}&dev_id=${this.deviceId}`;

    log.info(
      { host: this.smartboxClient.apiHost, deviceId: this.deviceId },
      "Connecting",
    );

    this.socket = io(url, {
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      log.info({ deviceId: this.deviceId }, "Connected");
      this.connected = true;
      this.socket.emit("dev_data");
      this.scheduleReconnect();
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
      log.debug(
        { path: data.path, deviceId: this.deviceId },
        "Received update",
      );
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
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  async reconnect() {
    try {
      log.debug({ deviceId: this.deviceId }, "Reconnecting");
      this.disconnect();
      await this.connect();
    } catch (error) {
      log.error(
        { err: error, deviceId: this.deviceId },
        "Reconnect failed, will retry on next interval",
      );
    }
  }

  scheduleReconnect() {
    this.clearReconnectTimer();

    if (this.reconnectInterval > 0) {
      log.debug(
        { deviceId: this.deviceId, intervalMs: this.reconnectInterval },
        "Scheduling reconnect",
      );

      this.reconnectTimer = setTimeout(async () => {
        log.info({ deviceId: this.deviceId }, "Periodic reconnect triggered");
        await this.reconnect();
      }, this.reconnectInterval);
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
