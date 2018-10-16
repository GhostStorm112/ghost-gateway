const EventEmitter = require('eventemitter3')
const amqp = require('amqplib')
class AmqpConnector extends EventEmitter {
  constructor (client) {
    super()

    this.client = client
    this.connection = null
    this.channel = null
  }

  async initialize (id) {
    this.connection = await amqp.connect(this.client.options.amqpUrl || 'amqp://localhost')
    this.channel = await this.connection.createChannel()

    this.channel.assertQueue(id, { durable: false, messageTtl: 60e3 })
    this.channel.consume(id, async event => {
      await this.channel.ack(event)
      this.emit('event', JSON.parse(event.content.toString()))
    })
    // this.loadShardQueues(shards, this.channel, this)
    this.emit('ready')
  }

  async loadShardQueues (shards, channel, amq) {
    Object.keys(shards).forEach(function (shard) {
      const _shard = shards[shard]
      amq.client.log.debug('M-QUEUE', `shard-${_shard.id} created`)
      channel.assertQueue(`shard-${_shard.id}`, { durable: false, messageTtl: 60e3 })
      channel.consume(`shard-${_shard.id}`, async event => {
        await channel.ack(event)
        amq.emit('event', JSON.parse(event.content.toString()))
      })
    })
  }

  async sendToQueue (event) {
    return this.channel.sendToQueue('weather-gateway-requests', Buffer.from(JSON.stringify(event)))
  }
}

module.exports = AmqpConnector
