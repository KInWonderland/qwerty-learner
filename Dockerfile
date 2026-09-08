FROM node:20 AS build

WORKDIR /app

# 与本地一致：用 yarn + lockfile 安装，未改依赖时可复用缓存层
COPY package.json yarn.lock .yarnrc ./
RUN yarn install --frozen-lockfile
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN yarn build

# 运行 Node 服务: 同时提供 API(SQLite) 与前端静态文件
FROM node:20

WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/index.js"]
