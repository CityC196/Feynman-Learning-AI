FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=5173
ENV DATA_DIR=/app/data

EXPOSE 5173

CMD ["npm", "start"]
