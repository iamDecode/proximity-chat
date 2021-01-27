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
    this.producers = new Map()
  }

  asWebSocketBehavior() {
    return {
      message: (...args) => this.message(...args),
      close: (...args) => this.close(...args),
    }
  }

  async message(ws, message, isBinary) {
    const data = Buffer.from(message).toString()
    const components = data.split(",");

    if (data == "getRouterRtpCapabilities") {
      ws.send(String(["getRouterRtpCapabilitiesAck", JSON.stringify(this.router.rtpCapabilities)]))
      return 
    }

    if (components[0] == 'createProducerTransport') {
      const { transport, params } = await this.createWebRtcTransport();
      this.producerTransport = transport;
      ws.send(String(["createProducerTransportAck", JSON.stringify(params)]))
      return
    }

    if (components[0] == 'createConsumerTransport') {
      const { transport, params } = await this.createWebRtcTransport();
      this.consumerTransport = transport;
      ws.send(String(["createConsumerTransportAck", JSON.stringify(params)]))
      return
    }

    if (components[0] == "connectProducerTransport") {
      await this.producerTransport.connect({ dtlsParameters: JSON.parse(data.substr(25)) });
      ws.send("connectProducerTransportAck")
      return
    }

    if (components[0] == "connectConsumerTransport") {
      await this.consumerTransport.connect({ dtlsParameters: JSON.parse(data.substr(25)).dtlsParameters });
      ws.send("connectConsumerTransportAck")
      return
    }

    if (components[0] == "produce") {
      const {kind, userId, rtpParameters} = JSON.parse(data.substr(8));
      const producer = await this.producerTransport.produce({ kind, rtpParameters });
      this.producers.set(userId, {producer, ws});
      ws.send(String(["produceAck", producer.id]))
      return
    }

    if (components[0] == "consume") {
      const { rtpCapabilities, userId } = JSON.parse(data.substr(8));
      const producer = this.producers.get(userId).producer;
      const consumer = await this.createConsumer(producer, rtpCapabilities);
      ws.send(String(["consumeAck", JSON.stringify(consumer)]));      
      return
    }

    if (components[0] == "resume") {
      await this.consumer.resume();
      ws.send("resumeAck")
      return
    }
  }

  async close(ws, code, message) {
    const entry = [...this.producers.values()].find(u => u.ws === ws);
    
    if (entry != null) {
      entry.producer.close()

      // remove the producer from the producers list
      this.producers.delete(entry.producer.id)
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

  async createConsumer(producer, rtpCapabilities) {
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
      consumer = await this.consumerTransport.consume({
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

    this.consumer = consumer
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