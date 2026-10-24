# Single-container deploy (Render / Railway / Fly / any Docker host).
# Serves the built app and the API from one Node process.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/core ./src/core
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
