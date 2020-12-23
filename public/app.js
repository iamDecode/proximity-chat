const app = new PIXI.Application({
  view: document.querySelector('canvas'),
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
  resizeTo: window
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
    .decelerate({friction: 0.93})

viewport.on('drag-start', _ => {
  document.querySelector('.preferences').classList.remove('show')
})

// add a red box
const sprite = viewport.addChild(new PIXI.Sprite.from('public/assets/room.png'))




class Player extends PIXI.Container {
  constructor(id, avatar, pos, goal) {
    super();

    this.id = id
    this.avatar = avatar
    this.pos = pos
    this.goal = goal

    // PIXI setup
    this.x = goal.x;
    this.y = goal.y;
    this.scale.set(0.5);
    this.size = 125
    const radius = this.size / 2

    this.audioRing = new PIXI.Graphics();
    this.addChild(this.audioRing);

    this.sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.sprite.tint = 0x000000;
    this.sprite.width = this.sprite.height = this.size;
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);

    this.border = new PIXI.Graphics();
    this.border.lineStyle(radius * 0.04, 0xffffff, 1, 0)
    this.border.arc(0, 0, radius, 0, 2*Math.PI)
    this.addChild(this.border);

    const circle = new PIXI.Graphics();
    circle.beginFill(0xffffff);
    circle.drawCircle(0, 0, radius);
    circle.endFill();
    this.addChild(circle);
    this.sprite.mask = circle;
  

    viewport.addChild(this)
  }

  addVideo(element) {
    this._videoElement = element

    element.addEventListener('resize', e => {
      app.ticker.stop()
      this.sprite.texture = null
      this.scale.set(1);
      this.sprite.tint = 0xffffff; // Removes the tint

      setTimeout(_ => {
        const texture = PIXI.Texture.from(element);
        this.sprite.texture = texture;

        console.log("size changed to", texture.width, texture.height)

        let width, height;
        if (texture.width > texture.height) {
          width = this.size * (texture.width / texture.height)
          height = this.size
        } else {
          height = this.size * (texture.height / texture.width)
          width = this.size
        }
        this.sprite.width = width
        this.sprite.height = height

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

    let volume = calcVolume({x: selfPlayer.x, y: selfPlayer.y}, {x: this.x, y: this.y})
    if (this._videoElement != null) {
      this._videoElement.volume = volume;
      this._videoElement.muted = (volume == 0);
      this.setMic(volume !== 0)
      this.setCam(volume !== 0)
    }

    const scalar = (volume * (1 - 0.5)) + 0.5;;
    this.scale.set(scalar, scalar)
  }

  setMic(enabled) {
    this.stream.getAudioTracks()[0].enabled = enabled;
  }

  setCam(enabled) {
    this.stream.getVideoTracks()[0].enabled = enabled;
  }

  // updatePosition() {
  //   const speed = 25
  //   const delta = app.ticker.elapsedMS / 1000;
  //   this.position.x += (this.goal.x - this.position.x) * speed * delta;
  //   this.position.y += (this.goal.y - this.position.y) * speed * delta;
  // }

  drawAudioRing(data) {
    const bottomCutoff = 0.4;
    const scale = Math.max(0 ,((Math.max(...data) / 255) - bottomCutoff) / (1 - bottomCutoff));
    const width = (scale * 0.2) + 1;
    this.audioRing.clear();
    this.audioRing.beginFill(0xa3f5aa, Math.min(1, scale + 0.4))
    this.audioRing.drawCircle(0, 0, (this.size / 2) * width);
    this.audioRing.endFill();
  }

  render(renderer) {
    //this.updatePosition()

    if (this.stream) {
      if(this.analyser == null) {
        const track = this.stream.getAudioTracks()[0];
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContext();
        const source = context.createMediaStreamSource(new MediaStream([track]));
        this.analyser = context.createAnalyser();
        source.connect(this.analyser);
      }

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);

      this.drawAudioRing(data);  
    }

    super.render(renderer)
  }
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

    this.initStream();
  }

  async initStream(stream) {
    if (stream == null) stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});

    navigator.mediaDevices.enumerateDevices().then(gotDevices).catch(handleError);

    this.stream = stream;
    playStream(stream, this);

    if(peer == null) initPeer();
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




// Settings
let micEnabled = true;
let camEnabled = true;
let SOUND_CUTOFF_RANGE = 500;
let SOUND_NEAR_RANGE = 300;

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


function calcVolume(listenerPos, soundPos) {
  // calulate angle and distance from listener to sound
  const theta = Math.atan2(soundPos.y - listenerPos.y, soundPos.x - listenerPos.x);
  const dist = Math.hypot(soundPos.y - listenerPos.y, soundPos.x - listenerPos.x);
  const scale = 1 - (dist - SOUND_NEAR_RANGE) / (SOUND_CUTOFF_RANGE - SOUND_NEAR_RANGE);

  // target is too far away, no volume
  if (dist > SOUND_CUTOFF_RANGE)
    return 0;

  // target is very close, max volume
  if (dist < SOUND_NEAR_RANGE)
    return 1;

  return scale;
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
  if (target instanceof SelfPlayer) {
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
    call.answer(selfPlayer.stream);
    receiveCall(call);
  });
}

// start a call with target
async function startCall(target) {
  if (!peer) return;
  const call = peer.call(target, selfPlayer.stream, {sdpTransform: x => {
    // FIX: ensure rotation is correct on mobile devices
    return x.split("\n").filter(y => !y.includes("urn:3gpp:video-orientation")).join("\n")
  }});
  receiveCall(call);
}

// play the stream from the call in a video element
function receiveCall(call) {
  call.on('stream', stream => {
    stream.noiseSuppression = true;
    const player = players[call.peer];
    if (!player) {
      console.log('couldn\'t find player for stream', call.peer);
    } else if (player.stream == null) {
      player.stream = stream;
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
  } 

  // Populate existing players
  else if ('players' in data) {
    for (const p of Object.values(data.players)) {
      const pos = {x: parseInt(p.pos.x), y: parseInt(p.pos.y)}
      players[p.id] = new Player(
        p.id,
        0,
        pos,
        pos
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
      player.setPosition(parseInt(data.position[1]), parseInt(data.position[2]));
    }
  }

  // remove players who left or disconnected
  else if ('leave' in data) {
    console.log('call dropped from', data.leave.id);
    // remove player from players list
    
    if (data.leave.id in players) {
      const player = players[data.leave.id];
      viewport.removeChild(player)
      delete players[player.id]
    };
  }
};


document.querySelector('button.mic').onclick = function() {
  micEnabled = !micEnabled;
  selfPlayer.setMic(micEnabled)
  this.classList.toggle('disabled')
  this.querySelector('i').innerHTML = micEnabled ? "mic" : "mic_off"
};

document.querySelector('button.cam').onclick = function() {
  camEnabled = !camEnabled;
  selfPlayer.setCam(camEnabled)
  this.classList.toggle('disabled')
  this.querySelector('i').innerHTML = camEnabled ? "videocam" : "videocam_off"
};

document.querySelector('button.settings').onclick = function() {
  document.querySelector('.preferences').classList.toggle('show')
};



// Device settings window
const audioInputSelect = document.querySelector('select#audioSource');
const audioOutputSelect = document.querySelector('select#audioOutput');
const videoSelect = document.querySelector('select#videoSource');
let selectors = [audioInputSelect, audioOutputSelect, videoSelect];

audioOutputSelect.disabled = !('sinkId' in HTMLMediaElement.prototype);
if (audioOutputSelect.disabled) {
  audioOutputSelect.querySelector('option').text = "No browser support"
  selectors = [audioInputSelect, videoSelect];
}

function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map(select => select.value);
  selectors.forEach(select => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    const option = document.createElement('option');
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === 'audioinput') {
      option.text = deviceInfo.label || `Microphone ${audioInputSelect.length + 1}`;
      audioInputSelect.appendChild(option);
    } else if (deviceInfo.kind === 'audiooutput') {
      option.text = deviceInfo.label || `Speaker ${audioOutputSelect.length + 1}`;
      audioOutputSelect.appendChild(option);
    } else if (deviceInfo.kind === 'videoinput') {
      option.text = deviceInfo.label || `Camera ${videoSelect.length + 1}`;
      videoSelect.appendChild(option);
    } else {
      console.log('Some other kind of source/device: ', deviceInfo);
    }
  }
  selectors.forEach((select, selectorIndex) => {
    if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
      select.value = values[selectorIndex];
    }
  });
}

// Attach audio output device to video element using device/sink ID.
function attachSinkId(element, sinkId) {
  if (typeof element.sinkId !== 'undefined') {
    element.setSinkId(sinkId)
        .then(() => {
          console.log(`Success, audio output device attached: ${sinkId}`);
        })
        .catch(error => {
          let errorMessage = error;
          if (error.name === 'SecurityError') {
            errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`;
          }
          console.error(errorMessage);
          // Jump back to first output device in the list as it's the default.
          audioOutputSelect.selectedIndex = 0;
        });
  } else {
    console.warn('Browser does not support output device selection.');
  }
}

function handleError(error) {
  throw error;
}

audioOutputSelect.onchange = _ => {
  const audioDestination = audioOutputSelect.value;
  Object.values(players).forEach(player => {
    console.log(player._videoElement)
    attachSinkId(player._videoElement, audioDestination);
  })
}

audioInputSelect.onchange = videoSelect.onchange = _ => {
  const audioSource = audioInputSelect.value;
  const videoSource = videoSelect.value;

  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
    video: {deviceId: videoSource ? {exact: videoSource} : undefined}
  };
  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    let audioTrack = stream.getAudioTracks()[0];
    let videoTrack = stream.getVideoTracks()[0];
    Object.values(peer.connections).map(x => x[0].peerConnection.getSenders()).flat().forEach(s => {
      if (s.track.kind == videoTrack.kind) {
        console.log('replacing video!')
        s.replaceTrack(videoTrack);
      } else if (s.track.kind == audioTrack.kind) {
        console.log('replacing audio!')
        s.replaceTrack(audioTrack);
      }
    });
    return navigator.mediaDevices.enumerateDevices()
  }).then(gotDevices).catch(handleError);
}