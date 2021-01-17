const fs = require('fs');

const https = require('https');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const { ProximityChatService } = require('./proximity_chat_service');

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

<<<<<<< HEAD
const socketServer = uws.SSLApp({key_file_name: keyFile, cert_file_name: certFile});
socketServer.ws('/*', new ProximityChatService(socketServer).AsWebSocketBehavior());
  
socketServer.listen(9001, (token) => {
    if (token) {
      console.log('Listening to port 9001');
    } else {
      console.log('Failed to listen to port 9001');
    }
  });
httpServer.listen(3000);
=======
// track which users are connected
const users = {};

// handle socket connection
const usocket = uws.SSLApp({key_file_name: keyFile, cert_file_name: certFile}).ws('/*', {
  message: (ws, message, isBinary) => {
    const components = Buffer.from(message).toString().split(",");

    if (components[0] == "ping") {
      ws.send("pong");
      return
    }

    if (components[0] == "connect") {
      const id = uuidv4();
      const pos = {x: 100, y: 100};
      const name = components[1];
      
      console.log('user connected', id);

      // Tell user his or her id
      ws.send(JSON.stringify({'id': id}));

      // Tell the other users to connect to this user
      usocket.publish('join', JSON.stringify({join: {id: id, name: name, pos: pos}}));

      // Let this client listen to join, leave, and position broadcasts
      ws.subscribe('join');
      ws.subscribe('leave');
      ws.subscribe('position');
      ws.subscribe('update');

      // ..and players info
      ws.send(JSON.stringify({
        'players': Object.entries(users)
          .filter(u => u[0] !== id)
          .map(u => ({
            id: u[1].id, 
            name: u[1].name, 
            audioEnabled: u[1].audioEnabled,
            videoEnabled: u[1].videoEnabled,
            pos: u[1].pos, 
            broadcast: u[1].broadcast
          }))
      }));

      const user = { ws, id, name, audioEnabled: true, videoEnabled: true, pos, broadcast: false };
      user.emitPos = (x, y) => {
        usocket.publish('position', String([id, x, y]));
      }

      users[id] = user;
      return
    }

    const id = components[0]
    const user = users[id]
    
    if (user == null) { 
      return 
    }

    // Update
    if (components[1] == "update") {
      user.name = components[2];
      user.audioEnabled = components[3] === "true";
      user.videoEnabled = components[4] === "true";
      user.broadcast = components[5] === "true";
      usocket.publish('update', JSON.stringify({
        update: {
          id: user.id, 
          name: user.name, 
          audioEnabled: user.audioEnabled, 
          videoEnabled: user.videoEnabled, 
          broadcast: user.broadcast
        }
      }));
      return;
    }

    // Position  
    user.pos.x = parseInt(components[1]);
    user.pos.y = parseInt(components[2]);
    user.emitPos(user.pos.x, user.pos.y); // emit the position, throttled
  },
  close: (ws, code, message) => {
    const user = Object.values(users).find(u => u.ws === ws);

    if (user != null) {
      console.log('user disconnected', user.id);

      // let other users know to disconnect this client
      usocket.publish('leave', JSON.stringify({leave: {id: user.id}}));

      // remove the user from the users list
      delete users[user.id]
    }
  }
}).listen(9001, (token) => {
  if (token) {
    console.log('Listening to port 9001');
  } else {
    console.log('Failed to listen to port 9001');
  }
});

peerServer.on('connection', peer => {
  console.log('peer connected', peer.id);
});

peerServer.on('disconnect', peer => {
  console.log('peer disconnected', peer.id);
});

server.listen(3000);
>>>>>>> master
