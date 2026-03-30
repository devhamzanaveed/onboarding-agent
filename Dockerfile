FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Install dashboard dependencies
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci

# Copy source
COPY . .

# Build dashboard
RUN cd dashboard && npm run build

# Generate Prisma client
RUN npx prisma generate

# Build NestJS
RUN npm run build:server

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
