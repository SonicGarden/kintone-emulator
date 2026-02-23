FROM node:22-alpine AS base

RUN apk update && \
    apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/v3.18/main make gcc g++ python3~=3.11.12

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
RUN cd node_modules/sqlite3;npm rebuild

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build

EXPOSE 12345
CMD [ "pnpm", "start"]
