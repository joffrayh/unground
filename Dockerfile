# syntax=docker/dockerfile:1

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# Public origin baked into the build (see vite.config.ts); empty = derive from the Host header, assume https.
ARG ORIGIN=""
RUN ORIGIN="$ORIGIN" npm run build && npm prune --omit=dev

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# SQL migrations, applied automatically at server start (src/hooks.server.ts).
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "build"]
