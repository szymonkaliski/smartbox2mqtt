#!/usr/bin/env node
import mqtt from "mqtt";
import { loadConfig } from "./config.js";
import { SmartboxClient } from "./smartbox-client.js";
import { MQTTBridge } from "./mqtt-bridge.js";
import { SocketBridge } from "./socket-bridge.js";
import logger from "./logger.js";

const log = logger;

async function main() {
  const bridges = [];
  const socketBridges = [];
  let mqttClient = null;

  try {
    log.info("Starting smartbox2mqtt Bridge");

    const config = loadConfig();
    log.info("Configuration loaded");

    const smartboxClient = new SmartboxClient(
      config.smartbox.username,
      config.smartbox.password,
      config.smartbox.apiName || "api",
    );

    await smartboxClient.authenticate();

    const devices = await smartboxClient.getDevices();
    log.info({ count: devices.devs.length }, "Found devices");

    if (devices.devs.length === 0) {
      log.error("No devices found");
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
        log.info("Connected to MQTT broker");
        resolve();
      });

      mqttClient.on("error", (error) => {
        log.error({ err: error }, "MQTT error");
        reject(error);
      });
    });

    mqttClient.on("message", async (topic, message) => {
      for (const bridge of bridges) {
        await bridge.handleMessage(topic, message);
      }
    });

    for (const device of devices.devs) {
      log.info({ device: device.name, deviceId: device.dev_id }, "Processing device");

      const nodes = await smartboxClient.getNodes(device.dev_id);

      const heaterNodes = nodes.filter((node) =>
        ["htr", "acm", "htr_mod"].includes(node.type),
      );
      log.info({ total: nodes.length, heaters: heaterNodes.length }, "Found nodes");

      const bridgeMap = {};

      for (const heaterNode of heaterNodes) {
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
        bridgeMap[`${heaterNode.type}_${heaterNode.addr}`] = bridge;
      }

      const socketBridge = new SocketBridge(
        smartboxClient,
        device.dev_id,
        (data) => {
          if (data.nodes) {
            for (const nodeData of data.nodes) {
              const key = `${nodeData.type}_${nodeData.addr}`;
              const bridge = bridgeMap[key];
              if (bridge && nodeData.status) {
                bridge.publishStatus(nodeData.status);
              }
            }
          } else if (data.path && data.body) {
            const match = data.path.match(/^\/(\w+)\/(\d+)\/status$/);
            if (match) {
              const key = `${match[1]}_${match[2]}`;
              const bridge = bridgeMap[key];
              if (bridge) {
                bridge.publishStatus(data.body);
              }
            }
          }
        },
      );
      await socketBridge.connect();
      socketBridges.push(socketBridge);
    }

    if (bridges.length === 0) {
      log.error("No heater nodes found across all devices");
      process.exit(1);
    }

    log.info({ heaters: bridges.length }, "smartbox2mqtt Bridge is running");

    process.on("SIGINT", () => {
      log.info("Shutting down");
      bridges.forEach((bridge) => bridge.unsubscribe());
      socketBridges.forEach((sb) => sb.disconnect());
      if (mqttClient) {
        mqttClient.end();
      }
      process.exit(0);
    });
  } catch (error) {
    log.fatal({ err: error }, "Fatal error");
    if (mqttClient) {
      mqttClient.end();
    }
    process.exit(1);
  }
}

main();
