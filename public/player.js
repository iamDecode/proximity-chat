import {colorFor, lighten} from './utils.js';


export class Player {
  constructor(id, name, pos, delegate) {
    this.color = colorFor(name);

    this.initElement(name);

    this.id = id;
    this.name = name;
    this.x = pos.x;
    this.y = pos.y;
    this.$elem.style.setProperty('--translate-x', `${this.x}px`);
    this.$elem.style.setProperty('--translate-y', `${this.y}px`);
    this.broadcast = false;
    this._audioEnabled = true;
    this._videoEnabled = false;
    this.objects = {};
    this.delegate = delegate;

    if (!(this instanceof SelfPlayer)) {
      this.inRange = this.delegate.calcVolume(this) !== 0;
    }
  }

  initElement(name) {
    const $elem = document.createElement('div');
    $elem.classList.add('player');
    $elem.classList.add('audio-enabled');

    if (!(this instanceof SelfPlayer)) {
      $elem.title = name;
      this.tooltip = $($elem).tooltip({placement: 'bottom'});
    }

    $elem.style.setProperty('--color', `#${this.color.toString(16)}`);
    $elem.style.setProperty('--color-light', `#${lighten(this.color, 60).toString(16)}`);

    const $audioRing = document.createElement('div');
    $audioRing.classList.add('audioRing');
    $elem.appendChild($audioRing);

    const $avatar = document.createElement('div');
    $avatar.classList.add('avatar');
    $elem.appendChild($avatar);

    const $icon = document.createElement('div');
    $icon.classList.add('icon');
    $elem.appendChild($icon);

    const $glass = document.createElement('div');
    $glass.classList.add('glass');
    const $drink = document.createElement('div');
    $drink.classList.add('drink');
    $glass.appendChild($drink);
    $elem.appendChild($glass);

    document.querySelector('#background').appendChild($elem);

    this.$elem = $elem;
  }

  addVideo(element) {
    if (this.$video != null) {
      this.$video.remove();
    }

    this.$video = element;
    this.$elem.appendChild(element);
  }

  setMic(enabled) {
    this.stream.getAudioTracks().forEach((x) => x.enabled = enabled);
  }

  setCam(enabled) {
    this.stream.getVideoTracks().forEach((x) => x.enabled = enabled);
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;

    this.$elem.style.setProperty('--translate-x', `${x}px`);
    this.$elem.style.setProperty('--translate-y', `${y}px`);

    if (this.tooltip != null) this.tooltip.tooltip('update');

    const volume = this.delegate.calcVolume(this);
    const enabled = volume !== 0;

    if (this.$video != null) {
      this.$video.volume = volume;

      if (this.$video.muted != !enabled) {
        this.$video.muted = !enabled;

        // socketSend(enabled ? 'resume' : 'pause', this.id);
        if (enabled) {
          this.delegate.resume(this.id);
        } else {
          this.delegate.pause(this.id);
        }

        if (this.videoEnabled) {
          this.$elem.classList.toggle('video-enabled', enabled);
        }
      }
    }

    this.inRange = enabled;

    const scalar = (volume * (1 - 0.5)) + 0.5;
    this.$elem.style.setProperty('--scale', scalar);
  }

  setBroadcast(enabled) {
    this.broadcast = enabled;
    this.$elem.classList.toggle('broadcast-enabled', enabled);
    this.setPosition(this.x, this.y); // To update scale
  }

  get name() {
    return this._name;
  }
  set name(value) {
    this._name = value;
    this.$elem.querySelector('.avatar').textContent = value[0].toUpperCase();
  }

  get audioEnabled() {
    return this._audioEnabled;
  }
  set audioEnabled(enabled) {
    this._audioEnabled = enabled;

    this.$elem.classList.toggle('audio-enabled', enabled);
  }

  get videoEnabled() {
    return this._videoEnabled;
  }
  set videoEnabled(enabled) {
    this._videoEnabled = enabled;

    if (this.inRange) {
      this.$elem.classList.toggle('video-enabled', enabled);
    }
  }

  drawAudioRing(data) {
    const bottomCutoff = 0.4;
    const scale = Math.max(0, ((Math.max(...data) / 255) - bottomCutoff) / (1 - bottomCutoff));
    const width = (scale * 0.2) + 1;
    this.$elem.querySelector('.audioRing').style.setProperty('--volume', width);
  }

  render() {
    if (this.stream) {
      if (this.analyser == null) {
        const track = this.stream.getAudioTracks()[0];

        if (track != null) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const context = new AudioContext();
          const source = context.createMediaStreamSource(new MediaStream([track]));
          this.analyser = context.createAnalyser();
          this.analyser.smoothingTimeConstant = 0.3;
          source.connect(this.analyser);
        }
      }

      if (this.analyser != null) {
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);

        this.drawAudioRing(data);
      }
    }
  }
}

export class SelfPlayer extends Player {
  constructor(id, name, pos, delegate) {
    super(id, name, pos, delegate);
    this.inRange = true;
  }

  initElement() {
    super.initElement();

    this.$elem.classList.add('self');

    const $elem = this.$elem;
    let active = false;
    let offsetX;
    let offsetY;

    const pickup = (e) => {
      if (e.target !== $elem && e.target.parentNode !== $elem) {
        return;
      }

      if (e.type == 'mousedown' && event.which !== 1) {
        return;
      }

      pz.pause();

      e.stopPropagation();
      active = true;

      const rect = $elem.getBoundingClientRect();

      if (e.type === 'touchstart') {
        offsetX = e.touches[0].clientX - rect.x - (rect.width/2);
        offsetY = e.touches[0].clientY - rect.y - (rect.height/2);
      } else {
        offsetX = e.clientX - rect.x - (rect.width/2);
        offsetY = e.clientY - rect.y - (rect.height/2);
      }
    };

    const move = (e) => {
      if (active) {
        e.preventDefault();

        let x; let y;
        if (e.type === 'touchmove') {
          x = e.touches[0].clientX - offsetX;
          y = e.touches[0].clientY - offsetY;
        } else {
          x = e.clientX - offsetX;
          y = e.clientY - offsetY;
        }

        setTranslate(x, y, $elem);
      }
    };

    const drop = (e) => {
      active = false;
      pz.resume();
    };

    const setTranslate = (xPos, yPos, el) => {
      // Account for global zoom level
      const transform = pz.getTransform();
      const x = (xPos - transform.x) / transform.scale;
      const y = (yPos - transform.y) / transform.scale;

      this.setPosition(x, y);
    };

    const $bg = document.querySelector('#background');
    $bg.addEventListener('mousedown', pickup);
    $bg.addEventListener('touchstart', pickup);
    $bg.addEventListener('mousemove', move);
    $bg.addEventListener('touchmove', move);
    $bg.addEventListener('mouseup', drop);
    $bg.addEventListener('touchend', drop);
  }

  setMic(enabled) {
    super.setMic(enabled);
    this.audioEnabled = enabled;
    this.sync();
  }

  setCam(enabled) {
    super.setCam(enabled);
    this.videoEnabled = enabled;
    this.sync();
  }

  setBroadcast(enabled) {
    super.setBroadcast(enabled);
    this.sync();
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this.$elem.style.setProperty('--translate-x', `${x}px`);
    this.$elem.style.setProperty('--translate-y', `${y}px`);

    // TODO: reintroduce throttle
    this.delegate.position(Math.round(this.x), Math.round(this.y));

    // Refresh other players' positions to trigger size/volume updates etc.
    this.delegate.updatePlayers();
  }

  onDragStart(event) {
    event.stopPropagation();
    this.data = event.data;
    this.dragging = true;
  }

  onDragEnd() {
    this.dragging = false;
    this.data = null;
  }

  onDragMove(event) {
    if (!this.dragging) {
      return;
    }
    event.stopPropagation();
    const newPosition = this.data.getLocalPosition(this.parent);
    this.setPosition(newPosition.x, newPosition.y);
  }

  sync() {
    // socket.send(['update', this.name, this.audioEnabled, this.videoEnabled, this.broadcast]);
    this.delegate.update(this.name, this.audioEnabled, this.videoEnabled, this.broadcast);
  }
}
