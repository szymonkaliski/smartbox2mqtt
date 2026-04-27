import io from "socket.io-client";
import { createLogger } from "./logger.js";

const API_V2_NAMESPACE = "/api/v2/socket_io";
const PING_INTERVAL_MS = 20000;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;
const MAX_RECONNECT_ATTEMPT = 16;
const DEFAULT_SOCKET_LOSS_GRACE_MS = 10000;
const log = createLogger("SocketBridge");

export class SocketBridge {
  constructor(smartboxClient, deviceId, onUpdate, options = {}) {
    this.smartboxClient = smartboxClient;
    this.deviceId = deviceId;
    this.onUpdate = onUpdate;
    this.onSocketLost = options.onSocketLost || null;
    this.socketLossGraceMs =
      options.socketLossGraceMs ?? DEFAULT_SOCKET_LOSS_GRACE_MS;
    this.socket = null;
    this.connected = false;
    this.receivedDevData = false;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.shuttingDown = false;
    this.socketLossTimer = null;
  }

  async connect() {
    if (this.shuttingDown) return;

    await this.smartboxClient.checkRefreshAuth();

    const token = encodeURIComponent(this.smartboxClient.accessToken);
    const url = `${this.smartboxClient.apiHost}${API_V2_NAMESPACE}?token=${token}&dev_id=${this.deviceId}`;

    log.info(
      { host: this.smartboxClient.apiHost, deviceId: this.deviceId },
      "Connecting",
    );

    this.socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
    });

    this.socket.on("connect", () => {
      log.info({ deviceId: this.deviceId }, "Connected");
      this.connected = true;
      this.receivedDevData = false;
      this.reconnectAttempt = 0;
      if (this.socketLossTimer) {
        clearTimeout(this.socketLossTimer);
        this.socketLossTimer = null;
      }
      this.socket.emit("dev_data");
      this.startPing();
    });

    this.socket.on("disconnect", (reason) => {
      log.warn({ reason, deviceId: this.deviceId }, "Disconnected");
      this.connected = false;
      this.receivedDevData = false;
      this.stopPing();
      this.startSocketLossTimer();
      this.scheduleReconnect();
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
      if (data.path === "/connected") {
        if (this.onUpdate) {
          this.onUpdate(data);
        }
        return;
      }
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
      this.startSocketLossTimer();
      this.scheduleReconnect();
    });

    this.socket.on("error", (error) => {
      log.error({ err: error, deviceId: this.deviceId }, "Socket error");
    });
  }

  scheduleReconnect() {
    if (this.shuttingDown) return;
    if (this.reconnectTimer) return;

    const delay = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, this.reconnectAttempt),
      MAX_BACKOFF_MS,
    );
    if (this.reconnectAttempt < MAX_RECONNECT_ATTEMPT) {
      this.reconnectAttempt += 1;
    }

    log.info(
      {
        deviceId: this.deviceId,
        attempt: this.reconnectAttempt,
        delayMs: delay,
      },
      "Scheduling reconnect",
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.teardownSocket();
      try {
        await this.connect();
      } catch (error) {
        log.error({ err: error, deviceId: this.deviceId }, "Reconnect failed");
        this.scheduleReconnect();
      }
    }, delay);
  }

  teardownSocket() {
    if (!this.socket) return;
    try {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    } catch (error) {
      log.debug({ err: error }, "Error tearing down socket");
    }
    this.socket = null;
    this.connected = false;
  }

  startSocketLossTimer() {
    if (this.shuttingDown) return;
    if (this.socketLossTimer) return;
    if (!this.onSocketLost) return;
    log.info(
      { deviceId: this.deviceId, delayMs: this.socketLossGraceMs },
      "Scheduling availability Offline (socket loss grace)",
    );
    this.socketLossTimer = setTimeout(() => {
      this.socketLossTimer = null;
      if (this.onSocketLost) this.onSocketLost();
    }, this.socketLossGraceMs);
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.connected && this.socket) {
        this.socket.send("ping");
      }
    }, PING_INTERVAL_MS);
  }

  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  disconnect() {
    this.shuttingDown = true;
    this.stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socketLossTimer) {
      clearTimeout(this.socketLossTimer);
      this.socketLossTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
}
