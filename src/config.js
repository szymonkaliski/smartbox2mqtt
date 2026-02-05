import { existsSync, readFileSync, mkdirSync, renameSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import envPaths from "env-paths";

const paths = envPaths("smartbox2mqtt", { suffix: "" });
const oldConfigPath = join(homedir(), ".smartbox2mqtt-config.json");
const configPath = join(paths.config, "config.json");

export function loadConfig() {
  if (!existsSync(configPath) && existsSync(oldConfigPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    renameSync(oldConfigPath, configPath);
  }

  const configData = readFileSync(configPath, "utf8");
  return JSON.parse(configData);
}
