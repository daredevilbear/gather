import { applyNextAuthEnv, isAuthEnabled } from "utils/env";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  isAuthEnabled();
  applyNextAuthEnv();
}
