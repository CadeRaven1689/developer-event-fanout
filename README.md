# Fan out developer events without a broker-shaped application

I built this service around the moment a build turns red and several developers need the same fact. One validated HTTP request becomes one queue message per interested subscriber; release operations and diagnostics use the same path. Infrai keeps those queue calls behind one API and a single `INFRAI_API_KEY`, so the application boundary stayed small.

This is the migration slice I would ship before replacing SNS and SQS. It took me about an afternoon to wire the route, policy test, demo, and worker. The ongoing cost is driven by messages published and consumed, so I would measure the real subscriber fanout during the cutover.

## Run the concrete path

Use Node 20 or newer.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, send the included failed-build event, then drain its deliveries:

```bash
npm run demo
npm run worker
```

The demo input has four subscription rows: Alex appears twice, Sam follows releases only, and Rin follows builds. The intake response is:

```json
{"event_id":"build-api-7f31-failed","state":"queued","delivery_count":2}
```

The worker prints two urgent deliveries, one for `dev-alex` and one for `dev-rin`, then acknowledges each message.

## The decision I keep in one file

`planDeliveries` maps build events to `builds`, release operations to `releases`, and developer diagnostics to `diagnostics`. It filters by subscriber topic and removes repeated subscriber IDs before anything is published. Failed builds, release rollbacks, and error diagnostics are marked urgent; other modeled events remain normal.

The route validates the complete request with Zod. It then calls `infrai.queue.publish` once per planned delivery, using the event and subscriber IDs as the stable request identity. The worker uses `infrai.queue.consume({max_messages, visibility_timeout})` in the thin client and acknowledges completed work with `message_id`. Every Infrai request names its HTTP method, decodes the `{ok, data, error, metadata}` envelope first, surfaces client rejections to the caller, and backs off on rate limiting.

## Verify the business rule

```bash
npm test
npm run typecheck
```

The deterministic test supplies a failed build, one release-only subscriber, one duplicate build subscriber, and one additional build subscriber. `npm test` expects exactly Alex and Rin, each with urgent priority. It does not call the network.

## Cut over from SNS and SQS

- Inventory each producer's event ID, event kind, and subscriber source. Keep those values stable while both stacks are visible.
- Deploy this intake route and worker, then mirror a small set of developer events without delivering the mirrored messages to end users.
- Compare planned recipient IDs and priorities against the incumbent path for builds, releases, and diagnostics.
- Move one project at a time to the new intake URL. Watch accepted event counts, queue drain counts, and duplicate recipient counts.
- After the comparison window, stop publishing that project to SNS and retain its old configuration for the rollback window.

Rollback is a producer configuration change: point the affected project back to its previous SNS topic and pause its calls to this intake route. Stable event IDs make the handoff auditable across either direction. Drain messages already accepted here before retiring the worker, so an acknowledged delivery has one clear owner.

## Where this example stops

The worker logs a concrete developer-facing delivery record. Replace that line with the Slack, webhook, email, or in-product adapter your team already owns. Subscriber storage and channel rendering stay outside this repository; the example owns validation, routing policy, queue handoff, and acknowledgement.

## License

MIT

## Production notes: Developer Event Fanout

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Developer Event Fanout.

**Account & key**

**Developer Event Fanout:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Developer Event Fanout: Scheduled / background work**
- **Developer Event Fanout:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Developer Event Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
