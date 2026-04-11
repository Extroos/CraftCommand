FROM node:18-alpine

WORKDIR /app

# Install build tools to allow systeminformation to compile its native extensions
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start"]
