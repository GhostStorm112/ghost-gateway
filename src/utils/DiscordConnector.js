const EventEmitter = require('eventemitter3')
const amqp = require('amqp-connection-manager')
class AmqpConnector extends EventEmitter {
  constructor (client) {
    super()

    this.client = client
    this.connection = null
    this.channel = null
    this.id = null
  }

  async initialize (id) {
    if (this.id === null){
      this.id = id
    }
    this.connection = amqp.connect([this.client.options.amqpUrl || 'amqp://localhost'], {json: true});
    this.channel = this.connection.createChannel({
      setup: function(channel) {
        return Promise.all([
          channel.assertQueue(this.id, { durable: false, messageTtl: 60e3 }),
          channel.consume(this.id, async event => {
            this.emit('event', JSON.parse(event.content.toString()))
            channel.ack(event)
          })
        ])
      }.bind(this)
    })
    this.connection.on('disconnect', function(params) {
      this.client.log.info('AMQP-D', 'Disconnected!')
      this.client.log.error('AMQP-D', 'Disconnected ' + params.err.stack)

    }.bind(this))
    this.connection.on('connect', function(params) {
      this.client.log.info('AMQP-D', 'Connected!')

    }.bind(this))
  }

  async sendToQueue (event) {
    return this.channel.sendToQueue('weather-gateway-requests', Buffer.from(JSON.stringify(event)))
  }
}

module.exports = AmqpConnector
