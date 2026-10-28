# Frontend: build the Vite app and the agent-log pages, then serve both with an
# unprivileged nginx that also proxies /api to the backend service.
# Build context is the repository root (see docker-compose.yml), because the
# agent-log pages are rendered from docs/agent-log by tools/agent_log_html.py.
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# The agent log (parcels.vaz.io/agent-log): the exported sessions as static pages.
FROM python:3.12-alpine AS agent-log
COPY --from=ghcr.io/astral-sh/uv:0.7.9 /uv /bin/uv
WORKDIR /src
COPY tools/agent_log_html.py tools/agent_log_stats.py tools/
COPY docs/agent-log docs/agent-log
RUN uv run --no-cache tools/agent_log_html.py --out /out/agent-log

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY frontend/nginx/security-headers.conf frontend/nginx/security-headers-base.conf /etc/nginx/snippets/
COPY --from=build /src/dist /usr/share/nginx/html
COPY --from=agent-log /out/agent-log /usr/share/nginx/html/agent-log
EXPOSE 8080
