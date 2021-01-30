'use strict'

let socket;

function socketSend(command, arg) {
  const requestId = socket.requestId++

  return new Promise((res, rej) => {
    const check = function(message) {
      const components = message.data.split(',')
      if (components[0] === 'ACK' && components[1] == requestId) {
        socket.removeEventListener('message', check)
        res(message.data.substr(components[0].length + components[1].length + 2))
      }
    }
    socket.addEventListener('message', check);
    if (arg != null) {

      socket.send([command, requestId, arg]);
    } else {
      socket.send([command, requestId]);
    }
  })
}


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

const stats = new Stats();
document.body.appendChild(stats.dom);
let request

const performAnimation = () => {
  stats.end()
  request = requestAnimationFrame(performAnimation)
  if (selfPlayer != null) selfPlayer.render() 
  Object.values(players).forEach(p => p.render())
  stats.begin()
}

requestAnimationFrame(performAnimation)


const $bg = document.querySelector('#background')
const pz = panzoom($bg, {
  maxZoom: 5,
  minZoom: Math.max((window.innerWidth / 3200), (window.innerHeight / 1800)),
  initialX: 100,
  initialY: 100,
  zoomSpeed: 0.25,
  bounds: true,
  boundsPadding: 1,
})

pz.on('panstart', _ => {
  const scale = pz.getTransform().scale
  pz.setMinZoom(scale)
  pz.setMaxZoom(scale)
})
pz.on('panend', _ => {
  pz.setMinZoom(Math.max((window.innerWidth / 3200), (window.innerHeight / 1800)))
  pz.setMaxZoom(5)
})


class Player {
  constructor(id, name, pos) {
    this.color = colorFor(name)

    this.initElement();

    this.id = id
    this.name = name
    this.x = pos.x
    this.y = pos.y
    this.$elem.style.setProperty('--translate-x', `${this.x}px`)
    this.$elem.style.setProperty('--translate-y', `${this.y}px`)
    this.broadcast = false
    this._audioEnabled = true
    this._videoEnabled = false
  }

  initElement() {
    const $elem = document.createElement('div')
    $elem.classList.add('player')
    $elem.classList.add('audio-enabled')
    $elem.style.setProperty('--color', `#${this.color.toString(16)}`);
    $elem.style.setProperty('--color-light', `#${lighten(this.color, 60).toString(16)}`);

    const $avatar = document.createElement('div')
    $avatar.classList.add('avatar')
    $elem.appendChild($avatar)

    const $icon = document.createElement('div')
    $icon.classList.add('icon')
    $elem.appendChild($icon)

    $bg.appendChild($elem)

    this.$elem = $elem
  }

  addVideo(element) {
    this.$video = element
    this.$elem.appendChild(element)
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

    this.$elem.style.setProperty('--translate-x', `${x}px`)
    this.$elem.style.setProperty('--translate-y', `${y}px`)

    let volume = this.calcVolume()
    if (this.$video != null) {
      this.$video.volume = volume;

      const enabled = volume !== 0
      this.$video.muted = !enabled;
      this.setMic(enabled)
      this.setCam(enabled)

      if (this.videoEnabled) {
        this.$elem.classList.toggle('video-enabled', enabled)
      }
    }

    const scalar = (volume * (1 - 0.5)) + 0.5;
    this.$elem.style.setProperty('--scale', scalar)
  }

  setBroadcast(enabled) {
    this.broadcast = enabled;
    this.$elem.classList.toggle('broadcast-enabled', enabled)
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
    this.$elem.querySelector('.avatar').textContent = value[0].toUpperCase()
  }

  get audioEnabled() { return this._audioEnabled }
  set audioEnabled(enabled) {
    this._audioEnabled = enabled

    this.$elem.classList.toggle('audio-enabled', enabled)
  }

  get videoEnabled() { return this._videoEnabled }
  set videoEnabled(enabled) {
    this._videoEnabled = enabled
    this.$elem.classList.toggle('video-enabled', enabled)
  }

  drawAudioRing(data) {
    const bottomCutoff = 0.4;
    const scale = Math.max(0 ,((Math.max(...data) / 255) - bottomCutoff) / (1 - bottomCutoff));
    const width = (scale * 0.2) + 1;

    this.$elem.style.setProperty('--volume', width)
  }

  render() {
    if (this.stream) {
      if(this.analyser == null) {
        const track = this.stream.getAudioTracks()[0];

        if(track != null) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const context = new AudioContext();
          const source = context.createMediaStreamSource(new MediaStream([track]));
          this.analyser = context.createAnalyser();
          source.connect(this.analyser);
        }
      }

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);

      this.drawAudioRing(data);  
    }
  }
}

class SelfPlayer extends Player {
 constructor(id, name, pos) {
    super(id, name, pos);

    this.interactive = true
    this.buttonMode = true

    this.sendPos = (id, x, y) => { // TODO: reintroduce throttle
      socket.send([id, Math.round(x), Math.round(y)])
    }
  }

  initElement() {
    super.initElement();

    this.$elem.classList.add('self');

    const $elem = this.$elem;
    let active = false;
    let offsetX;
    let offsetY;

    const pickup = e => {
      if (e.target !== $elem && e.target.parentNode !== $elem) {
        return
      }

      if(e.type == 'mousedown' && event.which !== 1) {
        return
      }

      pz.pause()

      e.stopPropagation();
      active = true;

      const rect = $elem.getBoundingClientRect()

      if (e.type === 'touchstart') {
        offsetX = e.touches[0].clientX - rect.x;
        offsetY = e.touches[0].clientY - rect.y;
      } else {
        offsetX = e.clientX - rect.x;
        offsetY = e.clientY - rect.y;
      }
    }

    const move = e => {
      if (active) {
        e.preventDefault();
        
        let x, y;
        if (e.type === "touchmove") {
          x = e.touches[0].clientX - offsetX;
          y = e.touches[0].clientY - offsetY;
        } else {
          x = e.clientX - offsetX;
          y = e.clientY - offsetY;
        }

        setTranslate(x, y, $elem);
      }
    }

    const drop = e => {
      active = false;
      pz.resume()
    }

    const setTranslate = (xPos, yPos, el) => {
      // Account for global zoom level
      const transform = pz.getTransform()
      const x = (xPos - transform.x) / transform.scale
      const y = (yPos - transform.y) / transform.scale
      
      this.setPosition(x, y)
    }

    $bg.addEventListener('mousedown', pickup)
    $bg.addEventListener('touchstart', pickup)
    $bg.addEventListener('mousemove', move)
    $bg.addEventListener('touchmove', move)
    $bg.addEventListener('mouseup', drop)
    $bg.addEventListener('touchend', drop)
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
    this.$elem.style.setProperty('--translate-x', `${x}px`)
    this.$elem.style.setProperty('--translate-y', `${y}px`)

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
    socket.send([this.id, "update",  this.name, this.audioEnabled, this.videoEnabled, this.broadcast])
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
async function playStream(stream, target) {
  // create the video element for the stream
  const elem = document.createElement('video');
  elem.srcObject = stream;
  elem.autoplay = true;
  elem.playsInline = true;

  if (sinkId != null) {
    attachSinkId(elem, sinkId);
  }

  // add it to the player
  if (target instanceof SelfPlayer) {
    elem.muted = true;
    elem.setAttribute('data-peer', target.id);
    target.addVideo(elem);
  } else {
    elem.setAttribute('data-peer', target);
    const player = players[target];
    player.addVideo(elem);
  }

  await elem.play();
}

let pendingJoins = [];

// start a call with target
async function startCall(target) {
  console.log('starting call with ', target)
  const player = players[target];

  if (!player) {
    console.log('couldn\'t find player for stream', call.peer);
  } else if (player.stream == null) {
      const stream = new MediaStream();
      const audio = await consume(consumerTransport, 'audio', target);
      stream.addTrack(audio);

      const video = await consume(consumerTransport, 'video', target);
      if (video != null) {
        stream.addTrack(video);
      }

      player.stream = stream;
      await playStream(stream, target);
      player.setPosition(player.x, player.y) // To ensure volume relative to position is set correctly
      console.log('created stream for', target);
  }
}

let device;
let producerTransport;
let consumerTransport;
let stream;

async function loadDevice(routerRtpCapabilities) {
  try {
    device = new mediasoupClient.Device();
  } catch (error) {
    if (error.name === 'UnsupportedError') {
      console.error('browser not supported');
      alert("Your browser is not supported!")
    }
  }
  await device.load({ routerRtpCapabilities });
}


async function initProducerTransport() {
  const data = await socketSend('createProducerTransport', JSON.stringify({
    forceTcp: false,
    rtpCapabilities: device.rtpCapabilities,
  }))

  const transport = device.createSendTransport(JSON.parse(data));

  transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    try {
      await socketSend('connectProducerTransport', JSON.stringify(dtlsParameters))
      callback()
    } catch(e) {
      errback(e)
    }
  });

  transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
    try {
      const id = await socketSend('produce', JSON.stringify({
        transportId: transport.id,
        kind,
        rtpParameters,
      }))
      callback({ id })
    } catch(e) {
      errback(e)
    }
  });

  transport.on('connectionstatechange', (state) => {
    switch (state) {
      case 'connecting':
        console.log('producer: publishing...');
        break;

      case 'connected':
        console.log('producer: connected!');
      break;

      case 'failed':
        transport.close();
        console.log('producer: connection failed.')
      break;

      default: break;
    }
  });

  producerTransport = transport;
}

async function initConsumerTransport() {
  const data = await socketSend('createConsumerTransport', JSON.stringify({
    forceTcp: false,
  }))

  const transport = device.createRecvTransport(JSON.parse(data));

  transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    try {
      await socketSend('connectConsumerTransport', JSON.stringify({
        transportId: transport.id,
        dtlsParameters
      }))
      callback()
    } catch(e) {
      errback(e)
    }
  });

  transport.on('connectionstatechange', async (state) => {
    switch (state) {
      case 'connecting':
        console.log('consumer: subscribing...');
        break;

      case 'connected':
        console.log('consumer: subscribed!');
        break;

      case 'failed':
        transport.close();
        console.log('consumer: connection failed.');
        break;

      default: break;
    }
  });

  consumerTransport = transport;

  console.log(`pending joins: there were ${pendingJoins.length} pending`)
  pendingJoins.forEach(id => startCall(id))
  pendingJoins = []
}

async function consume(transport, producerKind, userId) {
  const { rtpCapabilities } = device;
  const data = await socketSend('consume', JSON.stringify({ userId, producerKind, rtpCapabilities }));

  if (data == "") {
    console.log("data was empty for", producerKind, 'for user', userId)
    return null;
  }

  const {
    producerId,
    id,
    kind,
    rtpParameters,
  } = JSON.parse(data);

  let codecOptions = {};
  const consumer = await transport.consume({
    id,
    producerId,
    kind,
    rtpParameters,
    codecOptions,
  });

  return consumer.track;
}

async function getStream(constraints, isWebcam) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    return stream;
  } catch (err) {
    if('video' in constraints && ['NotAllowedError', 'OverconstrainedError', 'NotFoundError'].includes(err.name)) {
      delete constraints.video;
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      return stream
    }
  }
}

function initSocket() {
  socket = new WebSocket(`wss://${location.hostname}:9001`);
  socket.requestId = 0

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
      selfPlayer.stream = stream;
      selfPlayer.audioEnabled = stream.getAudioTracks()[0] != null
      selfPlayer.videoEnabled = stream.getVideoTracks()[0] != null
      await playStream(stream, selfPlayer)

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

        if (consumerTransport == null) {
          pendingJoins.push(p.id)
        } else {
          startCall(p.id)
        }
      }
    }

    // talk to any user who joins
    else if ('join' in data) {
      if (data.join.id == selfPlayer.id) {
        return;
      }

      console.log('calling', data.join.id);
      const player = new Player(data.join.id, data.join.name, data.join.pos);

      player.audioEnabled = true
      player.videoEnabled = true

      players[data.join.id] = player

      if (consumerTransport == null) {
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

    // remove players who left or disconnected
    else if ('leave' in data) {
      console.log('call dropped from', data.leave.id);
      // remove player from players list
      
      if (data.leave.id in players) {
        const player = players[data.leave.id];
        player.$elem.remove()
        delete players[player.id]
      };
    }
  };

  socket.onopen = event => {
    initMediasoup()
  }
}

async function initMediasoup() {
    const rtpCapabilities = await socketSend('getRouterRtpCapabilities')

    await loadDevice(JSON.parse(rtpCapabilities))

    await initProducerTransport()

    try {
      stream = await getStream({audio: true, video: true}, true);
      navigator.mediaDevices.enumerateDevices().then(gotDevices)

      const video = stream.getVideoTracks()[0];
      
      if (video != null) {
        const params = { track: video };
        
        // Simulcast
        params.encodings = [
          { rid: 'r0', maxBitrate: 100000, scalabilityMode: 'S1T3' },
          { rid: 'r1', maxBitrate: 300000, scalabilityMode: 'S1T3' },
          { rid: 'r2', maxBitrate: 900000, scalabilityMode: 'S1T3' },
        ];
        params.codecOptions = {
          videoGoogleStartBitrate : 1000
        };
        
        await producerTransport.produce(params);
      }

      const audio = stream.getAudioTracks()[0];

      if (audio != null) {
        await producerTransport.produce({ track: audio });
      } else {
        alert("No audio devices detected!")
      }
    } catch (err) {
      console.error(err)
    }

    await initConsumerTransport()

    socket.send(['connect', localStorage.getItem('name')])
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

let sinkId = null
audioOutputSelect.onchange = _ => {
  const audioDestination = audioOutputSelect.value;
  sinkId = audioDestination;
  Object.values(players).forEach(player => {
    attachSinkId(player.$elem.querySelector('video'), audioDestination);
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
  getStream(constraints, true).then(stream => {
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (e.target.id == "videoSource") {
      selfPlayer.analyser = null;
      selfPlayer.stream = stream;
      playStream(stream, selfPlayer);
    }

    producerTransport.handler._pc.getSenders().forEach(s => {
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
