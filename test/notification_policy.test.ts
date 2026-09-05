import assert from "node:assert/strict";
import test from "node:test";
import { notificationRequestSchema, planDeliveries } from "../src/notification_policy.js";

test("a failed build reaches each build subscriber once and is urgent", () => {
  const input = notificationRequestSchema.parse({
    event_id: "build-api-7f31-failed",
    event: {
      kind: "build.completed",
      project: "public-api",
      status: "failed",
      commit: "7f31cafe",
    },
    subscribers: [
      { subscriber_id: "dev-alex", topics: ["builds", "diagnostics"] },
      { subscriber_id: "dev-sam", topics: ["releases"] },
      { subscriber_id: "dev-alex", topics: ["builds"] },
      { subscriber_id: "dev-rin", topics: ["builds"] },
    ],
  });

  const deliveries = planDeliveries(input);

  assert.deepEqual(deliveries.map((item) => item.subscriber_id), ["dev-alex", "dev-rin"]);
  assert.deepEqual(deliveries.map((item) => item.priority), ["urgent", "urgent"]);
});
