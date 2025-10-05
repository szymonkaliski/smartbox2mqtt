# `smartbox2mqtt`

Standalone adaptation of https://github.com/ajtudela/hass-smartbox/ into MQTT<->smart-heater adapter implemented in Node.

## Goals

- provide simple MQTT interface for controlling the mode of the heater (manual/automatic/off), and setting up the temperature
- the MQTT configuration (host, username, password) and other necessary configuration should reside in `~/.smartbox2mqtt-config.json`

## Feature 1: Basic MQTT Bridge

- [x] download the https://github.com/ajtudela/hass-smartbox/ into a reference/ folder, and git ignore it
- [x] download the https://github.com/ajtudela/smartbox/ (Python library) into reference/ folder
- [x] create basic project using node that follows the described goals
- [x] multi-heater support with automatic discovery
- [x] mode control (manual/auto/off)
- [x] temperature control and monitoring

### MQTT Topics (per heater)

**Control (write):**

- `{baseTopic}/{nodeName}/mode/set` - Set heater mode (`manual`, `auto`, `off`)
- `{baseTopic}/{nodeName}/temperature/set` - Set target temperature (°C)

**Status (read-only):**

- `{baseTopic}/{nodeName}/mode` - Current mode
- `{baseTopic}/{nodeName}/temperature` - Target temperature (°C)
- `{baseTopic}/{nodeName}/current_temperature` - Measured temperature (°C)
- `{baseTopic}/{nodeName}/comfort_temperature` - Comfort mode temperature (°C)
- `{baseTopic}/{nodeName}/eco_temperature` - Eco mode temperature (°C)
- `{baseTopic}/{nodeName}/ice_temperature` - Frost protection temperature (°C)

## Feature 2: Active Status & Power Monitoring

- [x] Add active heating status
- [x] Add real-time power consumption monitoring

### Additional MQTT Topics

**Status (read-only):**

- `{baseTopic}/{nodeName}/active` - Heater actively heating (`ON`/`OFF`)
- `{baseTopic}/{nodeName}/power` - Real-time power consumption (Watts)

## Feature 3: Connection Status Monitoring

- [x] Add per-node connection status (online/offline detection)

### Additional MQTT Topics

**Status (read-only):**

- `{baseTopic}/{nodeName}/online` - Node connection status (`ON`/`OFF`)
