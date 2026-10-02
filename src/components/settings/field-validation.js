const reference = /{{GATHER_(?:VAR|FILE)_[A-Z0-9_]+}}/;
export const isConfigReference = (value) => reference.test(String(value ?? ""));

// Validate literal inputs without resolving environment variables or reading files.
export function fieldError(value, validation) {
  if (value == null || value === "" || isConfigReference(value)) return "";
  if (validation === "timezone") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
    } catch {
      return "Enter a valid time zone, for example America/Los_Angeles.";
    }
  }
  if (validation === "http") {
    try {
      if (!["https:", "http:"].includes(new URL(value).protocol)) throw Error();
    } catch {
      return "Enter an HTTP or HTTPS URL.";
    }
  }
  return "";
}
