# `smartbox2mqtt`

Standalone adaptation of https://github.com/ajtudela/hass-smartbox/ into MQTT<->smart-heater adapter implemented in Node.

## Goals

- provide simple MQTT interface for controlling the mode of the heater (manual/automatic/off), and setting up the temperature
- the MQTT configuration (host, username, password) and other necessary configuration should reside in the XDG config directory (`~/.config/smartbox2mqtt/config.json` on Linux)

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

## Feature 4: Configuration Refactor

- [x] Move `pollingInterval` from MQTT config to smartbox config @done(2025-10-05)
- [x] Update README.md with correct configuration structure @done(2025-10-05)
- [x] Update code to read from `config.smartbox.pollingInterval` @done(2025-10-05)

## Feature 5: Global CLI Binary

- [x] Add shebang to `src/index.js` @done(2025-10-05)
- [x] Add `bin` field to `package.json` @done(2025-10-05)

## Feature 6: XDG Config Migration

- [x] Install `env-paths` dependency @done(2026-02-05)
- [x] Update `config.js` to use XDG config path via `env-paths` @done(2026-02-05)
- [x] Auto-migrate from old `~/.smartbox2mqtt-config.json` to new XDG location @done(2026-02-05)
- [x] Update README.md with new config path @done(2026-02-05)

## Feature 7: Bridge-Level LWT (Last Will and Testament)

- [x] Add MQTT LWT so broker publishes `offline` on disconnect @done(2026-02-12)
- [x] Publish `online` (retained) on successful MQTT connection @done(2026-02-12)
- [x] Publish `offline` (retained) on graceful SIGINT shutdown @done(2026-02-12)

### Additional MQTT Topics

**Status (read-only):**

- `{baseTopic}/lwt` - Bridge availability (`Online` / `Offline`)

## Feature 8: Connection Resilience & State Consistency

- [x] Reschedule reconnect timer on failure in `SocketBridge.reconnect()` @done(2026-03-10)
- [x] Reconnect on server-initiated disconnect (`io server disconnect`) @done(2026-03-10)
- [x] Optimistic MQTT publish with rollback on API failure in `MQTTBridge` @done(2026-03-10)
- [x] Redact credentials from error logs in `SmartboxClient` @done(2026-03-10)

## Feature 9: Device-level Offline Detection

Empirically verified that the Helki cloud pushes `/connected` websocket events within ~25 s of a device losing power, and bursts a full state snapshot on reconnect. Node-level `sync_status` and `mgr/nodes.lost` are not timely availability signals.

- [x] Subscribe to `/connected` socket path and fan `publishAvailability` out to every node of the device @done(2026-04-14)
- [x] Add 20 s app-level `socket.send("ping")` to keep the websocket alive @done(2026-04-14)
- [x] Remove the periodic teardown-reconnect timer and rely on `socket.io-client`'s built-in reconnection @done(2026-04-14)

## Feature 10: Token-aware Socket Reconnect

Bug: after ~3 h the Helki access token expires and the server emits `io server disconnect`. The previous handler called `this.socket.connect()` on the existing socket, which re-used the URL containing the stale token — the server would re-kick immediately, producing an infinite tight reconnect loop. The old periodic teardown-reconnect (removed in Feature 9) had been masking this by forcing a fresh socket every 10 min.

Matches reference Python (`reference/smartbox/src/smartbox/socket.py`), which disables `socket.io-client`'s built-in reconnect and manages reconnection manually, calling `check_refresh_auth` between attempts.

- [x] Disable `socket.io-client` built-in reconnection (`reconnection: false`) @done(2026-04-15)
- [x] On disconnect / connect_error, tear down socket fully and schedule a fresh `connect()` with exponential backoff (1 s → 60 s cap) @done(2026-04-15)
- [x] Fresh `connect()` re-enters `checkRefreshAuth()` so the new socket URL carries a current token @done(2026-04-15)
- [x] Reset backoff attempt counter on successful `connect` event @done(2026-04-15)

## Feature 11: Honest per-node availability

Bug: the per-node `online` topic flapped with the Helki cloud's `/connected` events but was immediately clobbered back to "Online" on every status push (`publishStatus` derived `online` from `sync_status === "ok"`, which stays "ok" even when the gateway is disconnected — verified empirically). Result: Homebridge showed heater as Online while the official Helki app correctly showed it as Offline. Helki cloud also flaps `/connected: true|false` every 1–3 min during a degraded gateway; we had no debounce.

`mgr/nodes.lost` and `sync_status` confirmed useless during a wedge — both stay clean. `/connected` events plus `dev_data.connected` (top-level field) are the authoritative signals.

- [x] `publishStatus` no longer touches the `online` topic @done(2026-04-27)
- [x] Removed the per-node birth `Online` publish on MQTT connect (let `/connected` / `dev_data.connected` provide truth) @done(2026-04-27)
- [x] Use `dev_data.connected` (top-level) on every `dev_data` frame to bootstrap availability @done(2026-04-27)
- [x] Debounce `/connected: true` transitions (default 10 s, configurable via `availability.connectDebounceMs`) — `/connected: false` is immediate @done(2026-04-27)
- [x] Dedupe identical retained publishes in `recomputeOnline` @done(2026-04-27)
- [x] On Helki socket loss beyond grace (default 10 s, `availability.socketLossGraceMs`), publish per-node Offline; on reconnect let `dev_data.connected` re-bootstrap @done(2026-04-27)
