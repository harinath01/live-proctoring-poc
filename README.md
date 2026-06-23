# Live Proctoring POC

## Setup

```bash
# Edit .env with your settings if needed

# Generate a secure secret key if needed
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Start The Stack

```bash
# Start all local services
docker compose watch
```

This starts the local development stack from `compose.yml` plus `compose.override.yml`.

## Local Development Without Traefik

These services are available directly on `localhost`:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/docs |
| Adminer | http://localhost:8080 |
| Traefik Dashboard | http://localhost:8090 |
| MailCatcher | http://localhost:1080 |

This is the simplest mode for day-to-day development. The `mediasoup-server` service is not published directly to a localhost port, so you access it through Traefik.

## Local Development With Traefik

Traefik is already included in local Docker Compose as the `proxy` service. You do not need to run anything separately beyond `docker compose watch`.

To use the subdomain-based local routing:

1. Open `.env`.
2. Set `DOMAIN=localhost.tiangolo.com`.
3. Restart the stack with `docker compose down` and `docker compose watch`.

After that, Traefik will route these hostnames to the correct containers:

| Service | URL |
|---|---|
| Frontend | http://dashboard.localhost.tiangolo.com |
| Backend API | http://api.localhost.tiangolo.com |
| Swagger Docs | http://api.localhost.tiangolo.com/docs |
| Mediasoup Server | http://mediasoup.localhost.tiangolo.com |
| Traefik Dashboard | http://localhost:8090 |

Notes:

- `localhost.tiangolo.com` and its subdomains resolve to `127.0.0.1`, so you normally do not need to edit `/etc/hosts`.
- In local development, Traefik listens on port `80` via the `proxy` service from [compose.override.yml](/home/hari/workspace/live-proctoring-poc/compose.override.yml).
- The local Traefik setup does not terminate real TLS certificates, so use the `http://` URLs above for development.

## Useful Docker Commands

```bash
# Run database migrations only
docker compose run --rm prestart

# Seed the first superuser (admin@example.com / Welcome1$)
docker compose run --rm backend bash -c "uv run python -m app.initial_data"

# View logs
docker compose logs -f
docker compose logs -f backend
docker compose logs -f mediasoup-server

# Stop services
docker compose down

# Stop services and delete volumes (wipes DB)
docker compose down -v

# Run tests
docker compose run --rm backend bash scripts/test.sh
```

## Default Credentials

- Email: `admin@example.com`
- Password: `Welcome1$`
