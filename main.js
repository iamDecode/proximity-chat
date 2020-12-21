const fs = require('fs');

const https = require('https');
const express = require('express');
const { ExpressPeerServer } = require('peer');

const { v4: uuidv4 } = require('uuid');

const uws = require('uWebSockets.js');
const { StringDecoder } = require('string_decoder');
const decoder = new StringDecoder('utf8');

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
const users = [];

// handle socket connection
const usocket = uws.SSLApp({key_file_name: keyFile, cert_file_name: certFile}).ws('/*', {
  open: (ws) => {
    const id = uuidv4();
    const pos = {x: 100, y: 100};
    
    console.log('user connected', id);

    // Tell the other users to connect to this user
    usocket.publish('join', JSON.stringify({join: {id: id, pos: pos}}));

    // Let this client listen to join, leave, and position broadcasts
    ws.subscribe('join');
    ws.subscribe('leave');
    ws.subscribe('position');

    // Tell user his or her id
    ws.send(JSON.stringify({'id': id}));

    // ..and players info
    ws.send(JSON.stringify({
      'players': users
        .filter(u => u.id !== id)
        .map(u => ({id: u.id, pos: u.pos}))
    }));

    const user = { id, ws, pos };
    user.emitPos = throttle((x, y) => {
      usocket.publish('position', JSON.stringify({position: {id: id, pos: {x: x, y: y}}}));
    }, 25);

    users.push(user);
  },
  message: (ws, message, isBinary) => {
    let json = JSON.parse(decoder.write(Buffer.from(message)));

    const index = users.findIndex(u => u.id === json.id);
    if (index !== -1) {
      users[index].pos = json.pos;
      // emit the position, throttled
      users[index].emitPos(json.pos.x, json.pos.y);
    }
  },
  close: (ws, code, message) => {
    const user = users.find(u => u.ws === ws);
    console.log('user disconnected', user.id);

    // let other users know to disconnect this client
    usocket.publish('leave', JSON.stringify({leave: {id: user.id}}));

    // remove the user from the users list
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      users.splice(index, 1);
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
