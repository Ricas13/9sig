# Wealtharr staging on oraclefree2 with existing Traefik

Use the owned hostname **https://wealtharr.vpn4u.cc**. This setup shares the existing `traefik` reverse proxy on ports 80/443, `media_net` and the ACME resolver `le`. It does not open a separate host port, change the existing Traefik configuration or publish PostgreSQL.

## 1. Cloudflare DNS

In Cloudflare → `vpn4u.cc` → DNS → Records, create an **A** record:

- Name: `wealtharr`
- Content: the **public IPv4 address of oraclefree2** (check from that server with `curl -4fsS https://api.ipify.org`; cross-check with your Oracle Cloud console)
- Proxy: **Proxied** (orange cloud)
- TTL: Auto

Do not point to oraclefree1 or an unrelated media server. Remove a conflicting `AAAA` or `CNAME` for this hostname, if one exists. Cloudflare SSL/TLS must be **Full (strict)** once Traefik has issued the origin certificate; do not use Flexible. Do not change global Cloudflare TLS settings in a way that breaks existing services.

## 2. Confirm shared proxy and compose capabilities

```sh
cd /opt/wealtharr
docker compose version
docker network inspect media_net >/dev/null
docker ps --filter name=traefik --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

The overlay uses Docker Compose's `!reset []` to remove the original `127.0.0.1:3000` published port. If an older Compose CLI cannot read `!reset`, upgrade the Compose plugin before deploying; **do not** edit or restart other applications to free port 3000.

## 3. Set a consistent HTTPS origin

Keep the existing database password, `DATABASE_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY` and `CRON_SECRET` unchanged. Back up `.env.production` securely if it already exists and edit only the settings below:

```dotenv
NEXT_PUBLIC_APP_URL=https://wealtharr.vpn4u.cc
AUTH_URL=https://wealtharr.vpn4u.cc
AUTH_TRUST_HOST=true
NEXT_PUBLIC_BRAND_NAME=Wealtharr
TRUSTED_PROXY_HOPS=1
WEALTHARR_PAID_LAUNCH_ENABLED=false
PUBLIC_INDEXING_ENABLED=false
```

If an admin has already saved **Public web address** in the database, that value overrides the environment. Change it through the authenticated Admin → Settings → General screen, from the same HTTPS origin, or otherwise plan a controlled migration before switching the hostname. Avoid using an old `http://localhost:3000` saved setting.

## 4. Start Wealtharr, without changing other applications

```sh
cd /opt/wealtharr
git pull --ff-only origin main
docker compose -f docker-compose.oracle.yml -f docker-compose.traefik.yml --env-file .env.production config --quiet
docker compose -f docker-compose.oracle.yml -f docker-compose.traefik.yml --env-file .env.production up -d --build
docker compose -f docker-compose.oracle.yml -f docker-compose.traefik.yml --env-file .env.production ps
```

For an existing `wealtharr` Compose project this uses the same named database volume. Do not run `down -v`. Run migrations when the release includes schema changes; do not re-seed just to change a hostname.

## 5. Verify HTTPS and application health

```sh
curl -i https://wealtharr.vpn4u.cc/api/health
curl -I https://wealtharr.vpn4u.cc/login
docker logs traefik --since 10m 2>&1 | grep -Ei 'wealtharr|acme|certificate' | tail -40
```

Expected: JSON containing `"ok":true` and `"status":"ready"`, and a valid certificate. If the domain reaches the wrong app, examine the `wealtharr` DNS record and the Traefik router. `/setup` needs the one-time code printed in the Wealtharr app logs; **never paste the setup code or secrets into chat**.

This remains **private staging** operationally: keep payments and public indexing disabled, restrict test users and consider Cloudflare Access for the hostname to prevent unknown visitors reaching sign-in/setup while the product is unfinished. A reachable URL is not proof of commercial readiness.
