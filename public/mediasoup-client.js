export class MediasoupClient {
  device;
  producerTransport;
  consumerTransport;
  stream;
  socket;

  constructor(socket) {
    this.socket = socket;
  }

  async init() {
    const rtpCapabilities = await this.socket.asyncSend('getRouterRtpCapabilities');

    this.device = await this.loadDevice(JSON.parse(rtpCapabilities));

    this.producerTransport = await this.initProducerTransport();

    try {
      this.stream = await this.getStream({audio: true, video: true}, true);

      const video = this.stream.getVideoTracks()[0];

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

        await this.producerTransport.produce(params);
      }

      const audio = this.stream.getAudioTracks()[0];

      if (audio != null) {
        await this.producerTransport.produce({track: audio});
      } else {
        alert('No audio devices detected!');
      }
    } catch (err) {
      console.error(err);
    }

    this.consumerTransport = await this.initConsumerTransport();
  }

  async loadDevice(routerRtpCapabilities) {
    let device;

    try {
      device = new mediasoupClient.Device();
    } catch (error) {
      if (error.name === 'UnsupportedError') {
        console.error('browser not supported');
        alert('Your browser is not supported!');
      }
    }

    await device.load({routerRtpCapabilities});

    return device;
  }


  async initProducerTransport() {
    const data = await this.socket.asyncSend('createProducerTransport', JSON.stringify({
      forceTcp: false,
      rtpCapabilities: this.device.rtpCapabilities,
    }));

    const transport = this.device.createSendTransport(JSON.parse(data));

    transport.on('connect', async ({dtlsParameters}, callback, errback) => {
      try {
        await this.socket.asyncSend('connectProducerTransport', JSON.stringify(dtlsParameters));
        callback();
      } catch (e) {
        errback(e);
      }
    });

    transport.on('produce', async ({kind, rtpParameters}, callback, errback) => {
      try {
        const id = await this.socket.asyncSend('produce', JSON.stringify({
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

    return transport;
  }

  async initConsumerTransport() {
    const data = await this.socket.asyncSend('createConsumerTransport', JSON.stringify({
      forceTcp: false,
    }));

    const transport = this.device.createRecvTransport(JSON.parse(data));

    transport.on('connect', async ({dtlsParameters}, callback, errback) => {
      try {
        await this.socket.asyncSend('connectConsumerTransport', JSON.stringify({
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

    return transport;
  }

  async consume(transport, producerKind, userId) {
    const {rtpCapabilities} = this.device;
    const params = JSON.stringify({userId, producerKind, rtpCapabilities});
    const data = await this.socket.asyncSend('consume', params);

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

  async getStream(constraints, isWebcam) {
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

  async createStream(target) {
    const stream = new MediaStream();
    const audio = await this.consume(this.consumerTransport, 'audio', target);
    stream.addTrack(audio);

    const video = await this.consume(this.consumerTransport, 'video', target);
    if (video != null) {
      stream.addTrack(video);
    }

    return stream;
  }
}