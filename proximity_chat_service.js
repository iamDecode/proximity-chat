const { v4: uuidv4 } = require('uuid');

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

class ProximityChatService {

  constructor(usocket) {
    // track which users are connected
    this.users = {};
    // To broadcast, especially in close().
    this.usocket = usocket;
  }
  
  // WebSockets calls handlers in a funny way that doesn't set `this`, so bind
  // those explicitly.
  AsWebSocketBehavior() {
    return {
      open: ProximityChatService.prototype.open.bind(this),
      message: ProximityChatService.prototype.message.bind(this),
      close: ProximityChatService.prototype.close.bind(this),
    }
  }
    
  open(ws) {
    const id = uuidv4();
    const pos = {x: 100, y: 100};
    
    console.log('user connected', id);

    // Tell user his or her id
    ws.send(JSON.stringify({'id': id}));

    // Tell the other users to connect to this user
    this.usocket.publish('join', JSON.stringify({join: {id: id, pos: pos}}));

    // Let this client listen to join, leave, and position broadcasts
    ws.subscribe('join');
    ws.subscribe('leave');
    ws.subscribe('position');
    ws.subscribe('broadcast');

    const players_info = Object.entries(this.users)
        .filter(u => u[0] !== id)
        .map(u => ({id: u[1].id, pos: u[1].pos, broadcast: u[1].broadcast}));
    ws.send(JSON.stringify({'players': players_info}));

    const user = { id, ws, pos, broadcast: false };
    user.emitPos = throttle((x, y) => {
      this.usocket.publish('position', String([id, x, y]));
    }, 25);

    this.users[id] = user;
  }

  message(ws, message, isBinary) {
    const components = Buffer.from(message).toString().split(",");

    if (components[0] == "ping") {
      ws.send("pong");
      return
    }

    const id = components[0]
    const user = this.users[id]
    
    if (user == null) { 
      return 
    }

    // Broadcast
    if (components[1] == "broadcast") {
      user.broadcast = components[2] === "true";
      this.usocket.publish('broadcast', JSON.stringify({broadcast: {id: id, enabled: user.broadcast}}));
      return;
    }

    // Position  
    user.pos.x = parseInt(components[1]);
    user.pos.y = parseInt(components[2]);
    user.emitPos(user.pos.x, user.pos.y); // emit the position, throttled
  }

  close(ws, code, message) {
    const user = Object.values(this.users).find(u => u.ws === ws);
    console.log('user disconnected', user.id);

    // let other users know to disconnect this client
    this.usocket.publish('leave', JSON.stringify({leave: {id: user.id}}));

    // remove the user from the users list
    delete this.users[user.id]
  }
}

module.exports = { ProximityChatService };