import { infrai } from "./infrai_queue.js";
import { type Delivery } from "./notification_policy.js";

async function drainOnce(): Promise<void> {
  const messages = await infrai.queue.consume(20, 60);
  for (const message of messages) {
    const delivery = message.payload as Delivery;
    console.log(JSON.stringify({
      delivered_to: delivery.subscriber_id,
      event_id: delivery.event_id,
      topic: delivery.topic,
      priority: delivery.priority,
    }));
    await infrai.queue.ack(message.message_id);
  }
}

drainOnce().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
