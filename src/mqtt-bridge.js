import mqtt from "mqtt";

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
        clientId: `hjm-mqtt-${Math.random().toString(16).slice(2, 8)}`,
      };

      this.client = mqtt.connect(mqttUrl, options);

      this.client.on("connect", () => {
        console.log("Connected to MQTT broker");
        this.subscribe();
        this.publishState();
      });

      this.client.on("message", async (topic, message) => {
        await this.handleMessage(topic, message);
      });

      this.client.on("error", (error) => {
        console.error("MQTT error:", error);
      });
    } else {
      console.log(
        `Setting up bridge for ${this.node.name} (${this.baseTopic})`,
      );
      this.subscribe();
      await this.publishState();
    }
  }

  subscribe() {
    this.client.subscribe(`${this.baseTopic}/mode/set`, (err) => {
      if (err) {
        console.error("Failed to subscribe to mode topic:", err);
      } else {
        console.log(`Subscribed to ${this.baseTopic}/mode/set`);
      }
    });

    this.client.subscribe(`${this.baseTopic}/temperature/set`, (err) => {
      if (err) {
        console.error("Failed to subscribe to temperature topic:", err);
      } else {
        console.log(`Subscribed to ${this.baseTopic}/temperature/set`);
      }
    });
  }

  async handleMessage(topic, message) {
    const payload = message.toString();
    console.log(`[${this.node.name}] Received message on ${topic}: ${payload}`);

    if (!topic.startsWith(this.baseTopic)) {
      return;
    }

    try {
      if (topic === `${this.baseTopic}/mode/set`) {
        console.log(
          `[${this.node.name}] Setting mode to: ${payload} (deviceId: ${this.deviceId}, node: ${this.node.addr})`,
        );
        await this.smartboxClient.setMode(this.deviceId, this.node, payload);
        console.log(`[${this.node.name}] Successfully set mode to: ${payload}`);
        await this.publishState();
      } else if (topic === `${this.baseTopic}/temperature/set`) {
        const temperature = parseFloat(payload);
        if (isNaN(temperature)) {
          console.error(
            `[${this.node.name}] Invalid temperature value: ${payload}`,
          );
          return;
        }
        console.log(
          `[${this.node.name}] Setting temperature to: ${temperature}`,
        );
        await this.smartboxClient.setTemperature(
          this.deviceId,
          this.node,
          temperature,
        );
        console.log(
          `[${this.node.name}] Successfully set temperature to: ${temperature}`,
        );
        await this.publishState();
      }
    } catch (error) {
      console.error(
        `[${this.node.name}] Error handling MQTT message:`,
        error.message,
      );
      console.error(`[${this.node.name}] Stack trace:`, error.stack);
    }
  }

  async publishState() {
    try {
      console.log(`[${this.node.name}] Fetching node status...`);
      const status = await this.smartboxClient.getNodeStatus(
        this.deviceId,
        this.node,
      );
      console.log(`[${this.node.name}] Status:`, JSON.stringify(status));

      this.client.publish(`${this.baseTopic}/mode`, status.mode || "unknown", {
        retain: true,
      });
      this.client.publish(
        `${this.baseTopic}/temperature`,
        status.stemp || "0",
        { retain: true },
      );
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

      // Feature 2: Active status and power monitoring
      const activeStatus = status.active ? "ON" : "OFF";
      this.client.publish(`${this.baseTopic}/active`, activeStatus, {
        retain: true,
      });

      if (status.power) {
        this.client.publish(`${this.baseTopic}/power`, status.power, {
          retain: true,
        });
      }

      console.log(
        `[${this.node.name}] Published state: mode=${status.mode}, stemp=${status.stemp}, mtemp=${status.mtemp}, active=${activeStatus}, power=${status.power}W`,
      );
    } catch (error) {
      console.error(
        `[${this.node.name}] Error publishing state:`,
        error.message,
      );
      console.error(`[${this.node.name}] Stack trace:`, error.stack);
    }
  }

  startPolling(intervalMs = 60000) {
    setInterval(async () => {
      await this.publishState();
    }, intervalMs);
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
