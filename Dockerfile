FROM node:20 AS build

# 设置工作目录
WORKDIR /app

COPY . .
RUN npm config set registry  https://registry.npmmirror.com  
RUN npm install
RUN npm run build

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
