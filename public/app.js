const app = new PIXI.Application({
  view: document.querySelector('canvas'),
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
  resolution: window.devicePixelRatio,
  autoResize: true
})

// create viewport
const viewport = new Viewport.Viewport({
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    worldWidth: 3200,
    worldHeight: 1800,
    interaction: app.renderer.plugins.interaction
})

// add the viewport to the stage
app.stage.addChild(viewport)

// activate plugins
viewport
    .drag()
    .pinch()
    .wheel()
    .clamp({direction: 'all'})
    .clampZoom({maxWidth: 3200, maxHeight: 1800})

// add a red box
const sprite = viewport.addChild(new PIXI.Sprite.from('public/assets/room.png'))




class Player extends PIXI.Sprite {
  constructor(id, avatar, pos, goal) {
    super(PIXI.Texture.WHITE);

    this.id = id
    this.avatar = avatar
    this.pos = pos
    this.goal = goal

    // PIXI setup
    const circle = new PIXI.Graphics();
    this.addChild(circle);
    this.mask = circle;

    this.anchor.set(0.5);
    this.x = goal.x;
    this.y = goal.y;
    this.size = 80
    this.setSize(this.size, this.size);

    viewport.addChild(this)
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;

    const size = Math.min(width, height);

    this.mask.clear();
    this.mask.beginFill(0xffffff);
    this.mask.drawEllipse(0, 0, size/(2*this.scale.x), size/(2*this.scale.y));
    this.mask.endFill();

    this._originalScale = [this.scale.x, this.scale.y];
  }

  addVideo(element) {
    element.addEventListener('resize', e => {
      const texture = PIXI.Texture.from(element);
      this.texture = null

      setTimeout(_ => {
        this.texture = texture;

        console.log("size changed to", texture.width, texture.height)

        let width, height;
        if (texture.width > texture.height) {
          width = this.size * (texture.width/texture.height)
          height = this.size
        } else {
          height = this.size * (texture.height/texture.width)
          width = this.size
        }
        this.setSize(width, height)
      }, 100)
    })
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;

    const [left, right] = calcVolumes({x: selfPlayer.x, y: selfPlayer.y}, {x: this.x, y: this.y})
    this.stream.setVolume(left, right);

    let scalar = (Math.max(left, right) * (1 - 0.5)) + 0.5;
    this.scale.set(this._originalScale[0] * scalar, this._originalScale[1] * scalar)
  }

  // updatePosition() {
  //   const speed = 25
  //   const delta = app.ticker.elapsedMS / 1000;
  //   this.position.x += (this.goal.x - this.position.x) * speed * delta;
  //   this.position.y += (this.goal.y - this.position.y) * speed * delta;
  // }

  // render(renderer) {
  //   this.updatePosition()
  //   super.render(renderer)
  // }
}

class SelfPlayer extends Player {
 constructor(id, avatar, pos, goal) {
    super(id, avatar, pos, goal);

    this.tint = 0xff0000
    this.interactive = true
    this.buttonMode = true

    this
      // events for drag start
      .on('mousedown', this.onDragStart)
      .on('touchstart', this.onDragStart)
      // events for drag end
      .on('mouseup', this.onDragEnd)
      .on('mouseupoutside', this.onDragEnd)
      .on('touchend', this.onDragEnd)
      .on('touchendoutside', this.onDragEnd)
      // events for drag move
      .on('mousemove', this.onDragMove)
      .on('touchmove', this.onDragMove);

    this.sendPos = throttle((x, y) => socket.emit('pos', x, y), 25);
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this.sendPos(this.x, this.y);

    players.forEach(player => {
      player.setPosition(player.x, player.y);
    })
  }

  // updatePosition() {

  // }

  onDragStart(event) {
    event.stopPropagation()
    this.data = event.data;
    this.dragging = true;
  }

  onDragEnd() {
    this.dragging = false;
    this.data = null;
  }

  onDragMove(event) {
    if (!this.dragging) { return }
    event.stopPropagation()
    const newPosition = this.data.getLocalPosition(this.parent);
    this.setPosition(newPosition.x, newPosition.y);
  } 
}





const $ = document.querySelector.bind(document);
const log = (...args) => logs.innerText += args.join(' ') + '\n';
const SOUND_CUTOFF_RANGE = 250;
const SOUND_NEAR_RANGE = 80;

const socket = io();

// throttle a function
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

const selfPlayer = new SelfPlayer("self", 0, {x:100, y:100}, {x:100, y:100});
const players = []; // TODO: should be a hashmap for fast lookup.


function calcVolumes(listenerPos, soundPos) {
  // calulate angle and distance from listener to sound
  const theta = Math.atan2(soundPos.y - listenerPos.y, soundPos.x - listenerPos.x);
  const dist = Math.hypot(soundPos.y - listenerPos.y, soundPos.x - listenerPos.x);
  const scale = 1 - (dist - SOUND_NEAR_RANGE) / (SOUND_CUTOFF_RANGE - SOUND_NEAR_RANGE);

  // target is too far away, no volume
  if (dist > SOUND_CUTOFF_RANGE)
    return [0, 0];

  // target is very close, max volume
  if (dist < SOUND_NEAR_RANGE)
    return [1, 1];

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return [
    (Math.pow((cos < 0 ? cos : 0), 2) + Math.pow(sin, 2)) * scale,
    (Math.pow((cos > 0 ? cos : 0), 2) + Math.pow(sin, 2)) * scale,
  ];
}

// get the current user's stream
function getStream() {
  return navigator.mediaDevices.getUserMedia({audio: true, video: true});
}

// split an audio stream into left and right channels
class StreamSplit {
  constructor(stream, {left=1, right=1}={}) {
    this.stream = stream;

    // create audio context using the stream as a source
    const track = stream.getAudioTracks()[0];
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(new MediaStream([track]));

    // create a channel for each ear (left, right)
    this.channels = {
      left: this.context.createGain(),
      right: this.context.createGain(),
    };

    // connect the gains
    this.source.connect(this.channels.left);
    this.source.connect(this.channels.right);

    // create a merger to join the two gains
    const merger = this.context.createChannelMerger(2);
    this.channels.left.connect(merger, 0, 0);
    this.channels.right.connect(merger, 0, 1);

    // set the volume for each side
    this.setVolume(left, right);

    // connect the merger to the audio context
    merger.connect(this.context.destination);

    this.destination = this.context.createMediaStreamDestination();
  }

  // set the volume
  setVolume(left=0, right=0) {
    // clamp volumes between 0 and 1
    left = Math.max(Math.min(left, 1), 0);
    right = Math.max(Math.min(right, 1), 0);

    // disable the stream if the volume is 0
    this.stream.enabled = left !== 0 && right !== 0;

    // set the volumes for each channel's gain
    this.channels.left.gain.value = left;
    this.channels.right.gain.value = right;
  }

  // close the context, stop the audio
  close() {
    return this.context.close();
  }
}

// play stream
function playStream(stream, target) {
  // create the video element for the stream
  const elem = document.createElement('video');
  elem.srcObject = stream;
  elem.muted = true;
  elem.setAttribute('data-peer', target);
  elem.onloadedmetadata = () => elem.play();

  // add it to the player
  const player = players.find(p => p.id === target);
  player.addVideo(elem);
}

let id, peer;

// create peer, setup handlers
function initPeer() {
  peer = new Peer(id, {host: location.hostname, port: location.port, path: '/peerjs'});

  peer.on('open', id => { log('My peer ID is:', id); });
  peer.on('disconnected', id => { log('lost connection'); });
  peer.on('error', err => { console.error(err); });

  // run when someone calls us. answer the call
  peer.on('call', async call => {
    log('call from', call.peer);
    call.answer(await getStream());
    receiveCall(call);
  });
}

// start a call with target
async function startCall(target) {
  if (!peer) return;
  const call = peer.call(target, await getStream());
  receiveCall(call);
}

// play the stream from the call in a video element
function receiveCall(call) {
  call.on('stream', stream => {
    // stream.noiseSuppression = true;
    const player = players.find(p => p.id === call.peer);
    if (!player) {
      console.log('couldn\'t find player for stream', call.peer);
    } else if (player.stream == null) {
      player.stream = new StreamSplit(stream, {left: 1, right: 1});
      playStream(stream, call.peer);
      log('created stream for', call.peer);
    }
  });
}

// setup peer when user receives id
socket.on('id', async connId => {
  // this only happens if we lose connection with the server
  if (id) {
    log('destroying old identity', id, 'and replacing with', connId);
    peer.destroy();
    peer = undefined;
    return;
  }

  id = connId;
  initPeer();
});

// talk to any user who joins
socket.on('join', (target, pos) => {
  log('calling', target);
  players.push(new Player(target, 0, pos, {x: pos.x, y: pos.y}));
  startCall(target);
});

socket.on('players', existingPlayers => {
  for (const p of existingPlayers) {
    players.push(new Player(
      p.id,
      0,
      p.pos,
      {x: p.pos.x, y: p.pos.y}
    ));
  }
});

socket.on('pos', (id, pos) => {
  const player = players.find(p => p.id === id);
  if (player) {
    player.setPosition(pos.x, pos.y);
  }
});

socket.on('leave', target => {
  log('call dropped from', target);
  // remove player from players list
  const index = players.findIndex(p => p.id === target);
  if (index > -1) {
    viewport.removeChild(players[index])
    // close the stream
    if (players[index].stream)
      players[index].stream.close();
    players.splice(index, 1)
  };
});