import { readFileSync } from "fs";
import { join } from "path";
import envPaths from "env-paths";

const paths = envPaths("smartbox2mqtt", { suffix: "" });
const configPath = join(paths.config, "config.json");

export function loadConfig() {
  const configData = readFileSync(configPath, "utf8");
  return JSON.parse(configData);
}
