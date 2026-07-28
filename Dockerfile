FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.html styles.css app.js ./
COPY daily-report.js daily-report.css supervision.js supervision.css ./
COPY whiteboard.js whiteboard.css kimi.js voice-class.js teaching-visuals.js ./
COPY pwa.js sw.js manifest.webmanifest app-icon.svg favicon.ico server.js ./

USER node
EXPOSE 10000
CMD ["node", "server.js"]
