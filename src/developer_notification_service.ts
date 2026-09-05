import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, infrai } from "./infrai_queue.js";
import { notificationRequestSchema, planDeliveries } from "./notification_policy.js";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/developer-events") {
    sendJson(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const input = notificationRequestSchema.parse(await readBody(request));
    const deliveries = planDeliveries(input);
    await Promise.all(deliveries.map((delivery) =>
      infrai.queue.publish(
        delivery,
        `developer-event:${delivery.event_id}:${delivery.subscriber_id}`,
      ),
    ));
    sendJson(response, 202, {
      event_id: input.event_id,
      state: "queued",
      delivery_count: deliveries.length,
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: "invalid_request" });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      sendJson(response, error.status, { error: error.code, detail: error.message });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: "notification_request_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Developer notification intake listening at http://localhost:${port}`);
});
