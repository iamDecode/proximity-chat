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
  open: (ws) => {
    const id = uuidv4();
    const pos = {x: 100, y: 100};
    
    console.log('user connected', id);

    // Tell user his or her id
    ws.send(JSON.stringify({'id': id}));

    // Tell the other users to connect to this user
    usocket.publish('join', JSON.stringify({join: {id: id, pos: pos}}));

    // Let this client listen to join, leave, and position broadcasts
    ws.subscribe('join');
    ws.subscribe('leave');
    ws.subscribe('position');

    // ..and players info
    ws.send(JSON.stringify({
      'players': Object.entries(users)
        .filter(u => u[0] !== id)
        .map(u => ({id: u[1].id, pos: u[1].pos}))
    }));

    const user = { id, ws, pos };
    user.emitPos = throttle((x, y) => {
      usocket.publish('position', String([id, x, y]));
    }, 25);

    users[id] = user;
  },
  message: (ws, message, isBinary) => {
    const [id, x, y] = Buffer.from(message).toString().split(",");
    const user = users[id]
    if (user != null) {
      user.pos.x = x;
      user.pos.y = y;
      user.emitPos(x, y); // emit the position, throttled
    }
  },
  close: (ws, code, message) => {
    const user = Object.values(users).find(u => u.ws === ws);
    console.log('user disconnected', user.id);

    // let other users know to disconnect this client
    usocket.publish('leave', JSON.stringify({leave: {id: user.id}}));

    // remove the user from the users list
    delete users[user.id]
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
