import {MediasoupClient} from './mediasoup-client.js';
import {Player, SelfPlayer} from './player.js';
import {ScreenShare, SelfScreenShare} from './object.js';
import {Socket} from './socket.js';
import {attachSinkId} from './utils.js';


// Config
const SOUND_CUTOFF_RANGE = 350;
const SOUND_NEAR_RANGE = 200;
const SCREEN_SOUND_CUTOFF_RANGE = 600;
const SCREEN_SOUND_NEAR_RANGE = 400;


export class App {
  constructor(socket) {
    this.players = new Map();
    this.selfPlayer = null;

    this.socket = new Socket(`wss://${location.hostname}:9001`);
    this.socket.onmessage = async (...args) => await this.handleMessage(...args);
    this.socket.onopen = (_) => {
      this.mediasoupClient = new MediasoupClient(this.socket);
      this.mediasoupClient.init().then((_) => {
        navigator.mediaDevices.enumerateDevices().then(window.gotDevices);
        this.socket.send(['connect', localStorage.getItem('name')]);
      });
    };

    this.playerDelegate = this.getDelegate();

    // Start render loop for audioRing visualizations (10 fps)
    const performAnimation = () => {
      if (this.selfPlayer != null) this.selfPlayer.render();
      for (const player of this.players.values()) {
        player.render();
      }
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

      this.selfPlayer = new SelfPlayer(data.id, name, data.pos, this.playerDelegate);
      this.selfPlayer.stream = stream;
      this.selfPlayer.audioEnabled = stream.getAudioTracks()[0] != null;
      this.selfPlayer.videoEnabled = stream.getVideoTracks()[0] != null;
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
            this.playerDelegate,
        );

        player.audioEnabled = p.audioEnabled;
        player.videoEnabled = p.videoEnabled;
        player.setBroadcast(p.broadcast);

        if (p.drink) {
          player.addDrink(p.drink.id, p.drink.time);
        }

        this.players.set(p.id, player);
        this.startCall(p.id);

        for (const objectId of Object.keys(p.objects)) {
          const object = p.objects[objectId];
          const delegate = this.getDelegate(objectId);
          const screenShare = new ScreenShare(objectId, p.name, object.pos, delegate);
          player.objects[objectId] = screenShare;

          screenShare.stream = await this.mediasoupClient.createStream(player.id, true);
          await this.playStream(screenShare.stream, player.id, objectId);

          screenShare.audioEnabled = true;
          screenShare.videoEnabled = true;
          screenShare.setPosition(screenShare.x, screenShare.y);
        }
      }
    }

    // Talk to any user who joins
    else if ('join' in data) {
      if (data.join.id == this.selfPlayer.id) {
        return;
      }

      console.log('calling', data.join.id);
      const player = new Player(data.join.id, data.join.name, data.join.pos, this.playerDelegate);

      player.audioEnabled = true;
      player.videoEnabled = true;

      this.players.set(data.join.id, player);

      this.startCall(data.join.id);
    }

    // Remove players who left or disconnected
    else if ('leave' in data) {
      console.log('call dropped from', data.leave.id);
      // Remove player from players list

      if (this.players.has(data.leave.id)) {
        const player = this.players.get(data.leave.id);

        for (const object of Object.values(player.objects)) {
          object.tooltip.tooltip('dispose');
          object.$elem.remove();
          delete player.objects[object.id];
        }

        player.tooltip.tooltip('dispose');
        player.$elem.remove();
        this.players.delete(player.id);
      };
    }

    // Add objects
    else if ('add' in data) {
      if (this.players.has(data.add.id)) {
        const objectId = data.add.objectId;
        const player = this.players.get(data.add.id);
        console.log('adding object with id', objectId, 'to user', player.id);


        if (objectId == 'screen') {
          const delegate = this.getDelegate(objectId);
          const screenShare = new ScreenShare(objectId, player.name, data.add.pos, delegate);
          player.objects[objectId] = screenShare;

          screenShare.stream = await this.mediasoupClient.createStream(player.id, true);
          await this.playStream(screenShare.stream, player.id, objectId);

          screenShare.audioEnabled = true;
          screenShare.videoEnabled = true;
          screenShare.setPosition(screenShare.x, screenShare.y);
        }
      };
    }

    // Remove objects
    else if ('remove' in data) {
      if (this.players.has(data.remove.id)) {
        console.log('removing object with id', data.remove.objectId, 'to user', data.remove.id);
        const player = this.players.get(data.remove.id);
        const object = player.objects[data.remove.objectId];
        object.tooltip.tooltip('dispose');
        object.$elem.remove();
        delete player.objects[data.remove.objectId];
      }
    }

    // add drinks
    else if ('drink' in data) {
      if (this.players.has(data.drink.id)) {
        const player = this.players.get(data.drink.id);
        player.addDrink(data.drink.drinkId, data.drink.time);
      }
    }

    // Update player position
    else if ('position' in data) {
      if (this.players.has(data.position[0])) {
        const player = this.players.get(data.position[0]);
        const x = parseInt(data.position[2]);
        const y = parseInt(data.position[3]);

        if (data.position[1] != '') {
          player.objects[data.position[1]].setPosition(x, y);
        } else {
          player.setPosition(x, y);
        }
      }
    }

    // Update player properties
    else if ('update' in data) {
      if (this.players.has(data.update.id)) {
        const player = this.players.get(data.update.id);
        player.name = data.update.name;
        player.audioEnabled = data.update.audioEnabled;
        player.videoEnabled = data.update.videoEnabled;
        player.setBroadcast(data.update.broadcast);
      }
    }
  }

  async playStream(stream, target, objectId) {
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

      if (objectId != null) {
        player.objects[objectId].addVideo($video);
      } else {
        player.addVideo($video);
      }
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
      player.setPosition(player.x, player.y);
      console.log('created stream for', target);
    }
  }

  async shareScreen(enabled) {
    const objectId = 'screen';

    if (enabled) {
      await this.mediasoupClient.shareScreen();
      const stream = this.mediasoupClient.screenStream;

      if (stream != null) {
        stream.getVideoTracks()[0].onended = () => {
          this.shareScreen(false);
        };

        const screenShare = new SelfScreenShare(
            this.selfPlayer.id,
            this.selfPlayer.name,
            {x: this.selfPlayer.x, y: this.selfPlayer.y},
            this.getDelegate('screen'),
        );
        screenShare.audioEnabled = stream.getAudioTracks()[0] != null;
        screenShare.videoEnabled = stream.getVideoTracks()[0] != null;

        this.selfPlayer.objects[objectId] = screenShare;

        this.socket.send(['add', objectId, screenShare.x, screenShare.y]);
        this.playStream(stream, screenShare);

        document.querySelector('button.screenshare').classList.add('enabled');
      }
    } else {
      if (this.mediasoupClient.screenStream != null) {
        const tracks = this.mediasoupClient.screenStream.getTracks();
        tracks.forEach((track) => track.stop());
        this.mediasoupClient.screenStream = null;
      }

      this.socket.send(['remove', objectId]);

      const screenShare = this.selfPlayer.objects[objectId];
      screenShare.$elem.remove();
      delete this.selfPlayer.objects[objectId];

      document.querySelector('button.screenshare').classList.remove('enabled');
    }
  }

  getDelegate(objectId) {
    const delegate = {
      calcVolume: (player) => {
        if (player.broadcast) {
          return 1;
        }

        const NEAR = (objectId == null) ? SOUND_NEAR_RANGE : SCREEN_SOUND_NEAR_RANGE;
        const CUTFOFF = (objectId == null) ? SOUND_CUTOFF_RANGE : SCREEN_SOUND_CUTOFF_RANGE;

        // calulate angle and distance from listener to sound
        const dist = Math.hypot(player.y - this.selfPlayer.y, player.x - this.selfPlayer.x);
        const scale = 1 - (dist - NEAR) / (CUTFOFF - NEAR);

        // target is too far away, no volume
        if (dist > CUTFOFF) {
          return 0;
        }

        // Limit screen volume to 0.25
        if (objectId != null) {
          if (dist < NEAR) {
            return 0.25;
          }
          return scale * 0.25;
        }

        // target is very close, max volume
        if (dist < NEAR) {
          return 1;
        }

        return scale;
      },
    };

    if (objectId == null) {
      delegate.pause = (id) => {
        this.socket.send(['pause', null, id]);
      };

      delegate.resume = (id) => {
        this.socket.send(['resume', null, id]);
      };

      delegate.update = (name, audio, video, broadcast) => {
        this.socket.send(['update', name, audio, video, broadcast]);
      };

      delegate.updatePlayers = () => {
        for (const player of this.players.values()) {
          player.setPosition(player.x, player.y);

          for (const object of Object.values(player.objects)) {
            object.setPosition(object.x, object.y);
          }
        }
      };
    } else {
      delegate.pause = delegate.resume = delegate.update = delegate.updatePlayers = () => {};
    }

    delegate.position = (x, y) => {
      this.socket.send(['pos', objectId, x, y]);
    };


    return delegate;
  };
}
