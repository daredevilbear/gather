import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

import cache from "memory-cache";

import { loadYaml } from "utils/config/yaml";
import { managedVariables } from "utils/gather/variables-store";

const cacheKey = "gatherEnvironmentVariables";
const gatherVarPrefix = "GATHER_VAR_";
const gatherFilePrefix = "GATHER_FILE_";

export const CONF_DIR = process.env.GATHER_CONFIG_DIR ? process.env.GATHER_CONFIG_DIR : join(process.cwd(), "config");

export default function checkAndCopyConfig(config) {
  // Ensure config directory exists
  if (!existsSync(CONF_DIR)) {
    try {
      mkdirSync(CONF_DIR, { recursive: true });
    } catch (e) {
      console.warn(`Could not create config directory ${CONF_DIR}: ${e.message}`);
      return false;
    }
  }

  const configYaml = join(CONF_DIR, config);

  // If the config file doesn't exist, try to copy the skeleton
  if (!existsSync(configYaml)) {
    const configSkeleton = join(process.cwd(), "src", "skeleton", config);
    try {
      copyFileSync(configSkeleton, configYaml);
      console.info("%s was copied to the config folder", config);
    } catch (err) {
      console.error("❌ Failed to initialize required config: %s", configYaml);
      console.error("Reason: %s", err.message);
      console.error("Hint: Make /app/config writable or manually place the config file.");
      process.exit(1);
    }

    return true;
  }

  try {
    loadYaml(readFileSync(configYaml, "utf8"));
    return true;
  } catch (e) {
    return { ...e, config };
  }
}

function getCachedEnvironmentVars() {
  let cachedVars = cache.get(cacheKey);
  if (!cachedVars) {
    // initialize cache
    cachedVars = Object.entries(process.env).filter(
      ([key]) => key.includes(gatherVarPrefix) || key.includes(gatherFilePrefix),
    );
    cache.put(cacheKey, cachedVars);
  }
  return cachedVars;
}

export function substituteEnvironmentVars(str) {
  let result = str;
  if (result.includes("{{")) {
    // crude check if we have vars to replace
    const cachedVars = [
      ...getCachedEnvironmentVars(),
      ...managedVariables(CONF_DIR).filter(([name]) => !Object.hasOwn(process.env, name)),
    ];
    cachedVars.forEach(([key, value]) => {
      if (key.startsWith(gatherVarPrefix)) {
        result = result.replaceAll(`{{${key}}}`, value);
      } else if (key.startsWith(gatherFilePrefix)) {
        const filename = value;
        const fileContents = readFileSync(filename, "utf8");
        result = result.replaceAll(`{{${key}}}`, fileContents);
      }
    });
  }
  return result;
}

export function getSettings() {
  checkAndCopyConfig("settings.yaml");

  const settingsYaml = join(CONF_DIR, "settings.yaml");
  const rawFileContents = readFileSync(settingsYaml, "utf8");
  const fileContents = substituteEnvironmentVars(rawFileContents);
  const initialSettings = loadYaml(fileContents) ?? {};

  if (initialSettings.layout) {
    // support yaml list but old spec was object so convert to that

    if (Array.isArray(initialSettings.layout)) {
      const layoutItems = initialSettings.layout;
      initialSettings.layout = {};
      layoutItems.forEach((i) => {
        const name = Object.keys(i)[0];
        initialSettings.layout[name] = i[name];
      });
    }
  }
  return initialSettings;
}
