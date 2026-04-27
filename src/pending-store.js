import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import { createLogger } from "./logger.js";

const log = createLogger("PendingStore");
const SCHEMA_VERSION = 1;
const STATE_DIR = join(
  envPaths("smartbox2mqtt", { suffix: "" }).data,
  "pending",
);

function pendingPath(deviceId, node) {
  const file = `${deviceId}-${node.type}-${node.addr}.json`;
  return join(STATE_DIR, file);
}

function isValidV1(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (obj.version !== 1) return false;
  if (!obj.pending || typeof obj.pending !== "object") return false;
  const { mode, stemp, ...rest } = obj.pending;
  if (Object.keys(rest).length > 0) return false;
  if (mode !== undefined && typeof mode !== "string") return false;
  if (stemp !== undefined && typeof stemp !== "number") return false;
  return true;
}

export function loadPending(deviceId, node) {
  const path = pendingPath(deviceId, node);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return {};
    log.warn({ err, path }, "Failed to read pending file, discarding");
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn({ err, path }, "Pending file is not valid JSON, discarding");
    return {};
  }

  if (!isValidV1(parsed)) {
    log.warn(
      { path, parsed },
      "Pending file shape invalid or unknown version, discarding",
    );
    return {};
  }

  return { ...parsed.pending };
}

export function savePending(deviceId, node, pending) {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = pendingPath(deviceId, node);
  const tmp = `${path}.tmp`;
  const data = JSON.stringify({ version: SCHEMA_VERSION, pending });
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export function clearPending(deviceId, node) {
  const path = pendingPath(deviceId, node);
  try {
    unlinkSync(path);
  } catch (err) {
    if (err.code !== "ENOENT") {
      log.warn({ err, path }, "Failed to clear pending file");
    }
  }
}
