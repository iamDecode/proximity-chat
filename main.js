const fs = require('fs');

const https = require('https');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const { ProximityChatService } = require('./proximity-chat-service');

const uws = require('uWebSockets.js');

// setup ssl
const certFile = './cert.pem'
const keyFile = './key.pem'
const SSL_CONFIG = {
  cert: fs.readFileSync(certFile),
  key: fs.readFileSync(keyFile),
};

const httpServices = express();
const httpServer = https.createServer(SSL_CONFIG, httpServices);

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

const socketServer = uws.SSLApp({key_file_name: keyFile, cert_file_name: certFile});
socketServer.ws('/*', new ProximityChatService(socketServer).asWebSocketBehavior());
  
socketServer.listen(9001, (token) => {
  if (token) {
    console.log('Listening to port 9001');
  } else {
    console.log('Failed to listen to port 9001');
  }
});
httpServer.listen(3000);
