# Live Proctoring POC

## Setup

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with your settings (SECRET_KEY, POSTGRES_PASSWORD, etc.)

# 2. Generate secure keys if needed
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Docker Commands

```bash
# Start all services with live reload
docker compose watch

# Run database migrations only
docker compose run --rm prestart

# Seed the first superuser (admin@example.com / Welcome1$)
docker compose run --rm backend bash -c "uv run python -m app.initial_data"

# View logs
docker compose logs -f          # all services
docker compose logs -f backend  # specific service

# Stop services
docker compose down

# Stop services and delete volumes (wipes DB)
docker compose down -v

# Run tests
docker compose run --rm backend bash scripts/test.sh
```

## URLs

| Service       | URL                                |
|---------------|------------------------------------|
| Frontend      | http://localhost:5173              |
| Backend API   | http://localhost:8000              |
| Swagger Docs  | http://localhost:8000/docs         |
| Adminer (DB)  | http://localhost:8080              |
| Traefik UI    | http://localhost:8090              |
| MailCatcher   | http://localhost:1080              |

## Default Credentials

- Email: `admin@example.com`
- Password: `Welcome1$`
