import {Player, SelfPlayer} from './player.js';
import {Socket} from './socket.js';
import {MediasoupClient} from './mediasoup-client.js';

let socket;
let mediasoupClient;

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
    socket.send(['pause', null, id]);
  },
  resume: function(id) {
    socket.send(['resume', null, id]);
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

// start a call with target
async function startCall(target) {
  console.log('starting call with ', target);
  const player = players[target];

  if (player == null) {
    console.log('couldn\'t find player for stream', target);
  } else if (player.stream == null) {
    player.stream = await mediasoupClient.createStream(target);
    await playStream(player.stream, target);
    // To ensure volume relative to position is set correctly.
    player.setPosition(player.x, player.y);
    console.log('created stream for', target);
  }
}

function initSocket() {
  socket = new Socket(`wss://${location.hostname}:9001`);

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
      const stream = mediasoupClient.stream;

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

        startCall(p.id);
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

      startCall(data.join.id);
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

  socket.onopen = async (event) => {
    mediasoupClient = new MediasoupClient(socket);

    await mediasoupClient.init();

    navigator.mediaDevices.enumerateDevices().then(gotDevices);

    socket.send(['connect', localStorage.getItem('name')]);
  };
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

let sinkId = null;
audioOutputSelect.onchange = (_) => {
  const audioDestination = audioOutputSelect.value;
  sinkId = audioDestination;
  Object.values(players).forEach((player) => {
    attachSinkId(player.$elem.querySelector('video'), audioDestination);
  });
};

audioInputSelect.onchange = videoSelect.onchange = async (e) => {
  let audioSource = audioInputSelect.value;
  if (audioSource.length == 0) audioSource = null;
  let videoSource = videoSelect.value;
  if (videoSource.length == 0) videoSource = null;

  const constraints = {
    audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
    video: {deviceId: videoSource ? {exact: videoSource} : undefined},
  };
  const stream = await mediasoupClient.getStream(constraints, true);
  const audioTrack = stream.getAudioTracks()[0];
  const videoTrack = stream.getVideoTracks()[0];

  selfPlayer.analyser = null;

  if (e.target.id == 'videoSource') {
    selfPlayer.stream = stream;
    playStream(stream, selfPlayer);
  }

  mediasoupClient.producerTransport.handler._pc.getSenders().forEach((s) => {
    if (s.track.kind == videoTrack.kind) {
      console.log('replacing video!');
      s.replaceTrack(videoTrack);
    } else if (s.track.kind == audioTrack.kind) {
      console.log('replacing audio!');
      s.replaceTrack(audioTrack);
    }
  });

  const devices = await navigator.mediaDevices.enumerateDevices();
  try {
    gotDevices(devices);
  } catch (e) {
    console.error('Could not fetch devices: ', e);
  }
};
