const { v4: uuidv4 } = require('uuid');

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
      message: ProximityChatService.prototype.message.bind(this),
      close: ProximityChatService.prototype.close.bind(this),
    }
  }

  message(ws, message, isBinary) {
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
      this.usocket.publish('join', JSON.stringify({join: {id: id, name: name, pos: pos}}));

      // Let this client listen to join, leave, and position broadcasts
      ws.subscribe('join');
      ws.subscribe('leave');
      ws.subscribe('position');
      ws.subscribe('update');

      // ..and players info
      ws.send(JSON.stringify({
        'players': Object.entries(this.users)
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
        this.usocket.publish('position', String([id, x, y]));
      };

      this.users[id] = user;
      return
    }

    const id = components[0]
    const user = this.users[id]
    
    if (user == null) { 
      return 
    }

    // Update
    if (components[1] == "update") {
      user.name = components[2];
      user.audioEnabled = components[3] === "true";
      user.videoEnabled = components[4] === "true";
      user.broadcast = components[5] === "true";
      this.usocket.publish('update', JSON.stringify({
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
    user.emitPos(user.pos.x, user.pos.y);
  }

  close(ws, code, message) {
    const user = Object.values(this.users).find(u => u.ws === ws);
    
    if (user != null) {
      console.log('user disconnected', user.id);

      // let other users know to disconnect this client
      this.usocket.publish('leave', JSON.stringify({leave: {id: user.id}}));

      // remove the user from the users list
      delete this.users[user.id]
    }
  }
}

module.exports = { ProximityChatService };