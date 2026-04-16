# Licitagram Supreme Bot — Public API v1

Enterprise-grade REST API for the Licitagram Supreme Bot. Consume bot
state, drive sessions programmatically, and subscribe to webhook events
as your auctions unfold.

**Base URL:** `https://app.licitagram.com.br/api/v1/bot`

## Authentication

Every request MUST include a bearer token in the `Authorization` header:

```http
Authorization: Bearer LIC_sk_a8f2c...<48 chars total>
```

Tokens are generated in the dashboard at **Configurações → API Keys**.
The plaintext is shown exactly **once** at creation. Store it in your
secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.); Licitagram
keeps only a SHA-256 hash.

**Scopes:** `read` (GET), `write` (POST/PATCH), `admin` (all).

Revoked or expired tokens return `401`. We intentionally do not
distinguish "missing" / "revoked" / "expired" in the error body, to
avoid token oracle attacks.

## Endpoints

### `GET /sessions`

List bot sessions for the authenticated company. Ordered newest first.

| Query | Description |
|-------|-------------|
| `limit` | 1–200 (default 50) |
| `status` | Filter by `pending`, `active`, `paused`, `completed`, `failed`, `cancelled` |

```json
{
  "data": [
    {
      "id": "d4...",
      "pregao_id": "PGE-2026-0042",
      "portal": "comprasgov",
      "status": "active",
      "mode": "supervisor",
      "strategy_config": { "type": "minimal_decrease" },
      "min_price": 12450.0,
      "max_bids": null,
      "bids_placed": 3,
      "current_price": 12499.0,
      "started_at": "2026-04-17T14:03:11Z"
    }
  ]
}
```

### `POST /sessions`

Create + enqueue a session.

```json
{
  "config_id": "…",
  "pregao_id": "PGE-2026-0042",
  "portal": "comprasgov",
  "min_price": 12450.0,
  "max_bids": 20,
  "strategy": "minimal_decrease",
  "mode": "supervisor",
  "idempotency_key": "order-7781"
}
```

- `mode` — `supervisor` (default) | `auto_bid` | `shadow`. Supervisor
  sets the native floor via IN 67/2021; auto_bid submits lances directly;
  shadow observes and computes but never clicks.
- `idempotency_key` — if a session with this key already exists for your
  company, we return it with `deduped: true`. Safe to retry on network
  failures.

Response: `{ data: <session>, deduped?: true }`.

## Webhooks

Subscribe to event kinds via the dashboard or POST `/api/bot/webhooks`.
Each delivery is a POST to your URL with the signature headers described
below.

### Signature

Every delivery carries:

```http
Content-Type: application/json
User-Agent: Licitagram-Webhook/1.0
X-Licitagram-Event: our_bid_ack
X-Licitagram-Delivery: <uuid>
X-Licitagram-Timestamp: <unix_ms>
X-Licitagram-Signature-256: sha256=<hex>
```

The signature is:

```
HMAC_SHA256( webhook_secret , `${timestamp}.${body}` )
```

Same format as Stripe, so existing verification helpers work. Node.js:

```js
import crypto from 'node:crypto'

function verify(rawBody, headers, secret) {
  const ts = headers['x-licitagram-timestamp']
  const sig = headers['x-licitagram-signature-256']?.replace(/^sha256=/, '')
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex')
  return sig === expected && Math.abs(Date.now() - Number(ts)) < 5 * 60 * 1000
}
```

### Event kinds

`tick`, `our_bid`, `our_bid_ack`, `our_bid_nack`, `rival_bid`,
`rival_overtook_us`, `we_overtook_rival`, `phase_change`,
`phase_random_started`, `phase_encerrado`, `phase_homologado`,
`chat_msg`, `floor_set`, `floor_update`, `supervisor_handoff`,
`auto_bid_handoff`, `shadow_observation`, `login_refresh`,
`login_expired`, `captcha_solved`, `captcha_failed`, `heartbeat`,
`snapshot`, `error`, `websocket_message`.

### Delivery reliability

- Up to **6 attempts** with exponential backoff (30 s base, up to 60 min).
- `2xx` → delivered.
- `408`, `429`, `5xx` → retried.
- Other `4xx` → permanently failed (fix your endpoint).
- 10-second timeout per attempt.
- Delivery log visible in the dashboard at **Configurações → Webhooks**.

## Rate limits

- Per API key: **120 req/min** on reads, **30 req/min** on writes.
- Exceed → `429` with `Retry-After`.

## Versioning

`/api/v1` is the first stable surface. Breaking changes ship under
`/api/v2`. `v1` receives additive-only updates (new fields, new endpoints)
for at least 12 months after `v2` goes GA.

## Support

- Status page: <https://status.licitagram.com.br>
- Bug reports: <dev@licitagram.com.br>
