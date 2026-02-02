FROM node:24-bookworm

# Railway is building from the repo root, but the app lives in /based-intern.
WORKDIR /app/based-intern

# Install dependencies first for better caching
COPY based-intern/package.json ./
RUN npm install

# Copy the app
COPY based-intern/ ./

# Playwright: install browser + required OS deps
RUN npx playwright install --with-deps chromium

# Build TypeScript (runs `tsc -p tsconfig.json`)
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start"]

