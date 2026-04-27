import mqtt from "mqtt";
import { createLogger } from "./logger.js";
import { loadPending, savePending, clearPending } from "./pending-store.js";

const DEFAULT_CONNECT_DEBOUNCE_MS = 10000;

export class MQTTBridge {
  constructor(config, smartboxClient, deviceId, node) {
    this.config = config;
    this.smartboxClient = smartboxClient;
    this.deviceId = deviceId;
    this.node = node;
    this.client = null;
    const nodeName = this.sanitizeNodeName(node.name);
    this.baseTopic = `${config.mqtt.baseTopic || "heater"}/${nodeName}`;
    this.onlineTopic = `${this.baseTopic}/online`;
    this.log = createLogger(node.name);
    this.connectDebounceMs =
      config.availability?.connectDebounceMs ?? DEFAULT_CONNECT_DEBOUNCE_MS;
    this.gatewayConnected = null;
    this.lastPublishedOnline = null;
    this.connectDebounceTimer = null;
    this.draining = false;
    this.pending = loadPending(deviceId, node);
    if (Object.keys(this.pending).length > 0) {
      this.log.info(
        { pending: this.pending },
        "Loaded pending commands from disk",
      );
    }
  }

  sanitizeNodeName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  async connect() {
    const mqttUrl = `mqtt://${this.config.mqtt.host}:${this.config.mqtt.port || 1883}`;
    const options = {
      username: this.config.mqtt.username,
      password: this.config.mqtt.password,
      clientId: `smartbox2mqtt-${this.sanitizeNodeName(this.node.name)}-${Math.random().toString(16).slice(2, 8)}`,
      will: {
        topic: this.onlineTopic,
        payload: "Offline",
        retain: true,
        qos: 1,
      },
    };

    this.client = mqtt.connect(mqttUrl, options);

    await new Promise((resolve, reject) => {
      this.client.once("connect", () => {
        this.log.info(
          { baseTopic: this.baseTopic },
          "Connected to MQTT broker",
        );
        this.subscribe();
        this.publishState();
        resolve();
      });

      this.client.once("error", (error) => {
        this.log.error({ err: error }, "MQTT error");
        reject(error);
      });
    });

    this.client.on("message", async (topic, message) => {
      await this.handleMessage(topic, message);
    });

    this.client.on("error", (error) => {
      this.log.error({ err: error }, "MQTT error");
    });
  }

  subscribe() {
    this.client.subscribe(`${this.baseTopic}/mode/set`, (err) => {
      if (err) {
        this.log.error({ err }, "Failed to subscribe to mode topic");
      } else {
        this.log.debug({ topic: `${this.baseTopic}/mode/set` }, "Subscribed");
      }
    });

    this.client.subscribe(`${this.baseTopic}/temperature/set`, (err) => {
      if (err) {
        this.log.error({ err }, "Failed to subscribe to temperature topic");
      } else {
        this.log.debug(
          { topic: `${this.baseTopic}/temperature/set` },
          "Subscribed",
        );
      }
    });
  }

  setPendingField(field, value) {
    this.pending[field] = value;
    savePending(this.deviceId, this.node, this.pending);
  }

  clearPendingField(field) {
    if (!(field in this.pending)) return;
    delete this.pending[field];
    if (Object.keys(this.pending).length === 0) {
      clearPending(this.deviceId, this.node);
    } else {
      savePending(this.deviceId, this.node, this.pending);
    }
  }

  clearPendingFieldIfEquals(field, value) {
    if (this.pending[field] !== value) return;
    this.clearPendingField(field);
  }

  async handleMessage(topic, message) {
    const payload = message.toString();

    if (!topic.startsWith(this.baseTopic)) {
      return;
    }

    this.log.debug({ topic, payload }, "Received message");

    try {
      if (topic === `${this.baseTopic}/mode/set`) {
        if (this.gatewayConnected !== true) {
          this.setPendingField("mode", payload);
          this.client.publish(`${this.baseTopic}/mode`, payload, {
            retain: true,
          });
          this.log.info({ mode: payload }, "Gateway offline, queued mode");
          return;
        }
        this.client.publish(`${this.baseTopic}/mode`, payload, {
          retain: true,
        });
        try {
          await this.smartboxClient.setMode(this.deviceId, this.node, payload);
          this.clearPendingFieldIfEquals("mode", payload);
          this.log.info({ mode: payload }, "Mode set successfully");
        } catch (error) {
          this.setPendingField("mode", payload);
          this.log.error(
            { err: error, mode: payload },
            "Error setting mode, queued for retry",
          );
        }
      } else if (topic === `${this.baseTopic}/temperature/set`) {
        const temperature = parseFloat(payload);

        if (isNaN(temperature)) {
          this.log.error({ payload }, "Invalid temperature value");
          return;
        }

        if (this.gatewayConnected !== true) {
          this.setPendingField("stemp", temperature);
          this.client.publish(
            `${this.baseTopic}/temperature`,
            temperature.toFixed(1),
            { retain: true },
          );
          this.log.info({ temperature }, "Gateway offline, queued temperature");
          return;
        }
        this.client.publish(
          `${this.baseTopic}/temperature`,
          temperature.toFixed(1),
          { retain: true },
        );
        try {
          await this.smartboxClient.setTemperature(
            this.deviceId,
            this.node,
            temperature,
          );
          this.clearPendingFieldIfEquals("stemp", temperature);
          this.log.info({ temperature }, "Temperature set successfully");
        } catch (error) {
          this.setPendingField("stemp", temperature);
          this.log.error(
            { err: error, temperature },
            "Error setting temperature, queued for retry",
          );
        }
      }
    } catch (error) {
      this.log.error({ err: error }, "Error handling MQTT message");
    }
  }

  async drainPending() {
    if (this.draining) return;
    if (Object.keys(this.pending).length === 0) return;
    this.draining = true;
    try {
      this.log.info({ pending: this.pending }, "Draining pending commands");

      if (this.pending.mode !== undefined) {
        const mode = this.pending.mode;
        try {
          await this.smartboxClient.setMode(this.deviceId, this.node, mode);
          this.clearPendingFieldIfEquals("mode", mode);
          this.log.info({ mode }, "Drained pending mode");
        } catch (error) {
          this.log.error(
            { err: error, mode },
            "Failed to drain pending mode; value retained on disk, retried on next offline→online transition",
          );
        }
      }

      if (this.pending.stemp !== undefined) {
        const stemp = this.pending.stemp;
        try {
          await this.smartboxClient.setTemperature(
            this.deviceId,
            this.node,
            stemp,
          );
          this.clearPendingFieldIfEquals("stemp", stemp);
          this.log.info({ stemp }, "Drained pending temperature");
        } catch (error) {
          this.log.error(
            { err: error, stemp },
            "Failed to drain pending temperature; value retained on disk, retried on next offline→online transition",
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }

  async publishState() {
    try {
      this.log.debug("Fetching node status");
      const status = await this.smartboxClient.getNodeStatus(
        this.deviceId,
        this.node,
      );
      this.publishStatus(status);
    } catch (error) {
      this.log.error({ err: error }, "Error publishing state");
    }
  }

  publishStatus(status) {
    this.client.publish(`${this.baseTopic}/mode`, status.mode || "unknown", {
      retain: true,
    });

    this.client.publish(`${this.baseTopic}/temperature`, status.stemp || "0", {
      retain: true,
    });

    this.client.publish(
      `${this.baseTopic}/current_temperature`,
      status.mtemp || "0",
      { retain: true },
    );

    if (status.comf_temp) {
      this.client.publish(
        `${this.baseTopic}/comfort_temperature`,
        status.comf_temp,
        { retain: true },
      );
    }

    if (status.eco_temp) {
      this.client.publish(
        `${this.baseTopic}/eco_temperature`,
        status.eco_temp,
        { retain: true },
      );
    }

    if (status.ice_temp) {
      this.client.publish(
        `${this.baseTopic}/ice_temperature`,
        status.ice_temp,
        { retain: true },
      );
    }

    if (status.selected_temp) {
      this.client.publish(
        `${this.baseTopic}/selected_temperature`,
        status.selected_temp,
        { retain: true },
      );
    }

    const activeStatus = status.active ? "ON" : "OFF";
    this.client.publish(`${this.baseTopic}/active`, activeStatus, {
      retain: true,
    });

    if (status.power) {
      this.client.publish(`${this.baseTopic}/power`, status.power, {
        retain: true,
      });
    }

    this.log.info(
      {
        mode: status.mode,
        stemp: status.stemp,
        mtemp: status.mtemp,
        active: activeStatus,
        power: status.power,
      },
      "Published state",
    );
  }

  recomputeOnline() {
    const desired = this.gatewayConnected === true ? "Online" : "Offline";
    if (desired === this.lastPublishedOnline) return;
    this.lastPublishedOnline = desired;
    this.client.publish(this.onlineTopic, desired, { retain: true });
    this.log.info({ online: desired }, "Published availability");
    if (desired === "Online") {
      this.drainPending().catch((error) => {
        this.log.error({ err: error }, "Drain pending failed unexpectedly");
      });
    }
  }

  publishAvailability(connected) {
    if (connected === false) {
      if (this.connectDebounceTimer) {
        clearTimeout(this.connectDebounceTimer);
        this.connectDebounceTimer = null;
      }
      this.gatewayConnected = false;
      this.recomputeOnline();
      return;
    }
    if (connected === true) {
      if (this.gatewayConnected === true) return;
      if (this.connectDebounceTimer) return;
      this.log.info(
        { delayMs: this.connectDebounceMs },
        "Scheduling availability Online (debounce)",
      );
      this.connectDebounceTimer = setTimeout(() => {
        this.connectDebounceTimer = null;
        this.gatewayConnected = true;
        this.recomputeOnline();
      }, this.connectDebounceMs);
    }
  }

  unsubscribe() {
    if (this.client) {
      this.client.unsubscribe(`${this.baseTopic}/mode/set`);
      this.client.unsubscribe(`${this.baseTopic}/temperature/set`);
    }
  }

  async shutdown() {
    if (this.connectDebounceTimer) {
      clearTimeout(this.connectDebounceTimer);
      this.connectDebounceTimer = null;
    }
    if (!this.client) return;
    return new Promise((resolve) => {
      this.client.publish(
        this.onlineTopic,
        "Offline",
        { retain: true, qos: 1 },
        () => {
          this.client.end(false, {}, resolve);
        },
      );
    });
  }
}
