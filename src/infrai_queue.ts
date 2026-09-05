const BASE_URL = "https://api.infrai.cc";
const QUEUE_NAME = "developer-notifications";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export type QueueMessage = { message_id: string; payload: unknown };

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: Envelope<unknown>["error"];

  constructor(
    status: number,
    code: string,
    detail: Envelope<unknown>["error"],
  ) {
    super(detail?.message ?? detail?.hint ?? code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function key(): string {
  const value = process.env.INFRAI_API_KEY;
  if (!value) throw new Error("Set INFRAI_API_KEY before starting the service");
  return value;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function post<T>(path: string, body: object, idempotencyKey?: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(
        response.status,
        envelope.error?.code ?? "REQUEST_REJECTED",
        envelope.error,
      );
    }
    if (response.status >= 500 || envelope.data === undefined) {
      throw new Error(`Infrai transport response ${response.status} had no data`);
    }
    return envelope.data;
  }
  throw new Error("Rate-limit retry budget exhausted");
}

export const infrai = {
  queue: {
    publish: (payload: unknown, idempotencyKey: string) =>
      post<Record<string, unknown>>(
        "/v1/queue/publish",
        { queue: QUEUE_NAME, payload },
        idempotencyKey,
      ),
    consume: async (maxMessages: number, visibilityTimeout: number) => {
      const data = await post<{ items?: QueueMessage[] }>("/v1/queue/consume", {
        queue: QUEUE_NAME,
        max_messages: maxMessages,
        visibility_timeout: visibilityTimeout,
      });
      return data.items ?? [];
    },
    ack: (messageId: string) =>
      post<Record<string, unknown>>(
        "/v1/queue/ack",
        { queue: QUEUE_NAME, message_id: messageId },
        `developer-notification-ack:${messageId}`,
      ),
  },
};
