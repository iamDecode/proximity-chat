# Proximity Chat

Video chat system with audio volume dependent on your proximity to others. This naturally promotes forming groups, ideal for social gatherings. 

## Details
The project uses [mediasoup](https://mediasoup.org) for WebRTC audio and video sharing, and using [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) for the WebRTC signaling, as well as our own additions such as position broadcasting  with the least possible latency.

## Customizing the room
The directory `public/room` contains a room config file and a background image.

## SSL
Proximity Chat can run in SSL mode and non-SSL mode. However, non-SSL mode is mostly intended for setups where Proximity Chat runs behind a (reverse) proxy server terminates the SSL connection:

1.   Regardless of the server mode, the client code always connects using an SSL connection.
1.   Browsers may refuse to send camera and microphone data over unencrypted connections.

To run in SSL mode, set the `SSL_CERT_PATH` and `SSL_KEY_PATH` environment variables when invoking `yarn start`.

For local development you need to generate a self-signed certificate as voice media can only be requested (`MediaDevices.getUserMedia()`) over secure connections:

    yarn gen-ssl-certs

With those files, you can run the server using:

    export SSL_CERT_PATH="./cert/cert.pem" SSL_KEY_PATH="./cert/key.pem"
    
Or to wherever the key files are located on your production server.

## Running
Install dependencies with `yarn install` and run with `yarn start`. Open `https://127.0.0.1:3000`, `https://yourexternalip:3000`, or `https://yourlanip:3000` in a supporting browser on multiple devices. 

For running in production, make sure to set the `ANNOUNCED_IP` environmental variable to the external IP of your server.

## Docker image
Proximity Chat can run in a Docker container. Use the following steps to build and run using Docker:

    docker build -t proximity-chat .
    docker run -d -p 3000:3000 -p 9001:9001 -v "/$(pwd)\public":/usr/src/app/public:ro -v "/$(pwd)\cert":/usr/src/app/cert:ro -e SSL_CERT_PATH="./cert/cert.pem" -e SSL_KEY_PATH="./cert/key.pem" proximity-chat

This also binds your local `public` directory to the container, so that you can test frontend changes more quickly.

If you don't already have `cert.pem` and `key.pem` files, run `yarn gen-ssl-certs` before running these commands. If the certificates you're using are not embedded into the image, make them available to the Docker machine using a volume (similar to the given `-v` flag) and pass the appropriate values for `SSL_CERT_PATH` and `SSL_KEY_PATH`.

Find the IP address of the virtual machine that runs this using `docker-machine ip`. You may want to enable port forwarding from your machine's network IP to the VM's IP, so you can access the VM from other devices in your network.

## Lint
Please lint and commit-lint all commits. This is automatically checked on pull requests.
