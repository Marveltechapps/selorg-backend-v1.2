# Selorg Dashboard Backend

Backend API for the Admin Operations Dashboard.

## Dashboard access

Dashboard access is by **company-issued email and password only**. Self-registration is disabled. New users are created by administrators (e.g. via the Admin dashboard user management).

## Running

- `npm install` then `npm run dev` or `npm start`
- Set `.env` with `JWT_SECRET`, `MONGO_URI` / `MONGODB_URI`, and other required variables (see `.env.example`). Caching is in-memory only (see [CACHING.md](CACHING.md)).
- Seed users: `npm run seed` (creates role-based test users; change default password in production).
- Seed one super_admin only: `npm run seed:super-admin` (default: `superadmin@selorg.com` / `SelorgDev1!SuperAdmin`; override with `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD`).
- Seed non-admin dashboard users only: `npm run seed:dashboard-users` (creates darkstore, production, vendor, warehouse, finance, rider, merch users; does not touch admin/super_admin; override password with `SEED_DASHBOARD_PASSWORD`).
- Seed customer app onboarding (so the app shows onboarding screens instead of skipping to Login): `npm run seed:customer-onboarding`.
- Seed customer app home page data: `npm run seed:customer-home`.

## Caching

GET responses are cached in memory. Use `DISABLE_CACHE=true` to turn off caching. See [CACHING.md](CACHING.md) for TTL env vars and behavior.

## Security

See [SECURITY.md](SECURITY.md) for HTTPS, secrets, CORS, rate limiting, RBAC, token lifecycle, and audit logging.
