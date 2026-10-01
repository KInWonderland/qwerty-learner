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
COPY --from=build /app/.env ./.env

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --retries=6 \
  CMD node --env-file=.env -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "--env-file=.env", "server/index.js"]
