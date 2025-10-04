# `hjm-mqtt`

Standalone adaptation of https://github.com/ajtudela/hass-smartbox/ into MQTT<->smart-heater adapter implemented in Node.

## Goals

- provide simple MQTT interface for controlling the mode of the heater (manual/automatic/off), and setting up the temperature
- the MQTT configuration (host, username, password) and other necessary configuration should reside in `~/.hjm-config.json`

## Feature 1

- [x] download the https://github.com/ajtudela/hass-smartbox/ into a reference/ folder, and git ignore it
- [x] download the https://github.com/ajtudela/smartbox/ (Python library) into reference/ folder
- [x] create basic project using node that follows the described goals

MQTT Topics (per heater):

- `heater/{node_name}/mode/set` - Set heater mode (manual/auto/off)
- `heater/{node_name}/temperature/set` - Set target temperature
- `heater/{node_name}/mode` - Current mode (published)
- `heater/{node_name}/temperature` - Target temperature (published)
- `heater/{node_name}/current_temperature` - Measured temperature (published)
  Where `{node_name}` is the sanitized heater node name (e.g., `bedroom`, `living_room`).
