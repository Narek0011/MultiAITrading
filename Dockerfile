FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Fonts for the server-side chart renderer
RUN apk add --no-cache fontconfig font-inter font-dejavu
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/views ./views
COPY --from=build /app/public ./public
COPY package.json ./
RUN mkdir -p storage/charts
EXPOSE 3000
CMD ["node", "dist/main"]
