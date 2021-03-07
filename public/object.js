import {Player, SelfPlayer} from './player.js';

export class ScreenShare extends Player {
  initElement(name) {
    if (name.indexOf('s', name.length - 1) >= 0) {
      name = `${name}' screen`;
    } else {
      name = `${name}'s screen`;
    }

    super.initElement(name);

    this.$elem.classList.add('screen');
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
      }
    }

    this.inRange = enabled;
  }

  get videoEnabled() {
    return this._videoEnabled;
  }
  set videoEnabled(enabled) {
    console.log('screen set to ', enabled);
    this._videoEnabled = enabled;
    this.$elem.classList.toggle('video-enabled', enabled);
  }

  drawAudioRing(data) {
    // Do nothing
  }

  render() {
    // Do nothing
  }
}


export class SelfScreenShare extends SelfPlayer {
  initElement() {
    super.initElement();
    this.$elem.classList.add('screen');
  }
}
