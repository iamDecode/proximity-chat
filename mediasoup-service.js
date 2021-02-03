'use strict';

const mediasoup = require('mediasoup');
const os = require('os');

const config = {
  numWorkers: Object.keys(os.cpus()).length,
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 11000,
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
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters:
            {
              'x-google-start-bitrate': 1000,
            },
        },
      ],
  },
  // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: '127.0.0.1', // replace by public IP address
      },
    ],
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  },
};

class MediasoupService {
  constructor(usocket) {
    this.runMediasoupWorker();

    /**
      * {
      *   producer: {
      *     transport: WebRtcTransport,
      *     audio: Producer,
      *     video: Producer
      *   },
      *   consumer {
      *     transport: WebRtcTransport,
      *     userId: {
      *       audio: Consumer,
      *       video: Consumer
      *     }
      *   }
      * }
    */
    this.users = new Map();
  }

  async message(ws, message, isBinary) {
    const data = Buffer.from(message).toString();
    const components = data.split(',');
    const requestId = components[1];

    if (components[0] == 'getRouterRtpCapabilities') {
      this.users.set(ws.id, {
        producer: {
          transport: null,
          audio: null,
          video: null,
        },
        consumer: {
          transport: null,
        },
      });
      ws.send(String(['ACK', requestId, JSON.stringify(this.router.rtpCapabilities)]));
      return;
    }

    if (components[0] == 'createProducerTransport') {
      const {transport, params} = await this.createWebRtcTransport();
      const user = this.users.get(ws.id);
      user.producer.transport = transport;
      this.users.set(ws.id, user);
      ws.send(String(['ACK', requestId, JSON.stringify(params)]));
      return;
    }

    if (components[0] == 'createConsumerTransport') {
      const {transport, params} = await this.createWebRtcTransport();
      const user = this.users.get(ws.id);
      user.consumer.transport = transport;
      this.users.set(ws.id, user);
      ws.send(String(['ACK', requestId, JSON.stringify(params)]));
      return;
    }

    if (components[0] == 'connectProducerTransport') {
      const args = data.substr(components[0].length + components[1].length + 2);
      const params = JSON.parse(args);
      await this.users.get(ws.id).producer.transport.connect({dtlsParameters: params});
      ws.send(String(['ACK', requestId]));
      return;
    }

    if (components[0] == 'connectConsumerTransport') {
      const args = data.substr(components[0].length + components[1].length + 2);
      const params = JSON.parse(args).dtlsParameters;
      await this.users.get(ws.id).consumer.transport.connect({dtlsParameters: params});
      ws.send(String(['ACK', requestId]));
      return;
    }

    if (components[0] == 'produce') {
      const args = data.substr(components[0].length + components[1].length + 2);
      const {kind, rtpParameters} = JSON.parse(args);
      const producer = await this.users.get(ws.id).producer.transport.produce({kind, rtpParameters});
      const user = this.users.get(ws.id);
      user.producer[kind] = producer;
      this.users.set(ws.id, user);
      ws.send(String(['ACK', requestId, producer.id]));
      return;
    }

    if (components[0] == 'consume') {
      const args = data.substr(components[0].length + components[1].length + 2);
      const {rtpCapabilities, producerKind, userId} = JSON.parse(args);
      const user = this.users.get(userId);
      const producer = user.producer[producerKind];

      if (producer != null) {
        const user = this.users.get(ws.id);
        const [consumer, params] = await this.createConsumer(producer, user.consumer.transport, rtpCapabilities);

        if (user.consumer[userId] == null) {
          user.consumer[userId] = {[producerKind]: consumer};
        } else {
          user.consumer[userId][producerKind] = consumer;
        }

        this.users.set(ws.id, user);
        ws.send(String(['ACK', requestId, JSON.stringify(params)]));
      } else {
        ws.send(String(['ACK', requestId, null]));
      }

      return;
    }

    if (components[0] == 'pause') {
      const userId = data.substr(components[0].length + components[1].length + 2);
      const consumers = this.users.get(ws.id).consumer[userId];

      console.log('user', ws.id, 'pauses', userId);
      for (const key in consumers) {
        if (consumers.hasOwnProperty(key)) {
          try {
            consumers[key].pause();
          } catch (e) {
          }
        }
      }

      return;
    }

    if (components[0] == 'resume') {
      const userId = data.substr(components[0].length + components[1].length + 2);
      const consumers = this.users.get(ws.id).consumer[userId];

      console.log('user', ws.id, 'resumes', userId);
      for (const key in consumers) {
        if (consumers.hasOwnProperty(key)) {
          try {
            consumers[key].resume();
          } catch (e) {
          }
        }
      }

      return;
    }
  }

  async close(ws, code, message) {
    const user = this.users.get(ws.id);

    for (const key in user.producer) {
      if (user.producer.hasOwnProperty(key)) {
        try {
          user.producer[key].close();
        } catch (e) {
          // closing can sometimes fail if the producer has already closed by itself.
        }
      }
    }

    try {
      user.consumer.transport.close();
    } catch (e) {
      // closing can sometimes fail if the consumer has already closed by itself.
    }

    delete user.consumer.transport;

    for (const key in user.consumer) {
      if (user.consumer.hasOwnProperty(key)) {
        for (const kind in user.consumer[key]) {
          if (user.consumer[key].hasOwnProperty(kind)) {
            try {
              user.consumer[key][kind].close();
            } catch (e) {
              // closing can sometimes fail if the consumer has already closed by itself.
            }
          }
        }
      }
    }

    this.users.delete(ws.id);
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
    this.router = await worker.createRouter({mediaCodecs});
  }

  async createWebRtcTransport() {
    const {
      maxIncomingBitrate,
      initialAvailableOutgoingBitrate,
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
        console.err(error);
      }
    }
    return {
      transport,
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }

  async createConsumer(producer, transport, rtpCapabilities) {
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
      consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
      });
    } catch (error) {
      console.error('consume failed', error);
      return;
    }

    try {
      if (consumer.type === 'simulcast') {
        await consumer.setPreferredLayers({spatialLayer: 2, temporalLayer: 2});
      }

      consumer.resume();
    } catch (e) {
    }

    return [consumer, {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    }];
  }
}

module.exports = {MediasoupService};
