FROM node:22-bookworm

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY mediasoup-server/package.json ./
RUN npm install

COPY mediasoup-server/server.js ./

EXPOSE 3000

CMD ["npm", "start"]
