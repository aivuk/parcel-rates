# Frontend: build the Vite app, then serve it with an unprivileged nginx that
# also proxies /api to the backend service.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf nginx/security-headers-base.conf /etc/nginx/snippets/
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
