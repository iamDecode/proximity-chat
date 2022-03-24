const fs = require('fs');
const {v4: uuidv4} = require('uuid');
const express = require('express');
const {ProximityChatService} = require('./proximity-chat-service');
const {MediasoupService} = require('./mediasoup-service');
const {ROOM_CONFIG} = require('./public/room/config');

const uws = require('uWebSockets.js');

const httpServices = express();

// Set up servers and SSL.
let httpServer;
let socketServer;
if ((process.env.SSL_CERT_PATH == undefined) !=
    (process.env.SSL_KEY_PATH == undefined)) {
  throw new Error(
      'The SSL_CERT_PATH or SSL_KEY_PATH environment variable was set, but ' +
      'not both. Either define both to make the server work only over HTTPS, ' +
      'or neither to make the server only work over HTTP');
} else if (process.env.SSL_CERT_PATH) {
  const https = require('https');

  httpServer = https.createServer({
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
  }, httpServices);
  socketServer = uws.SSLApp({ // eslint-disable-line new-cap
    key_file_name: process.env.SSL_KEY_PATH,
    cert_file_name: process.env.SSL_CERT_PATH,
  });

  console.log('Loading server with encryption.');
} else {
  const http = require('http');

  httpServer = http.createServer(httpServices);
  socketServer = uws.App(); // eslint-disable-line new-cap

  console.log('Loading server without encryption.');
}

// Create and register services.
httpServices.use('/public', express.static('public'));
httpServices.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});


const services = new Map(Object.keys(ROOM_CONFIG).map((room) => {
  return [room, {
    pcService: new ProximityChatService(socketServer, room),
    msService: new MediasoupService(socketServer, room),
  }];
}));

socketServer.ws('/*', {
  open: async (ws) => {
    ws.id = uuidv4();
    ws.room = Object.keys(ROOM_CONFIG)[0];
  },
  message: async (...args) => {
    const ws = args[0];
    await services.get(ws.room).pcService.message(...args);
    await services.get(ws.room).msService.message(...args);
  },
  close: async (...args) => {
    const ws = args[0];
    await services.get(ws.room).pcService.close(...args);
    await services.get(ws.room).msService.close(...args);
  },
});

// Start servers.
socketServer.listen(9001, (token) => {
  if (token) {
    console.log('Listening to port 9001');
  } else {
    console.log('Failed to listen to port 9001');
  }
});
httpServer.listen(3000);

process.on('unhandledRejection', (r) => console.log(r));
