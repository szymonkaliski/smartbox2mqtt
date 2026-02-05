# `smartbox2mqtt`

MQTT bridge for smartbox electric heaters.

## Overview

`smartbox2mqtt` is a standalone Node.js adapter that bridges MQTT and smartbox electric heaters. It provides a simple MQTT interface for monitoring and controlling heater modes, target temperatures, and real-time power consumption.

This project is based on the [hass-smartbox](https://github.com/ajtudela/hass-smartbox/) Home Assistant integration and the [smartbox](https://github.com/ajtudela/smartbox/) Python library. Adapted to Node and MQTT by Claude.

## Installation

```bash
npm install -g smartbox2mqtt
```

## Configuration

Create a configuration file at `~/.config/smartbox2mqtt/config.json` (Linux) or `~/Library/Preferences/smartbox2mqtt/config.json` (macOS):

```json
{
  "smartbox": {
    "username": "smartbox email",
    "password": "smartbox password",
    "apiName": "key of one of /src/smartbox-client.js:6, for example 'api-hjm'",
    "reconnectInterval": 600000
  },
  "mqtt": {
    "host": "localhost",
    "port": 1883,
    "username": "mqtt username",
    "password": "mqtt password",
    "baseTopic": "smartbox"
  }
}
```

If you have an existing config at `~/.smartbox2mqtt-config.json`, it will be automatically migrated to the new location on first run.

### Configuration Options

#### smartbox section
- `username` (required): Your smartbox account email
- `password` (required): Your smartbox account password
- `apiName` (required): API endpoint key (e.g., `api-hjm`). See `/src/smartbox-client.js:6` for available options
- `reconnectInterval` (optional): Interval in milliseconds for periodic Socket.IO reconnection. Default: 600000 (10 minutes). This ensures the WebSocket connection stays fresh and auth tokens are refreshed. Set to `0` to disable periodic reconnects.

#### mqtt section
- `host` (required): MQTT broker hostname
- `port` (optional): MQTT broker port. Default: 1883
- `username` (optional): MQTT broker username
- `password` (optional): MQTT broker password
- `baseTopic` (optional): Base topic prefix for all MQTT messages. Default: `smartbox`

## Usage

```bash
smartbox2mqtt
```

The bridge will:

1. Connect to your smartbox account
2. Discover all available heaters
3. Connect to your MQTT broker
4. Start publishing status updates and listening for commands

## MQTT Topics

For each heater (`{nodeName}`), topics are structured as: `{baseTopic}/{nodeName}/...`

### Control Topics (Write)

- `{baseTopic}/{nodeName}/mode/set` - Set heater mode: `manual`, `auto`, or `off`
- `{baseTopic}/{nodeName}/temperature/set` - Set target temperature in °C

### Status Topics (Read-only)

- `{baseTopic}/{nodeName}/mode` - Current mode
- `{baseTopic}/{nodeName}/temperature` - Target temperature (°C)
- `{baseTopic}/{nodeName}/current_temperature` - Measured room temperature (°C)
- `{baseTopic}/{nodeName}/comfort_temperature` - Comfort mode temperature (°C)
- `{baseTopic}/{nodeName}/eco_temperature` - Eco mode temperature (°C)
- `{baseTopic}/{nodeName}/ice_temperature` - Frost protection temperature (°C)
- `{baseTopic}/{nodeName}/active` - Actively heating: `ON` or `OFF`
- `{baseTopic}/{nodeName}/power` - Real-time power consumption in Watts
- `{baseTopic}/{nodeName}/online` - Connection status: `ON` or `OFF`

## Example Usage

### Set heater to manual mode

```bash
mosquitto_pub -t "smartbox/living-room/mode/set" -m "manual"
```

### Set target temperature to 21°C

```bash
mosquitto_pub -t "smartbox/living-room/temperature/set" -m "21.0"
```

### Monitor current temperature

```bash
mosquitto_sub -t "smartbox/living-room/current_temperature"
```

### Monitor power consumption

```bash
mosquitto_sub -t "smartbox/living-room/power"
```
