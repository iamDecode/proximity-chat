import {App} from './app.js';
import {attachSinkId} from './utils.js';

let app;

/*
 * Username modal
 */

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
    app = new App();
    modal.hide();
  };
  modal.show();
} else {
  app = new App();
}


/*
 * Viewport navigation and background image
 */

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

// Move tooltip during pan and zoom
const updateTooltip = (_) => {
  for (const player of app.players.values()) {
    if (player.tooltip != null) {
      player.tooltip.tooltip('update');
      break;
    }
  }
};
pz.on('pan', updateTooltip);
pz.on('zoom', updateTooltip);


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


/*
 * Bottom toolbar
 */

let micEnabled = true;
let camEnabled = true;

document.querySelector('button.mic').onclick = function() {
  micEnabled = !micEnabled;
  app.selfPlayer.setMic(micEnabled);
  this.classList.toggle('disabled');
  this.querySelector('i').innerHTML = micEnabled ? 'mic' : 'mic_off';
};

document.querySelector('button.cam').onclick = function() {
  camEnabled = !camEnabled;
  app.selfPlayer.setCam(camEnabled);
  this.classList.toggle('disabled');
  this.querySelector('i').innerHTML = camEnabled ? 'videocam' : 'videocam_off';
};

document.querySelector('button.settings').onclick = function() {
  this.classList.toggle('notooltip');
  document.querySelector('.preferences').classList.toggle('show');
};

document.querySelector('button.broadcast').onclick = function() {
  this.classList.toggle('enabled');
  app.selfPlayer.broadcast = !app.selfPlayer.broadcast;
};


/*
 * Device settings window
 */

const audioInputSelect = document.querySelector('select#audioSource');
const audioOutputSelect = document.querySelector('select#audioOutput');
const videoSelect = document.querySelector('select#videoSource');
let selectors = [audioInputSelect, audioOutputSelect, videoSelect];

if (!('sinkId' in HTMLMediaElement.prototype)) {
  selectors = [audioInputSelect, videoSelect];
}

navigator.mediaDevices.enumerateDevices().then(gotDevices);

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

function handleError(error) {
  throw error;
}

audioOutputSelect.onchange = (_) => {
  const audioDestination = audioOutputSelect.value;
  window.sinkId = audioDestination;
  for (const player of app.players.values()) {
    attachSinkId(player.$elem.querySelector('video'), audioDestination);
  }
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
  app.mediasoupClient.getStream(constraints, true).then((stream) => {
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    app.selfPlayer.analyser = null;

    if (e.target.id == 'videoSource') {
      app.selfPlayer.stream = stream;
      app.playStream(stream, app.selfPlayer);
    }

    app.mediasoupClient.producerTransport.handler._pc.getSenders().forEach((s) => {
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
