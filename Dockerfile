FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install @supabase/supabase-js fast-xml-parser openai

CMD ["node", "backfill_grants.js"]
