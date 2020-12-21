const app = new PIXI.Application({
  view: document.querySelector('canvas'),
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
  resolution: window.devicePixelRatio,
  autoResize: true
})

const stats = new Stats();
document.body.appendChild(stats.dom);
app.ticker.add(_ => {
  stats.end()
  stats.begin()
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
    .clampZoom({maxWidth: 3200, maxHeight: 1800, minHeight: 250})
    .setZoom(0.8)
    .decelerate({friction: 0.93})

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
    this.border = new PIXI.Graphics();
    this.addChild(this.border);

    const circle = new PIXI.Graphics();
    this.addChild(circle);
    this.mask = circle;

    this.anchor.set(0.5);
    this.x = goal.x;
    this.y = goal.y;
    this.size = 100
    this.setSize(this.size * 0.5, this.size * 0.5);

    viewport.addChild(this)
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;

    const size = Math.min(width, height);
    const radius = size / (2 * this.scale.x);

    this.mask.clear();
    this.mask.beginFill(0xffffff);
    this.mask.drawCircle(0, 0, radius);
    this.mask.endFill();

    this.border.clear();
    this.border.lineStyle(radius * 0.05, 0xffffff, 1, 0)
    this.border.arc(0, 0, radius, 0, 2*Math.PI)

    this._originalScale = [this.scale.x, this.scale.y];
  }

  addVideo(element) {
    element.addEventListener('resize', e => {
      app.ticker.stop()
      this.texture = null

      setTimeout(_ => {
        const texture = PIXI.Texture.from(element);
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

        if (!(this instanceof SelfPlayer)) {
          this.setPosition(this.x, this.y); // To recompute size
        }
        app.ticker.start()
      }, 100) // FIXME: This is a terrible hack.
    })
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;

    let [left, right] = calcVolumes({x: selfPlayer.x, y: selfPlayer.y}, {x: this.x, y: this.y})
    left = (left * (1 - 0.5)) + 0.5;    
    right = (right * (1 - 0.5)) + 0.5;
    if (this.stream != null) this.stream.setVolume(left, right);

    const scalar = Math.max(left, right);
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

    this.sendPos = throttle((id, x, y) => {
      socket.send([id, Math.round(x), Math.round(y)])
    }, 25);

    const initStream = async _ => {
      const stream = await getStream();
      playStream(stream, selfPlayer);
    }
    initStream()
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this.sendPos(this.id, this.x, this.y);

    Object.values(players).forEach(player => {
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
const SOUND_CUTOFF_RANGE = 500;
const SOUND_NEAR_RANGE = 300;

const socket = new WebSocket(`wss://${location.hostname}:9001`);

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

let selfPlayer;
const players = {};


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
  elem.autoplay = true;
  elem.playsInline = true;
  elem.setAttribute('data-peer', target);

  // add it to the player
  if (target instanceof Player && target.stream == null) {
    target.addVideo(elem);
  } else {
    const player = players[target];
    player.addVideo(elem);
  }
}

let peer;

// create peer, setup handlers
function initPeer() {
  peer = new Peer(selfPlayer.id, {host: location.hostname, port: location.port, path: '/peerjs'});

  peer.on('open', id => { console.log('My peer ID is:', id); });
  peer.on('disconnected', id => { console.log('lost connection'); });
  peer.on('error', err => { console.error(err); });

  // run when someone calls us. answer the call
  peer.on('call', async call => {
    console.log('call from', call.peer);
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
    const player = players[call.peer];
    if (!player) {
      console.log('couldn\'t find player for stream', call.peer);
    } else if (player.stream == null) {
      player.stream = new StreamSplit(stream, {left: 1, right: 1});
      playStream(stream, call.peer);
      console.log('created stream for', call.peer);
    }
  });
}


socket.onmessage = async (message) => {
  let data;
  if (message.data[0] == "{") {
    data = JSON.parse(message.data)
  } else {
    data = {position: message.data.split(',')}
  }

  // setup peer when user receives id
  if ('id' in data) {
    if (selfPlayer != null) {
      console.log('destroying old identity', selfPlayer.id, 'and replacing with', data.id);
      peer.destroy();
      peer = undefined;
      return;
    }

    selfPlayer = new SelfPlayer(data.id, 0, {x:100, y:100}, {x:100, y:100})
    initPeer();
  } 

  // Populate existing players
  else if ('players' in data) {
    for (const p of Object.values(data.players)) {
      players[p.id] = new Player(
        p.id,
        0,
        p.pos,
        {x: p.pos.x, y: p.pos.y}
      );
    }
  }

  // talk to any user who joins
  else if ('join' in data) {
    console.log('calling', data.join.id);
    players[data.join.id] = new Player(data.join.id, 0, data.join.pos, data.join.pos);
    startCall(data.join.id);
  }

  // update player position
  else if ('position' in data) {
    if (data.position[0] in players) {
      const player = players[data.position[0]];
      player.setPosition(data.position[1], data.position[2]);
    }
  }

  // remove players who left or disconnected
  else if ('leave' in data) {
    console.log('call dropped from', data.leave.id);
    // remove player from players list
    
    if (data.leave.id in players) {
      const player = players[data.leave.id];
      viewport.removeChild(player)
      
      // close the stream
      if (player.stream) {
        player.stream.close();
      }

      delete players[player.id]
    };
  }
};
