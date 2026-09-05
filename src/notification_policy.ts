import { z } from "zod";

export const notificationRequestSchema = z.object({
  event_id: z.string().min(1).max(120),
  event: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("build.completed"),
      project: z.string().min(1),
      status: z.enum(["passed", "failed"]),
      commit: z.string().min(7),
    }).strict(),
    z.object({
      kind: z.literal("release.operated"),
      project: z.string().min(1),
      operation: z.enum(["deployed", "rolled_back"]),
      version: z.string().min(1),
    }).strict(),
    z.object({
      kind: z.literal("diagnostic.reported"),
      project: z.string().min(1),
      severity: z.enum(["info", "warning", "error"]),
      summary: z.string().min(1).max(500),
    }).strict(),
  ]),
  subscribers: z.array(z.object({
    subscriber_id: z.string().min(1),
    topics: z.array(z.enum(["builds", "releases", "diagnostics"])),
  }).strict()).max(1000),
}).strict();

export type NotificationRequest = z.infer<typeof notificationRequestSchema>;

export type Delivery = {
  event_id: string;
  subscriber_id: string;
  topic: "builds" | "releases" | "diagnostics";
  priority: "normal" | "urgent";
  event: NotificationRequest["event"];
};

function eventTopic(event: NotificationRequest["event"]): Delivery["topic"] {
  if (event.kind === "build.completed") return "builds";
  if (event.kind === "release.operated") return "releases";
  return "diagnostics";
}

function priority(event: NotificationRequest["event"]): Delivery["priority"] {
  if (event.kind === "build.completed" && event.status === "failed") return "urgent";
  if (event.kind === "release.operated" && event.operation === "rolled_back") return "urgent";
  if (event.kind === "diagnostic.reported" && event.severity === "error") return "urgent";
  return "normal";
}

export function planDeliveries(input: NotificationRequest): Delivery[] {
  const topic = eventTopic(input.event);
  const seen = new Set<string>();

  return input.subscribers.flatMap((subscriber) => {
    if (seen.has(subscriber.subscriber_id) || !subscriber.topics.includes(topic)) return [];
    seen.add(subscriber.subscriber_id);
    return [{
      event_id: input.event_id,
      subscriber_id: subscriber.subscriber_id,
      topic,
      priority: priority(input.event),
      event: input.event,
    }];
  });
}
