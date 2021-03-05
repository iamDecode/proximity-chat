import {Player, SelfPlayer} from './player.js';

let socket;

function socketSend(command, arg) {
  const requestId = socket.requestId++;

  return new Promise((res, rej) => {
    const check = function(message) {
      const components = message.data.split(',');
      if (components[0] === 'ACK' && components[1] == requestId) {
        socket.removeEventListener('message', check);
        res(message.data.substr(components[0].length + components[1].length + 2));
      }
    };
    socket.addEventListener('message', check);
    if (arg != null) {
      socket.send([command, requestId, arg]);
    } else {
      socket.send([command, requestId]);
    }
  });
}


if (localStorage.getItem('name') == null) {
  const $modal = document.querySelector('#usernameModal');
  const $button = $modal.querySelector('button');
  const $input = $modal.querySelector('input');

  const modal = new bootstrap.Modal($modal, {backdrop: 'static', keyboard: false, focus: false});

  $input.oninput = function(e) {
    $button.disabled = this.value == '';
  };
  $input.onkeyup = function(e) {
    if (e.keyCode == 13 && this.value != '') {
      e.preventDefault();
      e.stopPropagation();
      $button.onclick();
    }
  };

  $button.onclick = function(e) {
    localStorage.setItem('name', $input.value);
    initSocket();
    modal.hide();
  };
  modal.show();
} else {
  initSocket();
}

const performAnimation = () => {
  if (selfPlayer != null) selfPlayer.render();
  Object.values(players).forEach((p) => p.render());
};

setInterval(performAnimation, 1000/10);


const $viewport = document.querySelector('#viewport');
const $bg = document.querySelector('#background');
const pz = panzoom($bg, {
  zoomSpeed: 0.25,
  bounds: true,
  boundsPadding: 1,
});
window.pz = pz;

function setDefaultZoomParams() {
  pz.setMinZoom(Math.max(
      (window.innerWidth / document.ROOM_CONFIG.width),
      (window.innerHeight / document.ROOM_CONFIG.height)));
  pz.setMaxZoom(5);

  if (pz.getTransform().scale < pz.getMinZoom()) {
    // Zoom in towards the middle of what's currently visible. That doesn't
    // guarantee that the room now fills the whole viewport, call moveBy to make
    // panzoom fix that.
    pz.zoomAbs(0.5, 0.5, pz.getMinZoom());
    pz.moveBy(0, 0);
  }
}

setDefaultZoomParams();
window.addEventListener('resize', setDefaultZoomParams);

// Center the room's starting position. Panzoom will clip this so we don't pan
// out of the room.
pz.moveTo(
    // These are the coordinates of the background within the viewport, so the
    // coordinate (-100, -100) means the leftmost and topmost 100 pixels of the
    // background image are outside of the viewport.
    0.5*$viewport.offsetWidth - document.ROOM_CONFIG.starting_position.x,
    0.5*$viewport.offsetHeight - document.ROOM_CONFIG.starting_position.y);

// Disable zoom during pan.
pz.on('panstart', (_) => {
  const scale = pz.getTransform().scale;
  pz.setMinZoom(scale);
  pz.setMaxZoom(scale);

  document.querySelector('button.settings').classList.remove('notooltip');
  document.querySelector('.preferences').classList.remove('show');
});
pz.on('panend', setDefaultZoomParams);

const updateTooltip = (_) => {
  Object.values(players).forEach((p) => {
    if (p.tooltip != null) {
      p.tooltip.tooltip('update');
      return;
    }
  });
};
pz.on('pan', updateTooltip);
pz.on('zoom', updateTooltip);


// Settings
let micEnabled = true;
let camEnabled = true;
const SOUND_CUTOFF_RANGE = 350;
const SOUND_NEAR_RANGE = 200;

let selfPlayer;
const players = {};

const playerDelegate = {
  calcVolume: function(player) {
    if (player.broadcast) {
      return 1;
    }

    // calulate angle and distance from listener to sound
    const dist = Math.hypot(player.y - selfPlayer.y, player.x - selfPlayer.x);
    const scale = 1 - (dist - SOUND_NEAR_RANGE) / (SOUND_CUTOFF_RANGE - SOUND_NEAR_RANGE);

    // target is too far away, no volume
    if (dist > SOUND_CUTOFF_RANGE) {
      return 0;
    }

    // target is very close, max volume
    if (dist < SOUND_NEAR_RANGE) {
      return 1;
    }

    return scale;
  },
  pause: function(id) {
    socketSend('pause', id);
  },
  resume: function(id) {
    socketSend('resume', id);
  },
  position: function(x, y) {
    socket.send(['pos', x, y]);
  },
  update: function(name, audio, video, broadcast) {
    socket.send(['update', name, audio, video, broadcast]);
  },
  updatePlayers: function() {
    Object.values(players).forEach((player) => {
      player.setPosition(player.x, player.y);
    });
  },
};

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

  try {
    await elem.play();
  } catch (e) {
  }
}

let pendingJoins = [];

// start a call with target
async function startCall(target) {
  console.log('starting call with ', target);
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
    // To ensure volume relative to position is set correctly.
    player.setPosition(player.x, player.y);
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
      alert('Your browser is not supported!');
    }
  }
  await device.load({routerRtpCapabilities});
}


async function initProducerTransport() {
  const data = await socketSend('createProducerTransport', JSON.stringify({
    forceTcp: false,
    rtpCapabilities: device.rtpCapabilities,
  }));

  const transport = device.createSendTransport(JSON.parse(data));

  transport.on('connect', async ({dtlsParameters}, callback, errback) => {
    try {
      await socketSend('connectProducerTransport', JSON.stringify(dtlsParameters));
      callback();
    } catch (e) {
      errback(e);
    }
  });

  transport.on('produce', async ({kind, rtpParameters}, callback, errback) => {
    try {
      const id = await socketSend('produce', JSON.stringify({
        transportId: transport.id,
        kind,
        rtpParameters,
      }));

      if (id != '') {
        callback({id});
      } else {
        errback();
      }
    } catch (e) {
      errback(e);
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
        console.log('producer: connection failed.');
        break;

      default: break;
    }
  });

  producerTransport = transport;
}

async function initConsumerTransport() {
  const data = await socketSend('createConsumerTransport', JSON.stringify({
    forceTcp: false,
  }));

  const transport = device.createRecvTransport(JSON.parse(data));

  transport.on('connect', async ({dtlsParameters}, callback, errback) => {
    try {
      await socketSend('connectConsumerTransport', JSON.stringify({
        transportId: transport.id,
        dtlsParameters,
      }));
      callback();
    } catch (e) {
      errback(e);
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

  console.log(`pending joins: there were ${pendingJoins.length} pending`);
  pendingJoins.forEach((id) => startCall(id));
  pendingJoins = [];
}

async function consume(transport, producerKind, userId) {
  const {rtpCapabilities} = device;
  const data = await socketSend('consume', JSON.stringify({userId, producerKind, rtpCapabilities}));

  if (data == '') {
    console.log('data was empty for', producerKind, 'for user', userId);
    return null;
  }

  const {
    producerId,
    id,
    kind,
    rtpParameters,
  } = JSON.parse(data);

  const codecOptions = {};
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
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (err) {
    if ('video' in constraints &&
    ['NotAllowedError', 'OverconstrainedError', 'NotFoundError'].includes(err.name)) {
      delete constraints.video;
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    }
  }
}

function initSocket() {
  socket = new WebSocket(`wss://${location.hostname}:9001`);
  socket.requestId = 0;

  socket.onmessage = async (message) => {
    /* eslint-disable brace-style
       --
       The if/else if below read nicer with a blank line between them. */

    let data;
    if (message.data[0] == '{') {
      data = JSON.parse(message.data);
    } else if (message.data == 'pong') {
      return;
    } else {
      data = {position: message.data.split(',')};
    }

    // setup peer when user receives id
    if ('id' in data) {
      if (selfPlayer != null) {
        console.log('destroying old identity', selfPlayer.id, 'and replacing with', data.id);
        peer.destroy();
        peer = undefined;
        return;
      }

      const name = localStorage.getItem('name');
      selfPlayer = new SelfPlayer(data.id, name, data.pos, playerDelegate);
      selfPlayer.stream = stream;
      selfPlayer.audioEnabled = stream.getAudioTracks()[0] != null;
      selfPlayer.videoEnabled = stream.getVideoTracks()[0] != null;
      await playStream(stream, selfPlayer);

      setInterval((_) => {
        socket.send('ping');
      }, 10000);
    }

    // Populate existing players
    else if ('players' in data) {
      for (const p of Object.values(data.players)) {
        const player = new Player(
            p.id,
            p.name,
            {x: parseInt(p.pos.x), y: parseInt(p.pos.y)},
            playerDelegate,
        );

        player.audioEnabled = p.audioEnabled;
        player.videoEnabled = p.videoEnabled;
        player.setBroadcast(p.broadcast);

        players[p.id] = player;

        if (consumerTransport == null) {
          pendingJoins.push(p.id);
        } else {
          startCall(p.id);
        }
      }
    }

    // talk to any user who joins
    else if ('join' in data) {
      if (data.join.id == selfPlayer.id) {
        return;
      }

      console.log('calling', data.join.id);
      const player = new Player(data.join.id, data.join.name, data.join.pos, playerDelegate);

      player.audioEnabled = true;
      player.videoEnabled = true;

      players[data.join.id] = player;

      if (consumerTransport == null) {
        pendingJoins.push(data.join.id);
      } else {
        startCall(data.join.id);
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
        player.audioEnabled = data.update.audioEnabled;
        player.videoEnabled = data.update.videoEnabled;
        player.setBroadcast(data.update.broadcast);
      }
    }

    // remove players who left or disconnected
    else if ('leave' in data) {
      console.log('call dropped from', data.leave.id);
      // remove player from players list

      if (data.leave.id in players) {
        const player = players[data.leave.id];
        player.tooltip.tooltip('dispose');
        player.$elem.remove();
        delete players[player.id];
      };
    }
  };

  socket.onopen = (event) => {
    initMediasoup();
  };
}

async function initMediasoup() {
  const rtpCapabilities = await socketSend('getRouterRtpCapabilities');

  await loadDevice(JSON.parse(rtpCapabilities));

  await initProducerTransport();

  try {
    stream = await getStream({audio: true, video: true}, true);
    navigator.mediaDevices.enumerateDevices().then(gotDevices);

    const video = stream.getVideoTracks()[0];

    if (video != null) {
      const params = {track: video};

      // Simulcast
      params.encodings = [
        {rid: 'r0', maxBitrate: 100000, scalabilityMode: 'S1T3'},
        {rid: 'r1', maxBitrate: 300000, scalabilityMode: 'S1T3'},
        {rid: 'r2', maxBitrate: 900000, scalabilityMode: 'S1T3'},
      ];
      params.codecOptions = {
        videoGoogleStartBitrate: 1000,
      };

      await producerTransport.produce(params);
    }

    const audio = stream.getAudioTracks()[0];

    if (audio != null) {
      await producerTransport.produce({track: audio});
    } else {
      alert('No audio devices detected!');
    }
  } catch (err) {
    console.error(err);
  }

  await initConsumerTransport();

  socket.send(['connect', localStorage.getItem('name')]);
}

document.querySelector('button.mic').onclick = function() {
  micEnabled = !micEnabled;
  selfPlayer.setMic(micEnabled);
  this.classList.toggle('disabled');
  this.querySelector('i').innerHTML = micEnabled ? 'mic' : 'mic_off';
};

document.querySelector('button.cam').onclick = function() {
  camEnabled = !camEnabled;
  selfPlayer.setCam(camEnabled);
  this.classList.toggle('disabled');
  this.querySelector('i').innerHTML = camEnabled ? 'videocam' : 'videocam_off';
};

document.querySelector('button.settings').onclick = function() {
  this.classList.toggle('notooltip');
  document.querySelector('.preferences').classList.toggle('show');
};

document.querySelector('button.broadcast').onclick = function() {
  this.classList.toggle('enabled');
  selfPlayer.setBroadcast(!selfPlayer.broadcast);
};

// Prevent browser zoom, zoom viewport instead
document.body.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
  }
});
document.onkeydown = function(e) {
  e = e || window.event;
  const code = e.which || e.keyCode;

  if ((e.ctrlKey || e.metaKey) && (code == 187 || code == 189)) {
    e.preventDefault();
    e.stopPropagation();
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
  const values = selectors.map((select) => select.value);
  selectors.forEach((select) => {
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
    if (Array.prototype.slice.call(select.childNodes)
        .some((n) => n.value === values[selectorIndex])) {
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
        .catch((error) => {
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

let sinkId = null;
audioOutputSelect.onchange = (_) => {
  const audioDestination = audioOutputSelect.value;
  sinkId = audioDestination;
  Object.values(players).forEach((player) => {
    attachSinkId(player.$elem.querySelector('video'), audioDestination);
  });
};

audioInputSelect.onchange = videoSelect.onchange = (e) => {
  let audioSource = audioInputSelect.value;
  if (audioSource.length == 0) audioSource = null;
  let videoSource = videoSelect.value;
  if (videoSource.length == 0) videoSource = null;

  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
    video: {deviceId: videoSource ? {exact: videoSource} : undefined},
  };
  getStream(constraints, true).then((stream) => {
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    selfPlayer.analyser = null;

    if (e.target.id == 'videoSource') {
      selfPlayer.stream = stream;
      playStream(stream, selfPlayer);
    }

    producerTransport.handler._pc.getSenders().forEach((s) => {
      if (s.track.kind == videoTrack.kind) {
        console.log('replacing video!');
        s.replaceTrack(videoTrack);
      } else if (s.track.kind == audioTrack.kind) {
        console.log('replacing audio!');
        s.replaceTrack(audioTrack);
      }
    });
    return navigator.mediaDevices.enumerateDevices();
  }).then(gotDevices).catch(handleError);
};
