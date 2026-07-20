import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import presence from "@convex-dev/presence/convex.config";
import polar from "@convex-dev/polar/convex.config";

const app = defineApp();
app.use(agent);
app.use(rateLimiter);
app.use(presence);
app.use(polar);

export default app;
