# Stage 1: Build the agent application
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run the production application
FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY config.json ./config.json
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
