export class Socket extends WebSocket {
  constructor(...args) {
    super(...args);
    this.requestId = 0;
  }

  // Send messages asyncronously with callback
  asyncSend(command, arg) {
    const requestId = this.requestId++;

    return new Promise((res, rej) => {
      const check = (message) => {
        const components = message.data.split(',');
        if (components[0] === 'ACK' && components[1] == requestId) {
          this.removeEventListener('message', check);
          res(message.data.substr(components[0].length + components[1].length + 2));
        }
      };
      this.addEventListener('message', check);
      if (arg != null) {
        this.send([command, requestId, arg]);
      } else {
        this.send([command, requestId]);
      }
    });
  }
}
