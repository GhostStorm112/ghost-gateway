require('bluebird')
require('dotenv').config()

const { default: Cache } = require('@spectacles/cache')
const EventEmitter = require('eventemitter3')
const SnowTransfer = require('snowtransfer')
const GhostCore = require('Core')
const SettingsManager = require('SettingsManager')
const Shard = require('./utils/shard')
const AmqpConnector = require('./AqmpConnector')
const promisifyAll = require('tsubaki').promisifyAll
const fs = promisifyAll(require('fs'))
const path = require('path')
const info = require('./package.json')

class GhostGateway extends EventEmitter {
  constructor (options = { }) {
    super()

    this.log = new GhostCore.Logger()
    this.settings = new SettingsManager({
      dburl: process.env.MONGO_URL
    })
    this.options = Object.assign({
      disabledEvents: null,
      camelCaseEvents: false,
      eventPath: path.join(__dirname, './eventHandlers/')
    }, options)

    this.redis = new Cache({
      port: 6379,
      host: process.env.REDIS_URL,
      db: 2
    })

    this.cache = new Cache({
      port: 6379,
      host: process.env.REDIS_URL,
      db: 3
    })

    this.lavalink = new GhostCore.LavalinkWorker({
      user: process.env.BOT_ID,
      password: process.env.LAVALINK_PASSWORD,
      rest: process.env.LAVALINK_REST,
      ws: process.env.LAVALINK_WS,
      redis: this.redis,
      gateway: this.shard
    })

    this.info = info
    this.shard = new Shard(this)
    this.rest = new SnowTransfer(process.env.TOKEN)
    this.connector = new AmqpConnector(this)
    this.eventHandlers = new Map()
    this.log = new GhostCore.Logger()

    this.isOwner = function isOwner (id) {
      if (id === process.env.OWNER_ID) {
        return true
      } else {
        return false
      }
    }
  }

  async initialize () {
    await this.connector.initialize()
    await this.loadEventHandlers()
    await this.settings.init()

    this.connector.on('event', event => this.processEvent(event))
  }

  async loadEventHandlers () {
    const files = await fs.readdirAsync(this.options.eventPath)

    for (const file of files) {
      if (!file.endsWith('.js') || file.includes(' ')) { continue }

      const handler = new (require(this.options.eventPath + file))(this)
      this.eventHandlers.set(handler.name, handler)

      if (typeof handler.init === 'function') { await handler.init() }

      for (const event of handler.canHandle) { this.on(event, handler.handle.bind(handler)) }
    }
  }

  processEvent (event) {
    if (event.d) { event.d['shard_id'] = event.shard_id }
    return this.emit(this.options.camelCaseEvents ? GhostCore.Utils.CamelCaseEventName(event.t) : event.t, event.d)
  }
}

module.exports = GhostGateway
