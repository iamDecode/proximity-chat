const fs = require('fs');
const {v4 : v4uuid } = require('uuid');
const express = require('express');
const mediasoup = require('mediasoup');
const { ProximityChatService } = require('./proximity-chat-service');
const { MediasoupService } = require('./mediasoup-service');

const uws = require('uWebSockets.js');

const httpServices = express();

// Set up servers and SSL.
var httpServer;
var socketServer;
if ((process.env.SSL_CERT_PATH == undefined)
    != (process.env.SSL_KEY_PATH == undefined)) {
  throw 'The SSL_CERT_PATH or SSL_KEY_PATH environment variable was set, but ' +
        'not both. Either define both to make the server work only over HTTPS, ' +
        'or neither to make the server only work over HTTP';
} else if (process.env.SSL_CERT_PATH) {
  const https = require('https');

  httpServer = https.createServer({
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
  }, httpServices);
  socketServer = uws.SSLApp({
    key_file_name: process.env.SSL_KEY_PATH,
    cert_file_name: process.env.SSL_CERT_PATH
  });

  console.log('Loading server with encryption.');
} else {
  const http = require('http');

  httpServer = http.createServer(httpServices);
  socketServer = uws.App();

  console.log('Loading server without encryption.');
}

httpServices.use('/public', express.static('public'));
httpServices.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
})

// Create and register services.
const pcService = new ProximityChatService(socketServer)
const msService = new MediasoupService(socketServer)

socketServer.ws('/*', {
  open: async ws => {
    ws.id = uuidv4();
  },
  message: async (...args) =>  {
    await pcService.message(...args)
    await msService.message(...args)
  }, 
  close: async (...args) => {
    await pcService.close(...args)
    await msService.close(...args)
  }
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
