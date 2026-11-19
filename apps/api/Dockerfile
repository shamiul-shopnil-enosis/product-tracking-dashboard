FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
RUN pnpm install --filter api... --no-frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter api build

FROM node:22-alpine
WORKDIR /repo
RUN corepack enable
ENV NODE_ENV=production
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
RUN pnpm install --filter api... --prod --no-frozen-lockfile
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main"]
