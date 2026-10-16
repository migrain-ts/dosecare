FROM node:22-slim
ARG APP
ENV APP=${APP}
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN npm ci --workspace @dosecare/${APP} --include-workspace-root
CMD ["sh", "-c", "npm run start -w @dosecare/${APP}"]
