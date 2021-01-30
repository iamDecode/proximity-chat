const mediasoup = require('mediasoup')
const os = require('os')

const config = {
  numWorkers : Object.keys(os.cpus()).length,
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'debug',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      // 'rtx',
      // 'bwe',
      // 'score',
      // 'simulcast',
      // 'svc'
    ],
  },
  // Router settings
  router: {
    mediaCodecs:
      [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters:
            {
              'x-google-start-bitrate': 1000
            }
        },
      ]
  },
  // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',      
        announcedIp: '127.0.0.1' // replace by public IP address
      }
    ],
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000
  }
}

class MediasoupService {
  constructor(usocket) {
    this.runMediasoupWorker()

    // Maps userid to producer
    this.producers = {
      audio: new Map(),
      video: new Map()
    }
    this.producerTransports = new Map();
    this.consumerTransports = new Map();
  }

  async message(ws, message, isBinary) {
    const data = Buffer.from(message).toString()
    const components = data.split(",");
    const requestId = components[1]

    if (components[0] == "getRouterRtpCapabilities") {
      ws.send(String(["ACK", requestId, JSON.stringify(this.router.rtpCapabilities)]))
      return 
    }

    if (components[0] == 'createProducerTransport') {
      const { transport, params } = await this.createWebRtcTransport();
      this.producerTransports.set(ws.id, transport);
      ws.send(String(["ACK", requestId, JSON.stringify(params)]))
      return
    }

    if (components[0] == 'createConsumerTransport') {
      const { transport, params } = await this.createWebRtcTransport();
      this.consumerTransports.set(ws.id, transport);
      ws.send(String(["ACK", requestId, JSON.stringify(params)]))
      return
    }

    if (components[0] == "connectProducerTransport") {
      await this.producerTransports.get(ws.id).connect({ dtlsParameters: JSON.parse(data.substr(components[0].length + components[1].length + 2)) });
      ws.send(String(["ACK", requestId]))
      return
    }

    if (components[0] == "connectConsumerTransport") {
      await this.consumerTransports.get(ws.id).connect({ dtlsParameters: JSON.parse(data.substr(components[0].length + components[1].length + 2)).dtlsParameters });
      ws.send(String(["ACK", requestId]))
      return
    }

    if (components[0] == "produce") {
      const {kind, rtpParameters} = JSON.parse(data.substr(components[0].length + components[1].length + 2));
      const producer = await this.producerTransports.get(ws.id).produce({ kind, rtpParameters });
      this.producers[kind].set(ws.id, producer);
      ws.send(String(["ACK", requestId, producer.id]))
      return
    }

    if (components[0] == "consume") {
      const { rtpCapabilities, producerKind, userId } = JSON.parse(data.substr(components[0].length + components[1].length + 2));
      const producer = this.producers[producerKind].get(userId);

      if (producer != null) {
        const consumer = await this.createConsumer(producer, ws.id, rtpCapabilities);
        ws.send(String(["ACK", requestId, JSON.stringify(consumer)]));
      } else {
        ws.send(String(["ACK", requestId, null]));
      }
      
      return
    }
  }

  async close(ws, code, message) {
    const producerTransport = this.producerTransports.get(ws.id)
    const consumerTransport = this.producerTransports.get(ws.id)

    producerTransport.close()
    this.producerTransports.delete(ws.id)

    consumerTransport.close()
    this.consumerTransports.delete(ws.id)

    const audioProducer = this.producers.audio.get(ws.id)
    
    if (audioProducer != null) {
      audioProducer.close()
      this.producers.audio.delete(ws.id)
    }

    const videoProducer = this.producers.video.get(ws.id)
    if (videoProducer != null) {
      videoProducer.close()
      this.producers.video.delete(ws.id)
    }
  }

  async runMediasoupWorker() {
    const worker = await mediasoup.createWorker({
      logLevel: config.worker.logLevel,
      logTags: config.worker.logTags,
      rtcMinPort: config.worker.rtcMinPort,
      rtcMaxPort: config.worker.rtcMaxPort,
    });

    worker.on('died', () => {
      console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
      setTimeout(() => process.exit(1), 2000);
    });

    const mediaCodecs = config.router.mediaCodecs;
    this.router = await worker.createRouter({ mediaCodecs });
  }

  async createWebRtcTransport() {
    const {
      maxIncomingBitrate,
      initialAvailableOutgoingBitrate
    } = config.webRtcTransport;

    const transport = await this.router.createWebRtcTransport({
      listenIps: config.webRtcTransport.listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate,
    });
    if (maxIncomingBitrate) {
      try {
        await transport.setMaxIncomingBitrate(maxIncomingBitrate);
      } catch (error) {
        console.err(error)
      }
    }
    return {
      transport,
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      },
    };
  }

  async createConsumer(producer, id, rtpCapabilities) {
    if (!this.router.canConsume(
      {
        producerId: producer.id,
        rtpCapabilities,
      })
    ) {
      console.error('can not consume');
      return;
    }
    let consumer;
    try {
      consumer = await this.consumerTransports.get(id).consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
      });
    } catch (error) {
      console.error('consume failed', error);
      return;
    }

    if (consumer.type === 'simulcast') {
      await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
    }

    consumer.resume();

    return {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    };
  }
}

module.exports = { MediasoupService };