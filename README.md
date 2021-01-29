# Proximity Chat

Video chat system with audio volume dependent on your proximity to others. This naturally promotes forming groups, ideal for social gatherings. 

## Details
The project uses [peer.js](http://peerjs.com) for WebRTC audio and video sharing. The peer.js server is used for negotiation only, after which audio and video is sent between clients directly. [pixi.js](http://pixijs.io) is used to render the interface with WebGL 2 for performance that will scale for many users, and [pixi-viewport](https://github.com/davidfig/pixi-viewport) used for panning and zooming around the map. Finally, a second [uWebsockets.js](https://github.com/uNetworking/uWebSockets.js) server ensures position broadcasting with the least possible latency.

## SSL
Proximity Chat can run in SSL mode and non-SSL mode. However, non-SSL mode is mostly intended for setups where Proximity Chat runs behind a (reverse) proxy server terminates the SSL connection:

1.   Regardless of the server mode, the client code always connects using an SSL connection.
1.   Browsers may refuse to send camera and microphone data over unencrypted connections.

To run in SSL mode, set the `SSL_CERT_PATH` and `SSL_KEY_PATH` environment variables when invoking `yarn start`.

For local development you need to generate a self-signed certificate as voice media can only be requested (`MediaDevices.getUserMedia()`) over secure connections:

    openssl genrsa -out key.pem
    openssl req -new -key key.pem -out csr.pem
    openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
    rm csr.pem

With those files, you can run the server using:

    export SSL_CERT_PATH="./cert.pem" SSL_KEY_PATH="./key.pem"
    
Or to wherever the key files are located on your production server.

## Running
Install dependencies with `yarn install` and run with `yarn start`. Open `https://127.0.0.1:3000`, `https://yourexternalip:3000`, or `https://yourlanip:3000` in a supporting browser on multiple devices. 

## Commit lint

Please commit-lint all commit messages. This should be automatically enforced by Husky.
