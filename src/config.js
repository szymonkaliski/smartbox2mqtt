import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export function loadConfig() {
  const configPath = join(homedir(), ".hjm-config.json");
  const configData = readFileSync(configPath, "utf8");
  return JSON.parse(configData);
}
