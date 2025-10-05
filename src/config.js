import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export function loadConfig() {
  const configPath = join(homedir(), ".smartbox2mqtt-config.json");
  const configData = readFileSync(configPath, "utf8");
  return JSON.parse(configData);
}
