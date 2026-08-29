# Built from the workspace root so the shared tsconfig and lockfile come along.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.json ./
COPY apps/demo-api/package.json apps/demo-api/
COPY packages/core/package.json packages/core/
COPY packages/test-data/package.json packages/test-data/
COPY suites/regression/package.json suites/regression/
RUN npm ci --omit=optional
COPY apps/demo-api apps/demo-api
RUN npm run build --workspace apps/demo-api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/demo-api/dist ./dist
COPY --from=build /repo/apps/demo-api/package.json ./package.json
COPY --from=build /repo/apps/demo-api/migrations ./migrations
EXPOSE 3000
CMD ["node", "dist/index.js"]
