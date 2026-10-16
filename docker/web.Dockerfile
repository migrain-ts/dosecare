FROM node:22-slim
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN npm ci --workspace @dosecare/web --include-workspace-root
RUN npm run build -w @dosecare/web
CMD ["npm", "run", "start", "-w", "@dosecare/web"]
