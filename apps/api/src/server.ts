import { config as loadEnvironment } from "dotenv";

import { createApp } from "./app.js";
import { readApiConfig } from "./config.js";

loadEnvironment({ path: new URL("../../../.env", import.meta.url), quiet: true });

const config = readApiConfig();
const app = await createApp({ config });

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
