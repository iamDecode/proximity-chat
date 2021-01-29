const fs = require('fs');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const { ProximityChatService } = require('./proximity-chat-service');
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

// Create and register services.
const peerBrokerService = ExpressPeerServer(httpServer)
  .on('connection', peer => {
    console.log('peer connected', peer.id);
  })
  .on('disconnect', peer => {
    console.log('peer disconnected', peer.id);
  });

httpServices.use('/peerjs', peerBrokerService);
httpServices.use('/public', express.static('public'));
httpServices.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

socketServer.ws('/*', new ProximityChatService(socketServer).asWebSocketBehavior());
  
// Start servers.
socketServer.listen(9001, (token) => {
  if (token) {
    console.log('Listening to port 9001');
  } else {
    console.log('Failed to listen to port 9001');
  }
});
httpServer.listen(3000);
