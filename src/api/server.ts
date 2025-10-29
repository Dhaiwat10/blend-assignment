import { Hono } from "hono";
import { vaultsRoute } from "./routes/vaults";
import { rebalancesRoute } from "./routes/rebalances";
import { simulateRoute } from "./routes/simulate";
import { healthRoute } from "./routes/health";
import { executeRoute } from "./routes/execute";
import { wsRoute } from "./routes/ws";

// Hono app composition. Routes remain thin; all logic lives in services.
export function createApp() {
  const app = new Hono();
  app.route("/vaults", vaultsRoute);
  app.route("/rebalances", rebalancesRoute);
  app.route("/simulate", simulateRoute);
  app.route("/health", healthRoute);
  app.route("/ws", wsRoute);
  app.route("/execute", executeRoute);
  app.get("/", (c) => c.redirect("/dashboard"));
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
