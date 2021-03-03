import {colorFor, lighten} from './utils.js';


export class Player {
  id;
  color;
  x;
  y;
  inRange;
  delegate = {
    calcVolume: (player) => {},
  };

  // Properties with side effects
  _name;
  _audioEnabled = true;
  _videoEnabled = false;
  _broadcast = false;

  constructor(id, name, pos) {
    this.color = colorFor(name);

    this.$elem = this.initElement(name);
    document.querySelector('#background').appendChild(this.$elem);

    this.id = id;
    this.name = name;
    this.x = pos.x;
    this.y = pos.y;
    this.$elem.style.setProperty('--translate-x', `${this.x}px`);
    this.$elem.style.setProperty('--translate-y', `${this.y}px`);
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

    return $elem;
  }

  addVideo(element) {
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
    this.setScale(volume);
  }

  setScale(volume) {
    const enabled = volume !== 0;

    if (this.$video != null) {
      this.$video.volume = volume;

      if (this.inRange !== enabled) {
        this.$video.muted = !enabled;

        if (this.videoEnabled) {
          this.$elem.classList.toggle('video-enabled', enabled);
        }
      }
    }

    this.inRange = enabled;

    const scalar = (volume * (1 - 0.5)) + 0.5;
    this.$elem.style.setProperty('--scale', scalar);
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
    this.$elem.classList.toggle('video-enabled', enabled);
    if (this.$video != null) {
      this.$video.muted = !enabled;
    }
  }

  get broadcast() {
    return this._broadcast;
  }
  set broadcast(enabled) {
    this._broadcast = enabled;
    this.$elem.classList.toggle('broadcast-enabled', enabled);

    if (!(this instanceof SelfPlayer)) {
      this.setScale(this.delegate.calcVolume(this));
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

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);

      this.drawAudioRing(data);
    }
  }
}

export class SelfPlayer extends Player {
  delegate = {
    position: (x, y) => {},
    update: (name, audio, video, broadcast, trigger) => {},
  };

  initElement() {
    const $elem = super.initElement();

    $elem.classList.add('self');

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
        offsetX = e.touches[0].clientX - rect.x;
        offsetY = e.touches[0].clientY - rect.y;
      } else {
        offsetX = e.clientX - rect.x;
        offsetY = e.clientY - rect.y;
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

    return $elem;
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

  get broadcast() {
    return super.broadcast;
  }
  set broadcast(enabled) {
    super.broadcast = enabled;
    this.sync(true);
  }

  sync(triggerPauseResume) {
    this.delegate.update(
        this.name,
        this.audioEnabled,
        this.videoEnabled,
        this.broadcast,
        triggerPauseResume,
    );
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this.$elem.style.setProperty('--translate-x', `${x}px`);
    this.$elem.style.setProperty('--translate-y', `${y}px`);

    // TODO: reintroduce throttle
    this.delegate.position(Math.round(this.x), Math.round(this.y));
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
}
