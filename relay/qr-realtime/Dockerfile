FROM node:22.19.0-alpine3.22
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "src/index.mjs"]
