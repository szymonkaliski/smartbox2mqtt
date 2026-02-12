import mqtt from "mqtt";
import { createLogger } from "./logger.js";

export class MQTTBridge {
  constructor(config, smartboxClient, deviceId, node, mqttClient = null) {
    this.config = config;
    this.smartboxClient = smartboxClient;
    this.deviceId = deviceId;
    this.node = node;
    this.client = mqttClient;
    this.ownClient = !mqttClient;
    const nodeName = this.sanitizeNodeName(node.name);
    this.baseTopic = `${config.mqtt.baseTopic || "heater"}/${nodeName}`;
    this.log = createLogger(node.name);
  }

  sanitizeNodeName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  async connect() {
    if (this.ownClient) {
      const mqttUrl = `mqtt://${this.config.mqtt.host}:${this.config.mqtt.port || 1883}`;
      const options = {
        username: this.config.mqtt.username,
        password: this.config.mqtt.password,
        clientId: `smartbox2mqtt-${Math.random().toString(16).slice(2, 8)}`,
      };

      this.client = mqtt.connect(mqttUrl, options);

      this.client.on("connect", () => {
        this.log.info("Connected to MQTT broker");
        this.subscribe();
        this.publishState();
      });

      this.client.on("message", async (topic, message) => {
        await this.handleMessage(topic, message);
      });

      this.client.on("error", (error) => {
        this.log.error({ err: error }, "MQTT error");
      });
    } else {
      this.log.info({ baseTopic: this.baseTopic }, "Setting up bridge");
      this.subscribe();
      await this.publishState();
    }
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

  async handleMessage(topic, message) {
    const payload = message.toString();

    if (!topic.startsWith(this.baseTopic)) {
      return;
    }

    this.log.debug({ topic, payload }, "Received message");

    try {
      if (topic === `${this.baseTopic}/mode/set`) {
        this.client.publish(`${this.baseTopic}/mode`, payload, {
          retain: true,
        });
        await this.smartboxClient.setMode(this.deviceId, this.node, payload);
        this.log.info({ mode: payload }, "Mode set successfully");
      } else if (topic === `${this.baseTopic}/temperature/set`) {
        const temperature = parseFloat(payload);

        if (isNaN(temperature)) {
          this.log.error({ payload }, "Invalid temperature value");
          return;
        }

        this.client.publish(
          `${this.baseTopic}/temperature`,
          temperature.toFixed(1),
          { retain: true },
        );
        await this.smartboxClient.setTemperature(
          this.deviceId,
          this.node,
          temperature,
        );
        this.log.info({ temperature }, "Temperature set successfully");
      }
    } catch (error) {
      this.log.error({ err: error }, "Error handling MQTT message");
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

    const onlineStatus = status.sync_status === "ok" ? "ON" : "OFF";
    this.client.publish(`${this.baseTopic}/online`, onlineStatus, {
      retain: true,
    });

    this.log.info(
      {
        mode: status.mode,
        stemp: status.stemp,
        mtemp: status.mtemp,
        active: activeStatus,
        power: status.power,
        online: onlineStatus,
      },
      "Published state",
    );
  }

  unsubscribe() {
    if (this.client) {
      this.client.unsubscribe(`${this.baseTopic}/mode/set`);
      this.client.unsubscribe(`${this.baseTopic}/temperature/set`);
    }
  }

  disconnect() {
    if (this.client && this.ownClient) {
      this.client.end();
    }
  }
}
