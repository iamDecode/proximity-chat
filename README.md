# Proximity Chat

Video chat system with audio volume dependent on your proximity to others. This naturally promotes forming groups, ideal for social gatherings. 

## Details
The project uses [peer.js](http://peerjs.com) for WebRTC audio and video sharing. The peer.js server is used for negotiation only, after which audio and video is sent between clients directly. [pixi.js](http://pixijs.io) is used to render the interface with WebGL 2 for performance that will scale for many users, and [pixi-viewport](https://github.com/davidfig/pixi-viewport) used for panning and zooming around the map. Finally, a second [uWebsockets.js](https://github.com/uNetworking/uWebSockets.js) server ensures position broadcasting with the least possible latency.

## Prerequisites
For local development you need to generate a self-signed certificate as voice media can only be requested (`MediaDevices.getUserMedia()`) over secure connections:

    openssl genrsa -out key.pem
    openssl req -new -key key.pem -out csr.pem
    openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
    rm csr.pem

For production, ensure to set the `certFile` and `keyFile` parameters in `main.js`.

## Running
Install dependencies with `yarn install` and run with `yarn start`. Open `https://127.0.0.1:3000`, `https://yourexternalip:3000`, or `https://yourlanip:3000` in a supporting browser on multiple devices. 

## Commit lint

Please commit-lint all commit messages. This should be automatically enforced by Husky.
