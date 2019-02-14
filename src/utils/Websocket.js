const EventEmitter = require('eventemitter3')
const Socket = require('ws')
const ws = this.ws
class Websocket extends EventEmitter {
  constructor (client) {
    super()
    this.client = client

  }
  async initialize () {
    this.connect()
  }

  async connect(){
    if (this.ws && this.ws.readyState === this.ws.OPEN) this.ws.close();
    this.ws = new Socket('ws://127.0.0.1:9911')
    this._registerListeners()
  }
  async heartbeat() {
    clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => {
      this.ws.terminate();
    }, 5000 + 2000);
  }
  async _registerListeners(){
    this.ws.on('ping', () => {
      this.heartbeat()
    });
    this.ws.on('open', () => {
      this.heartbeat()
      this.ws.send(JSON.stringify({
        op: 'request-shards',
        d: {
          resumeID: this.id
        }
      }))
      this.client.log.info('Websocket', 'Connected to Admiral server')
    })
    this.ws.on('message', d => {
      const packet = JSON.parse(d)
      if(packet.op === 'shard-ids'){
        this.emit('gateway-start', {
          firstId: packet.d.shards[0],
          lastId: packet.d.shards[packet.d.shards.length-1],
          shardAmount: packet.d.shardAmount,
        })
      }
    })
    this.on('close', async function clear () {
      clearTimeout(this.pingTimeout);
      this.client.log.info('Websocket', 'Disconnected')
      let reconnectTimeout = 500
      await new Promise(resolve => setTimeout(resolve, reconnectTimeout *= 2));
      this.connect()
    })
    this.on('error', async (error) => {
      this.client.log.error('Websocket', error)
    })
  }
}


  

  
module.exports = Websocket
  