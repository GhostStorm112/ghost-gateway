const EventEmitter = require('eventemitter3')
const amqp = require('amqp-connection-manager')
class AmqpConnector extends EventEmitter {
  constructor (client) {
    super()

    this.client = client
    this.connection = null
    this.channel = null
  }

  async initialize () {
    this.connection = amqp.connect([this.client.options.amqpUrl || 'amqp://localhost'], {json: true});
    this.channel = this.connection.createChannel({
      setup: function(channel) {
        return Promise.all([
          channel.assertQueue('weather-events', { durable: false, messageTtl: 60e3 })
        ])
      }
    })

    this.connection.on('disconnect', function(params) {
      this.client.log.info('AMQP-W', 'Disconnected!')
      this.client.log.error('AMQP-W', 'Disconnected ' + params.err.stack)

    }.bind(this))
    this.connection.on('connect', function(params) {
      this.client.log.info('AMQP-W', 'Connected!')

    }.bind(this))
  }

  async sendToQueue (event) {
    return this.channel.sendToQueue('weather-events', Buffer.from(JSON.stringify(event)))
  }
}

module.exports = AmqpConnector
