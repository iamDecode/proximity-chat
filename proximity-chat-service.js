const {ROOM_CONFIG} = require('./public/room/config');

// Calculate a starting position. Spread out players so joining players don't
// all start out overlapping each other.
function calculateStartPosition(room, nUsers) {
  // Approximate radius of player bubble plus some spacing.
  const spreadOutDistance = 150;

  // Distribute players as follows:
  const offsetX = nUsers % 2 == 1; // 2nd and 4th player are offset right.
  const offsetY = nUsers % 4 >= 2; // 3rd and 4th player are offset down.

  return {
    x: ROOM_CONFIG[room].starting_position.x + offsetX * spreadOutDistance,
    y: ROOM_CONFIG[room].starting_position.y + offsetY * spreadOutDistance,
  };
}

class ProximityChatService {
  constructor(usocket) {
    // track which users are connected
    this.users = {};

    // To broadcast, especially in close().
    this.usocket = usocket;
  }

  async message(ws, message, isBinary) {
    const components = Buffer.from(message).toString().split(',');

    if (components[0] == 'ping') {
      ws.send('pong');
      return;
    }

    if (components[0] == 'room') {
      if (components[1] !== '') {
        ws.room = components[1];
      }
      return;
    }

    if (components[0] == 'connect') {
      const name = components[1];
      const id = ws.id;
      const pos = calculateStartPosition(ws.room, Object.keys(this.users).length);

      console.log('user connected', id, 'to room', ws.room);

      // Tell user his or her id
      ws.send(JSON.stringify({'id': id, 'pos': pos}));

      // Tell the other users to connect to this user
      this.usocket.publish(`${ws.room}-join`, JSON.stringify({join: {id: id, name: name, pos: pos}}));

      // Let this client listen to join, leave, and position broadcasts
      ws.subscribe(`${ws.room}-join`);
      ws.subscribe(`${ws.room}-leave`);
      ws.subscribe(`${ws.room}-add`);
      ws.subscribe(`${ws.room}-remove`);
      ws.subscribe(`${ws.room}-drink`);
      ws.subscribe(`${ws.room}-position`);
      ws.subscribe(`${ws.room}-update`);

      // ..and players info
      ws.send(JSON.stringify({
        'players': Object.entries(this.users)
            .filter((u) => u[0] !== id)
            .map((u) => ({
              id: u[1].id,
              name: u[1].name,
              audioEnabled: u[1].audioEnabled,
              videoEnabled: u[1].videoEnabled,
              pos: u[1].pos,
              broadcast: u[1].broadcast,
              objects: u[1].objects,
              drink: u[1].drink,
            })),
      }));

      const user = {
        ws,
        id,
        name,
        audioEnabled: true,
        videoEnabled: true,
        pos,
        broadcast: false,
        objects: {},
      };
      user.emitPos = (objectId, x, y) => {
        this.usocket.publish(`${ws.room}-position`, String([id, objectId, x, y]));
      };

      this.users[id] = user;
      return;
    }

    const user = this.users[ws.id];
    if (user == null) {
      return;
    }

    if (components[0] == 'update') {
      user.name = components[1];
      user.audioEnabled = components[2] === 'true';
      user.videoEnabled = components[3] === 'true';
      user.broadcast = components[4] === 'true';
      this.usocket.publish(`${ws.room}-update`, JSON.stringify({
        update: {
          id: user.id,
          name: user.name,
          audioEnabled: user.audioEnabled,
          videoEnabled: user.videoEnabled,
          broadcast: user.broadcast,
        },
      }));
      return;
    }

    if (components[0] == 'add') {
      const objectId = components[1];
      const object = {
        pos: {x: user.pos.x, y: user.pos.y},
      };
      user.objects[objectId] = object;
      this.usocket.publish(`${ws.room}-add`, JSON.stringify({
        add: {
          id: user.id,
          objectId: objectId,
          pos: object.pos,
        },
      }));
    }

    if (components[0] == 'remove') {
      const objectId = components[1];
      this.usocket.publish(`${ws.room}-remove`, JSON.stringify({
        remove: {
          id: user.id,
          objectId: objectId,
        },
      }));
      delete user.objects[objectId];
    }

    const config = ROOM_CONFIG[ws.room];
    if (components[0] == 'drink' && 'drinks' in config) {
      const dist = Math.hypot(config.drinks.y - user.pos.y, config.drinks.x - user.pos.x);
      if (dist <= config.drinks.range) {
        const drinkId = components[1];
        user.drink = {id: drinkId, time: Date.now()};
        this.usocket.publish(`${ws.room}-drink`, JSON.stringify({
          drink: {
            id: user.id,
            drinkId: user.drink.id,
            time: user.drink.time,
          },
        }));
      }
    }

    if (components[0] == 'pos') {
      let objectId;
      const x = parseInt(components[2]);
      const y = parseInt(components[3]);

      if (components[1] == '') {
        objectId = '';
        user.pos.x = x;
        user.pos.y = y;
      } else {
        objectId = components[1];
        user.objects[objectId].pos.x = x;
        user.objects[objectId].pos.y = y;
      }

      user.emitPos(objectId, x, y);
    }

    // Else: probably something for mediasoup service.
  }

  async close(ws, code, message) {
    const user = this.users[ws.id];

    if (user != null) {
      console.log('user disconnected', user.id);

      // let other users know to disconnect this client
      this.usocket.publish(`${ws.room}-leave`, JSON.stringify({leave: {id: user.id}}));

      // remove the user from the users list
      delete this.users[user.id];
    }
  }
}

module.exports = {ProximityChatService};
