FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src/ src/
RUN npx tsup

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/package.json .
COPY data/ data/
COPY src/web/public/ src/web/public/

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "dist/index.js"]
