FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install node-fetch fast-xml-parser

CMD ["node", "backfill_grants.js"]
