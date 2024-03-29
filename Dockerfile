FROM node:14

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./
RUN yarn install --prod --immutable

COPY *.js ./
COPY public public/

EXPOSE 3000 9001 10000-11000
CMD ["node", "main.js"]
