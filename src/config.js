import { existsSync, readFileSync, mkdirSync, copyFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import envPaths from "env-paths";

const paths = envPaths("smartbox2mqtt", { suffix: "" });
const oldConfigPath = join(homedir(), ".smartbox2mqtt-config.json");
const newConfigPath = join(paths.config, "config.json");

export function loadConfig() {
  if (existsSync(newConfigPath)) {
    const configData = readFileSync(newConfigPath, "utf8");
    return JSON.parse(configData);
  }

  if (existsSync(oldConfigPath)) {
    mkdirSync(dirname(newConfigPath), { recursive: true });
    copyFileSync(oldConfigPath, newConfigPath);

    console.error(
      `Config migrated from ${oldConfigPath} to ${newConfigPath}\n` +
        `You can remove the old file.`,
    );

    const configData = readFileSync(newConfigPath, "utf8");
    return JSON.parse(configData);
  }

  throw new Error(
    `No config file found. Create one at ${newConfigPath}\n` +
      `See README.md for the expected format.`,
  );
}
