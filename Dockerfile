# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3042 \
    PROJECT_ROOT=/srv/hoshimi \
    DB_PATH=/data/hoshimi.sqlite3 \
    GUIDELINES_PATH=/srv/hoshimi/docs/translation-guidelines.md \
    AI_GUIDELINES_PATH=/srv/hoshimi/docs/ai-guidelines.txt
WORKDIR /srv/hoshimi
COPY --from=build /src/app/build ./app/build
COPY --from=build /src/app/node_modules ./app/node_modules
COPY app/package.json ./app/package.json
COPY docs ./docs
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3042
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app/build/index.js"]
