const EventEmitter = require('eventemitter3')
const amqp = require('amqplib')
class AmqpConnector extends EventEmitter {
  constructor (client) {
    super()

    this.client = client
    this.connection = null
    this.channel = null
  }

  async initialize () {
    this.connection = await amqp.connect(this.client.options.amqpUrl || 'amqp://localhost')
    this.channel = await this.connection.createChannel()

    this.emit('ready')

    this.channel.assertQueue('weather-events', { durable: false, messageTtl: 60e3 })
  }

  async sendToQueue (event) {
    return this.channel.sendToQueue('weather-events', Buffer.from(JSON.stringify(event)))
  }
}

module.exports = AmqpConnector
