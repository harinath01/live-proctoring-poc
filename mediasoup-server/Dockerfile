FROM node:20-alpine

WORKDIR /app

COPY mediasoup-server/package.json ./
RUN npm install

COPY mediasoup-server/server.js ./

EXPOSE 3000

CMD ["npm", "start"]
