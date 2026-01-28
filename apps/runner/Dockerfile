FROM node:18-bullseye

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY src ./src

CMD ["npm", "start"]
