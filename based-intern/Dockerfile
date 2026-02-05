FROM node:24-bookworm

WORKDIR /app

# Install dependencies first for better caching
COPY package.json ./
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]

