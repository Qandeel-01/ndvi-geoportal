FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies (layer is cached until package*.json changes).
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# Run as the non-root "node" user that ships with the image.
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
