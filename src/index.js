#!/usr/bin/env node
import mqtt from "mqtt";
import { loadConfig } from "./config.js";
import { SmartboxClient } from "./smartbox-client.js";
import { MQTTBridge } from "./mqtt-bridge.js";

async function main() {
  const bridges = [];
  let mqttClient = null;

  try {
    console.log("Starting smartbox2mqtt Bridge...");

    const config = loadConfig();
    console.log("Configuration loaded");

    const smartboxClient = new SmartboxClient(
      config.smartbox.username,
      config.smartbox.password,
      config.smartbox.apiName || "api",
    );

    await smartboxClient.authenticate();
    console.log("Authenticated with Smartbox API");

    const devices = await smartboxClient.getDevices();
    console.log(`Found ${devices.devs.length} device(s)`);

    if (devices.devs.length === 0) {
      console.error("No devices found");
      process.exit(1);
    }

    const mqttUrl = `mqtt://${config.mqtt.host}:${config.mqtt.port || 1883}`;
    const mqttOptions = {
      username: config.mqtt.username,
      password: config.mqtt.password,
      clientId: `smartbox2mqtt-${Math.random().toString(16).slice(2, 8)}`,
    };

    mqttClient = mqtt.connect(mqttUrl, mqttOptions);

    await new Promise((resolve, reject) => {
      mqttClient.on("connect", () => {
        console.log("Connected to MQTT broker");
        resolve();
      });
      mqttClient.on("error", (error) => {
        console.error("MQTT error:", error);
        reject(error);
      });
    });

    mqttClient.on("message", async (topic, message) => {
      console.log(
        `[MQTT] Received message on topic: ${topic}, payload: ${message.toString()}`,
      );
      for (const bridge of bridges) {
        await bridge.handleMessage(topic, message);
      }
    });

    for (const device of devices.devs) {
      console.log(`Processing device: ${device.name} (${device.dev_id})`);

      const nodes = await smartboxClient.getNodes(device.dev_id);
      console.log(`  Found ${nodes.length} node(s)`);

      const heaterNodes = nodes.filter((node) =>
        ["htr", "acm", "htr_mod"].includes(node.type),
      );
      console.log(`  Found ${heaterNodes.length} heater node(s)`);

      for (const heaterNode of heaterNodes) {
        console.log(
          `  Setting up bridge for: ${heaterNode.name} (type: ${heaterNode.type})`,
        );
        const bridge = new MQTTBridge(
          config,
          smartboxClient,
          device.dev_id,
          heaterNode,
          mqttClient,
        );
        await bridge.connect();
        bridge.startPolling(config.smartbox.pollingInterval || 60000);
        bridges.push(bridge);
      }
    }

    if (bridges.length === 0) {
      console.error("No heater nodes found across all devices");
      process.exit(1);
    }

    console.log(
      `\nsmartbox2mqtt Bridge is running with ${bridges.length} heater(s)`,
    );
    console.log("Subscribed topics:");
    bridges.forEach((bridge) => {
      console.log(`  - ${bridge.baseTopic}/mode/set`);
      console.log(`  - ${bridge.baseTopic}/temperature/set`);
    });

    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      bridges.forEach((bridge) => bridge.unsubscribe());
      if (mqttClient) {
        mqttClient.end();
      }
      process.exit(0);
    });
  } catch (error) {
    console.error("Fatal error:", error.message);
    if (mqttClient) {
      mqttClient.end();
    }
    process.exit(1);
  }
}

main();
