const fs = require('fs');

const https = require('https');
const express = require('express');
const { ExpressPeerServer } = require('peer');

const { v4: uuidv4 } = require('uuid');

const uws = require('uWebSockets.js');

// setup ssl
const certFile = './cert.pem'
const keyFile = './key.pem'
const SSL_CONFIG = {
  cert: fs.readFileSync(certFile),
  key: fs.readFileSync(keyFile),
};

// setup express, uwebsocket, and peerjs
const app = express();
const server = https.createServer(SSL_CONFIG, app);


// peerjs's express server is garbage and hijacks ALL websocket upgrades regardless of route
const peerjsWrapper = {on(event, callback) {
  if (event === 'upgrade') {
    server.on('upgrade', (req, socket, head) => {
      if (!req.url.startsWith('/socket.io/'))
        callback(req, socket, head);
    })
  } else {
    server.on(...arguments);
  }
}};

const peerServer = ExpressPeerServer(peerjsWrapper);

// use peerjs with express
app.use('/peerjs', peerServer);
app.use('/public', express.static('public'));

// send index file
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const throttle = (func, limit) => {
  let lastFunc
  let lastRan
  return function() {
    const context = this
    const args = arguments
    if (!lastRan) {
      func.apply(context, args)
      lastRan = Date.now()
    } else {
      clearTimeout(lastFunc)
      lastFunc = setTimeout(function() {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(context, args)
          lastRan = Date.now()
        }
      }, limit - (Date.now() - lastRan))
    }
  }
}

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
      user.emitPos = throttle((x, y) => {
        usocket.publish('position', String([id, x, y]));
      }, 25);

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
