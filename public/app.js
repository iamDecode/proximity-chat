let socket;
if (localStorage.getItem('name') == null) {
  const $modal = document.querySelector('#usernameModal')
  const $button = $modal.querySelector('button')
  const $input = $modal.querySelector('input')

  const modal = new bootstrap.Modal($modal, {backdrop: 'static', keyboard: false, focus: false})

  $input.oninput = function(e) {
    $button.disabled = this.value == ""
  }
  $input.onkeyup = function(e) {
    if (e.keyCode == 13 && this.value != "") {
      e.preventDefault();
      e.stopPropagation();
      $button.onclick()
    }
  }

  $button.onclick = function(e) {
    localStorage.setItem('name', $input.value)
    initSocket()
    modal.hide()
  }
  modal.show()
} else {
  initSocket()
}

const app = new PIXI.Application({
  view: document.querySelector('canvas'),
  width: window.innerWidth,
  height: window.innerHeight,
  antialias: true,
  clearBeforeRender: false,
  powerPreference: "high-performance",
  resolution: window.devicePixelRatio,
  autoResize: true,
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
  document.querySelector('button.settings').classList.remove('notooltip')
  document.querySelector('.preferences').classList.remove('show')
})

// add a red box
const sprite = viewport.addChild(new PIXI.Sprite.from('public/assets/room.png'))




class Player extends PIXI.Container {
  constructor(id, name, pos) {
    super();

    this.color = colorFor(name)
    this.setupPixi()

    this.id = id
    this.name = name
    this.x = pos.x
    this.y = pos.y
    this.broadcast = false
    this._audioEnabled = true
    this._videoEnabled = true
  }

  setupPixi() {
    this.scale.set(0.5);
    this.size = 125
    const radius = this.size / 2

    this.audioRing = new PIXI.Graphics();
    this.addChild(this.audioRing);

    this.sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.sprite.width = this.sprite.height = this.size;
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);

    this.border = new PIXI.Graphics();
    this.border.beginFill(0xffffffff);
    this.border.drawCircle(0, 0, radius);
    this.border.endFill();
    this.border.beginHole();
    this.border.drawCircle(0, 0, radius*0.96);
    this.border.endHole();
    this.addChild(this.border);

    this.avatar = new PIXI.Graphics()
    this.avatar.beginFill(this.color);
    this.avatar.drawCircle(0, 0, radius*0.96);
    this.avatar.endFill()
    this.avatarText = new PIXI.Text("", {fontFamily : 'Nunito Sans', fontSize: 40, fontWeight: 'bold', fill : 0xffffff  })
    this.avatarText.anchor.set(0.5)
    this.avatarText.position.set(0)
    this.avatar.addChild(this.avatarText)
    this.addChild(this.avatar)

    const circle = new PIXI.Graphics();
    circle.beginFill(0xffffff);
    circle.drawCircle(0, 0, radius);
    circle.endFill();
    this.addChild(circle);
    this.sprite.mask = circle;

    const icon = new PIXI.Container();
    const iconText = new PIXI.Text('campaign', {fontFamily: 'Material Icons', fontSize: 24, fill: 0xffffff, align: 'center'})
    const iconBg = new PIXI.Graphics();
    iconBg.beginFill(0xffffff);
    iconBg.drawCircle(12, 11, 18);
    iconBg.endFill();
    icon.addChild(iconBg);
    icon.addChild(iconText);
    icon.x = 32;
    icon.y = 32;
    icon.scale.set(0.8);
    icon.alpha = 0
    this.addChild(icon);
    this.icon = icon;
    this.iconText = iconText;
    this.iconBg = iconBg;

    const messagePadding = {x: 15, y: 10}
    const message = new PIXI.Container();
    const messageText = new PIXI.Text('This is a message', {fontFamily: 'Nunito Sans', fontSize: 14, fill: 0xffffff, align: 'left'})
    const messageBg = new PIXI.Graphics();
    messageBg.beginFill(0xffffff);
    messageBg.drawRoundedRect(-messagePadding.x, -messagePadding.y, messageText.width + (2 * messagePadding.x), messageText.height + (2 * messagePadding.y), 10);
    messageBg.endFill();
    messageBg.tint = this.color;
    message.addChild(messageBg);
    message.addChild(messageText);
    message.x = radius + messagePadding.x;
    message.y = -((radius / 1.61803) + messagePadding.y);
    message.alpha = 0
    this.addChild(message);
    this.message = message;
    this.messageText = messageText;
    this.messageBg = messageBg;

    viewport.addChild(this)
  }

  showMessage(message, time) {
    const timePassed = Date.now() - time
    const ttl = 10000 - timePassed

    if (ttl <= 0) return 

    this.messageText.text = message

    const messagePadding = {x: 15, y: 10}
    this.messageBg.clear();
    this.messageBg.beginFill(0xffffff);
    this.messageBg.drawRoundedRect(-messagePadding.x, -messagePadding.y, this.messageText.width + (2 * messagePadding.x), this.messageText.height + (2 * messagePadding.y), 10);
    this.messageBg.endFill();

    this.message.alpha = 1

    setTimeout(_ => {
      this.message.alpha = 0
    }, ttl)
  }

  addVideo(element) {
    this._videoElement = element
    this.scale.set(1);

    if(this.stream.getVideoTracks().length > 0) {
      const texture = PIXI.Texture.from(element);
      this.sprite.texture = texture;

      if (this.videoEnabled) {
        setTimeout(_ => this.avatar.alpha = 0, 2000)
      }
    }
  }

  setMic(enabled) {
    this.stream.getAudioTracks().forEach(x => x.enabled = enabled)
  }

  setCam(enabled) {
    this.stream.getVideoTracks().forEach(x => x.enabled = enabled)
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;

    let volume = this.calcVolume()
    if (this._videoElement != null) {
      this._videoElement.volume = volume;

      const enabled = volume !== 0
      this._videoElement.muted = enabled;
      this.setMic(enabled)
      this.setCam(enabled)

      if (this.videoEnabled) {
        this.avatar.alpha = enabled ? 0 : 1
      }
    }

    const scalar = (volume * (1 - 0.5)) + 0.5;;
    this.scale.set(scalar, scalar)
  }

  setBroadcast(enabled) {
    this.broadcast = enabled;

    if (enabled) {
      this.iconText.text = "campaign"
      this.iconBg.tint = 0x00b385
      this.icon.alpha = 1
    } else if (this.iconText.text == "campaign") {
      this.icon.alpha = 0
    }

    this.setPosition(this.x, this.y)  // To update scale
  }

  calcVolume() {
    if (this.broadcast) {
      return 1;
    }
    
    // calulate angle and distance from listener to sound
    const dist = Math.hypot(this.y - selfPlayer.y, this.x - selfPlayer.x);
    const scale = 1 - (dist - SOUND_NEAR_RANGE) / (SOUND_CUTOFF_RANGE - SOUND_NEAR_RANGE);

    // target is too far away, no volume
    if (dist > SOUND_CUTOFF_RANGE)
      return 0;

    // target is very close, max volume
    if (dist < SOUND_NEAR_RANGE)
      return 1;

    return scale;
  }

  get name() { return this._name }
  set name(value) {
    this._name = value
    this.avatarText.text = value[0].toUpperCase()
  }

  get audioEnabled() { return this._audioEnabled }
  set audioEnabled(enabled) {
    this._audioEnabled = enabled

    if (!enabled) {
      this.iconText.text = "mic_off"
      this.iconBg.tint = 0xff586d
      this.icon.alpha = 1
    } else if (this.iconText.text == "mic_off") {
      this.icon.alpha = 0
    }
    
  }

  get videoEnabled() { return this._videoEnabled }
  set videoEnabled(enabled) {
    this._videoEnabled = enabled
    this.avatar.alpha = enabled ? 0 : 1
  }

  drawAudioRing(data) {
    const bottomCutoff = 0.4;
    const scale = Math.max(0 ,((Math.max(...data) / 255) - bottomCutoff) / (1 - bottomCutoff));
    const width = (scale * 0.2) + 1;
    this.audioRing.clear();
    this.audioRing.beginFill(lighten(this.color, 60), Math.min(1, scale + 0.4))
    this.audioRing.drawCircle(0, 0, (this.size / 2) * width);
    this.audioRing.endFill();
  }

  render(renderer) {
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


      let width, height;
      if (this.sprite.texture.width > this.sprite.texture.height) {
        width = this.size * (this.sprite.texture.width / this.sprite.texture.height)
        height = this.size
      } else {
        height = this.size * (this.sprite.texture.height / this.sprite.texture.width)
        width = this.size
      }
      this.sprite.width = width
      this.sprite.height = height
    }

    super.render(renderer)
  }
}

class SelfPlayer extends Player {
 constructor(id, name, pos) {
    super(id, name, pos);

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

    this.sendPos = (id, x, y) => {
      socket.send([id, Math.round(x), Math.round(y)])
    }

    this.initStream();
  }

  async initStream(stream) {
    if (stream == null) stream = await getStream({audio: true, video: true});
    stream.noiseSuppression = true;

    navigator.mediaDevices.enumerateDevices().then(gotDevices).catch(handleError);

    this.stream = stream;
    playStream(stream, this);

    if(peer == null) initPeer();
  }

  setMic(enabled) {
    super.setMic(enabled)
    this.audioEnabled = enabled
    this.sync()
  }

  setCam(enabled) {
    super.setCam(enabled)
    this.videoEnabled = enabled
    this.sync()
  }

  setBroadcast(enabled) {
    super.setBroadcast(enabled)
    this.sync()
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this.sendPos(this.id, this.x, this.y);

    Object.values(players).forEach(player => {
      player.setPosition(player.x, player.y);
    })
  }

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

  sync() {
    socket.send([this.id, "update", this.name, this.audioEnabled, this.videoEnabled, this.broadcast])
  }
}




// Settings
let micEnabled = true;
let camEnabled = true;
let SOUND_CUTOFF_RANGE = 350;
let SOUND_NEAR_RANGE = 200;

const colorFor = (name) => {
  // DJB2
  const colors = [0xa188a6,0x315867,0x2a9d8f,0x5a9fba,0xe9c46a,0xf4a261,0xe76f51]
  const chars = name.toLowerCase().split('').map(str => str.charCodeAt(0))
  const hash = chars.reduce((prev, curr) => ((prev << 5) + prev) + curr, 5381)
  return colors[Math.abs(hash) % colors.length];
}

function lighten(num, amt) {
    var r = (num >> 16) + amt;
    if (r > 255)
        r = 255;
    else if (r < 0)
        r = 0;
    var b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255)
        b = 255;
    else if (b < 0)
        b = 0;
    var g = (num & 0x0000FF) + amt;
    if (g > 255)
        g = 255;
    else if (g < 0)
        g = 0;
    return (g | (b << 8) | (r << 16));
}

let selfPlayer;
const players = {};

// play stream
function playStream(stream, target) {
  // create the video element for the stream
  const elem = document.createElement('video');
  elem.srcObject = stream;
  elem.muted = true;
  elem.autoplay = true;
  elem.playsInline = true;

  // add it to the player
  if (target instanceof SelfPlayer) {
    elem.setAttribute('data-peer', target.id);
    
    // iOS will stop playing the video when video is not used in webrtc or present in DOM.
    if (iOS()) {
      document.querySelectorAll('video').forEach(e => e.parentNode.removeChild(e))
      document.body.appendChild(elem)
    }
    
    target.addVideo(elem);
  } else {
    elem.setAttribute('data-peer', target);
    const player = players[target];
    player.addVideo(elem);
  }
}

function iOS() {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform)
  // iPad on iOS 13 detection
  || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}

let peer;
let pendingJoins = [];

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

  pendingJoins.forEach(id => startCall(id))
  pendingJoins = []
}

// start a call with target
async function startCall(target) {
  if (!peer) return;

  let options = { 
    sdpTransform: x => {
      // FIX: ensure rotation is correct on mobile devices
      return x.split("\n").filter(y => !y.includes("urn:3gpp:video-orientation")).join("\n")
    }
  };

  if (selfPlayer.stream.getVideoTracks().length === 0) {
    options.constraints = { offerToReceiveVideo: true };
  }

  const call = peer.call(target, selfPlayer.stream, options);
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


function initSocket() {
  socket = new WebSocket(`wss://${location.hostname}:9001`);
  socket.onmessage = async (message) => {
    let data;
    if (message.data[0] == "{") {
      data = JSON.parse(message.data)
    } else if (message.data == "pong") {
      return
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

      const name = localStorage.getItem('name')
      selfPlayer = new SelfPlayer(data.id, name, {x:100, y:100})

      setInterval(_ => {
        socket.send("ping")
      }, 10000)
    } 

    // Populate existing players
    else if ('players' in data) {
      for (const p of Object.values(data.players)) {
        const player = new Player(
          p.id,
          p.name,
          {x: parseInt(p.pos.x), y: parseInt(p.pos.y)}
        )

        player.audioEnabled = p.audioEnabled
        player.videoEnabled = p.videoEnabled
        player.setBroadcast(p.broadcast)

        players[p.id] = player 
      }
    }

    // talk to any user who joins
    else if ('join' in data) {
      console.log('calling', data.join.id);
      players[data.join.id] = new Player(data.join.id, data.join.name, data.join.pos);

      if (selfPlayer == null || selfPlayer.stream == null) {
        pendingJoins.push(data.join.id)
      } else {
        startCall(data.join.id)
      }
    }

    // update player position
    else if ('position' in data) {
      if (data.position[0] in players) {
        const player = players[data.position[0]];
        player.setPosition(parseInt(data.position[1]), parseInt(data.position[2]));
      }
    }

    // update player properties
    else if ('update' in data) {
      if (data.update.id in players) {
        const player = players[data.update.id];
        player.name = data.update.name;
        player.audioEnabled = data.update.audioEnabled
        player.videoEnabled = data.update.videoEnabled
        player.setBroadcast(data.update.broadcast);
      }
    }

    else if ('message' in data) {
      if (data.message.id in players) {
        const player = players[data.message.id];
        player.showMessage(data.message.message.text, data.message.message.time);
      } else {
        selfPlayer.showMessage(data.message.message.text, data.message.message.time);
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

  socket.onopen = event => {
    socket.send(['connect', localStorage.getItem('name')])
  }
}


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


document.querySelector('button.chat').onclick = function() {
  this.classList.toggle('notooltip')
  const message = prompt()

  if (message != null) {
    socket.send([selfPlayer.id, 'message', btoa(message)])
  }
};

document.querySelector('button.settings').onclick = function() {
  this.classList.toggle('notooltip')
  document.querySelector('.preferences').classList.toggle('show')
};

document.querySelector('button.broadcast').onclick = function() {
  this.classList.toggle('enabled')
  selfPlayer.setBroadcast(!selfPlayer.broadcast)
};

// Prevent browser zoom, zoom viewport instead
document.body.addEventListener("wheel", e => {
  if(e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
  }
})
document.onkeydown = function (e) {
  e = e || window.event
  const code = e.which || e.keyCode
    
  if (!(e.ctrlKey || e.metaKey)) return

  if (code == 187 || code == 189) {
    e.preventDefault();
    e.stopPropagation();
    const amount = (code == 189) ? -0.2 : 0.2
    viewport.zoomPercent(amount, true)
  }
};




// Device settings window
const audioInputSelect = document.querySelector('select#audioSource');
const audioOutputSelect = document.querySelector('select#audioOutput');
const videoSelect = document.querySelector('select#videoSource');
let selectors = [audioInputSelect, audioOutputSelect, videoSelect];

if (!('sinkId' in HTMLMediaElement.prototype)) {
  selectors = [audioInputSelect, videoSelect];
}

function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map(select => select.value);
  selectors.forEach(select => {
    while (select.children.length != 1) {
      select.removeChild(select.lastChild);
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

async function getStream(constraints) {
  return await navigator.mediaDevices.getUserMedia(constraints).catch(err => {
    if('video' in constraints && ['NotAllowedError', 'OverconstrainedError', 'NotFoundError'].includes(err.name)) {
      delete constraints.video;
      return navigator.mediaDevices.getUserMedia(constraints)
    }
  })
}

audioOutputSelect.onchange = _ => {
  const audioDestination = audioOutputSelect.value;
  Object.values(players).forEach(player => {
    attachSinkId(player._videoElement, audioDestination);
  })
}

audioInputSelect.onchange = videoSelect.onchange = e => {
  let audioSource = audioInputSelect.value;
  if (audioSource.length == 0) audioSource = null;
  let videoSource = videoSelect.value;
  if (videoSource.length == 0) videoSource = null;

  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
    video: {deviceId: videoSource ? {exact: videoSource} : undefined}
  };
  getStream(constraints).then(stream => {
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (e.target.id == "videoSource") {
      selfPlayer.analyser = null;
      selfPlayer.stream = stream;
      playStream(stream, selfPlayer);
    }

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
