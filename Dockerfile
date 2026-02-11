FROM node:22

WORKDIR /usr/src/app
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install
COPY . .
CMD ["pnpm", "start"]