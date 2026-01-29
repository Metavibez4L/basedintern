FROM node:20-bookworm

WORKDIR /app

# Install dependencies first for better caching
COPY package.json ./
RUN npm install

# Copy source
COPY . .

# Playwright: install browser + required OS deps
RUN npx playwright install --with-deps chromium

# Build TypeScript
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]

