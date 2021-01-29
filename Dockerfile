FROM node:10

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./
RUN yarn install

COPY *.js ./
COPY public public/

EXPOSE 3000 9001
CMD ["node", "main.js"]
