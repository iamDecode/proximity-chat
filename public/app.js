import {MediasoupClient} from './mediasoup-client.js';
import {Player, SelfPlayer} from './player.js';
import {Socket} from './socket.js';
import {attachSinkId, debounce} from './utils.js';


// Config
const SOUND_CUTOFF_RANGE = 350;
const SOUND_NEAR_RANGE = 200;


export class App {
  players = new Map();
  selfPlayer;

  constructor(socket) {
    this.socket = new Socket(`wss://${location.hostname}:9001`);
    this.socket.onmessage = async (...args) => await this.handleMessage(...args);
    this.socket.onopen = (_) => {
      this.mediasoupClient = new MediasoupClient(this.socket);
      this.mediasoupClient.init().then((_) => {
        this.socket.send(['connect', localStorage.getItem('name')]);
      });
    };

    // Start render loop for audioRing visualizations (10 fps)
    const performAnimation = () => {
      if (this.selfPlayer != null) this.selfPlayer.render();
      for (const player of this.players.values()) player.render();
    };

    setInterval(performAnimation, 1000/10);
  }

  async handleMessage(message) {
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

    // Setup peer when user receives id
    if ('id' in data) {
      if (this.selfPlayer != null) {
        console.log('destroying old identity', this.selfPlayer.id, 'and replacing with', data.id);
        peer.destroy();
        peer = undefined;
        return;
      }

      const name = localStorage.getItem('name');
      const stream = this.mediasoupClient.stream;

      this.selfPlayer = new SelfPlayer(data.id, name, data.pos, this.socket);
      this.selfPlayer.stream = stream;
      this.selfPlayer.audioEnabled = stream.getAudioTracks()[0] != null;
      this.selfPlayer.videoEnabled = stream.getVideoTracks()[0] != null;

      const callPauseResume = debounce((enabled, player) => {
        this.socket.send([enabled ? 'resume' : 'pause', 1, player.id]);
      }, 500);

      this.selfPlayer.delegate.position = (x, y) => {
        this.socket.send(['pos', x, y]);

        for (const player of this.players.values()) {
          const volume = this.calcVolume(player);

          const enabled = volume !== 0;
          if (player.inRange !== enabled) {
            callPauseResume(enabled, player);
          }

          player.setScale(volume);
        }
      };
      this.selfPlayer.delegate.update = (name, audio, video, broadcast, triggerPauseResume) => {
        this.socket.send(['update', name, audio, video, broadcast]);

        if (triggerPauseResume) {
          for (const player of this.players.values()) {
            if (broadcast) {
              this.socket.send(['resume', 0, player.id]);
            } else if (!player.inRange) {
              this.socket.send(['pause', 0, player.id]);
            }
          }
        }
      };

      await this.playStream(stream, this.selfPlayer);

      setInterval((_) => {
        this.socket.send('ping');
      }, 10000);
    }

    // Populate existing players
    else if ('players' in data) {
      for (const p of Object.values(data.players)) {
        const player = new Player(
            p.id,
            p.name,
            {x: parseInt(p.pos.x), y: parseInt(p.pos.y)},
        );

        player.delegate.calcVolume = this.calcVolume.bind(this);
        player.audioEnabled = p.audioEnabled;
        player.videoEnabled = p.videoEnabled;
        player.broadcast = p.broadcast;

        this.players.set(p.id, player);
        this.startCall(p.id);
      }
    }

    // Talk to any user who joins
    else if ('join' in data) {
      if (data.join.id == this.selfPlayer.id) {
        return;
      }

      console.log('calling', data.join.id);
      const player = new Player(data.join.id, data.join.name, data.join.pos);

      player.delegate.calcVolume = this.calcVolume.bind(this);
      player.audioEnabled = true;
      player.videoEnabled = true;

      this.players.set(data.join.id, player);
      this.startCall(data.join.id);
    }

    // Update player position
    else if ('position' in data) {
      if (this.players.has(data.position[0])) {
        const player = this.players.get(data.position[0]);
        player.setPosition(parseInt(data.position[1]), parseInt(data.position[2]));
      }
    }

    // Update player properties
    else if ('update' in data) {
      if (this.players.has(data.update.id)) {
        const player = this.players.get(data.update.id);
        player.name = data.update.name;
        player.audioEnabled = data.update.audioEnabled;
        player.videoEnabled = data.update.videoEnabled;
        player.broadcast = data.update.broadcast;
        player.setScale(this.calcVolume(player));
      }
    }

    // Remove players who left or disconnected
    else if ('leave' in data) {
      console.log('call dropped from', data.leave.id);
      // Remove player from players list

      if (this.players.has(data.leave.id)) {
        const player = this.players.get(data.leave.id);
        player.tooltip.tooltip('dispose');
        player.$elem.remove();
        this.players.delete(player.id);
      };
    }
  }

  async playStream(stream, target) {
    // Create the video element for the stream
    const $video = document.createElement('video');
    $video.srcObject = stream;
    $video.autoplay = true;
    $video.playsInline = true;

    if (window.sinkId != null) {
      attachSinkId($video, window.sinkId);
    }

    // Add it to the player
    if (target instanceof SelfPlayer) {
      $video.muted = true;
      $video.setAttribute('data-peer', target.id);
      target.addVideo($video);
    } else {
      $video.setAttribute('data-peer', target);
      const player = this.players.get(target);
      player.addVideo($video);
    }

    try {
      await elem.play();
    } catch (e) {
    }
  }

  async startCall(target) {
    console.log('starting call with ', target);
    const player = this.players.get(target);

    if (player == null) {
      console.log('couldn\'t find player for stream', call.id);
    } else if (player.stream == null) {
      player.stream = await this.mediasoupClient.createStream(target);
      await this.playStream(player.stream, target);
      // To ensure volume relative to position is set correctly.
      player.setScale(this.calcVolume(player));
      console.log('created stream for', target);
    }
  }

  calcVolume(player) {
    if (player.broadcast) {
      return 1;
    }

    // Calulate distance from listener to player
    const dist = Math.hypot(player.y - this.selfPlayer.y, player.x - this.selfPlayer.x);
    const scale = 1 - (dist - SOUND_NEAR_RANGE) / (SOUND_CUTOFF_RANGE - SOUND_NEAR_RANGE);

    // Target is too far away, no volume
    if (dist > SOUND_CUTOFF_RANGE) {
      return 0;
    }

    // Target is very close, max volume
    if (dist < SOUND_NEAR_RANGE) {
      return 1;
    }

    return scale;
  }
}
