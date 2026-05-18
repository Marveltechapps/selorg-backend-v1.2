# Logistics module (Porter + multi-provider hooks)

## What it does

B2B bulk moves only:

- Vendor → warehouse pickups (warehouse dashboard + ` /api/v1/warehouse/logistics/*`)
- Warehouse → darkstore replenishment (darkstore dashboard + `/api/v1/darkstore/logistics/*`)

Shared core: `/api/v1/logistics/*` (JWT: admin, super_admin, warehouse, darkstore), webhooks at `POST /api/v1/logistics/webhooks/porter`.

## Local dependencies

- MongoDB (existing `MONGODB_URI` / `MONGO_URI`)
- Redis (`REDIS_URL` or `REDIS_HOST` / `REDIS_PORT`) for webhook/event idempotency
- RabbitMQ (`RABBITMQ_URL`) for topic exchange `logistics.events`, consumers, DLQ

Quick stack: `docker compose -f docker-compose.logistics.yml up -d` then set `RABBITMQ_URL=amqp://guest:guest@localhost:5672` and Redis/Mongo URIs in `.env`.

## Health

`GET /api/v1/logistics/health` — Mongo + Redis + RabbitMQ readiness flags.

## Architecture (ASCII)

```
  Dashboard JWT                Porter API
       |                           ^
       v                           |
  logistics.service ----> providerFactory ----> porter.adapter (fetch)
       |     |                                           |
       |     +----> Mongo (orders, audits, webhooks)    |
       v                                                  |
  orderEvent.producer ---> RabbitMQ topic logistics.events
                                   |
          +------------------------+--------------------+
          v                        v                    v
  webhookProcessor          notification.consumer   analytics.consumer
```

## Testing

From `selorg-dashboard-backend-v1.1`:

```bash
NODE_ENV=test npx jest src/__tests__/logistics --no-coverage
```

## Porter contract

Adapter paths and payload shapes are marked `// TODO(porter-contract)` until official Porter B2B documentation is wired in.
