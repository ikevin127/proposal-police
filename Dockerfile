FROM node:19-slim
WORKDIR /usr/src/app
COPY package.json package-lock.json .env ./
RUN npm ci --production
RUN npm install -g typescript
RUN npm cache clean --force
ENV NODE_ENV="production"
COPY . .
RUN npm install --only=development
RUN npm run build
RUN npm prune --production
EXPOSE 3000
CMD [ "npm", "start" ]
