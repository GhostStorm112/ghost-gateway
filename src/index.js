require('bluebird')
require('dotenv').config()

const EventEmitter = require('eventemitter3')
const GhostCore = require('ghost-core')
const path = require('path')
const { default: Cache } = require('@spectacles/cache')
const DiscordConnector = require('./utils/DiscordConnector')
const WorkerConnector = require('./utils/WorkerConnector')
const StatsD = require('hot-shots')
const CloudStorm = require('Cloudstorm')
const promisifyAll = require('tsubaki').promisifyAll
const fs = promisifyAll(require('fs'))
const uniqid = require('uniqid')
class GhostGateway extends EventEmitter {
  constructor (options = { }) {
    super()
    this.id = uniqid.process()
    this.discordConnector = new DiscordConnector(this)
    this.workerConnector = new WorkerConnector(this)

    this.options = Object.assign({
      disabledEvents: null,
      camelCaseEvents: false,
      eventPath: path.join(__dirname, './eventHandlers/')
    }, options)

    this.cache = new Cache({
      port: 6379,
      host: options.redisUrl,
      db: 0
    })

    this.lavalink = new GhostCore.LavalinkGatway({
      user: options.botId,
      password: options.lavalinkPassword,
      rest: options.lavalinkRest,
      ws: options.lavalinkWs,
      redis: this.cache,
      gateway: this.discordConnector
    })

    this.log = new GhostCore.Logger()

    this.stats = new StatsD({
      host: options.statsHost,
      port: options.statsPort,
      prefix: options.statsPrefix,
      telegraf: true
    })

    this.bot = new CloudStorm(options.token, {
      firstShardId: options.firstShard,
      lastShardId: options.lastShard,
      shardAmount: options.numShards
    })

    this.eventHandlers = new Map()
    this.requestHandlers = new Map()

  }

  async initialize () {
    await this.loadRequestHandlers()
    await this.loadEventHandlers()
    await this.bot.connect()
    await this.discordConnector.initialize(this.id)
    await this.workerConnector.initialize()

    this.discordConnector.on('event', event => {
      this.emit(event.t, event.d)
    })
    this.bot.on('event', event => {
      this.emit(event.t, event)
    })
    this.bot.on('shardReady', event => {
      this.emit('SHARD_READY', event)
    })
    this.lavalink.on('error', (d) => {
      this.log.error('Lavalink', d)
      this.log.info('Lavalink', 'Waiting for reconnect')
    })
  }

  async loadEventHandlers () {
    const files = await fs.readdirAsync(this.options.eventPath)
    for (const file of files) {
      if (!file.endsWith('.js') || file.includes(' ')) { continue }

      const handler = new (require(this.options.eventPath + file))(this)
      this.eventHandlers.set(handler.name, handler)
      this.log.debug('E-Loader', `Handler ${handler.name} loaded`)

      if (typeof handler.init === 'function') { await handler.init() }

      for (const event of handler.canHandle) { this.on(event, handler.handle.bind(handler)) }
    }
  }

  async loadRequestHandlers () {
    const files = await fs.readdirAsync(this.options.requestPath)
    for (const file of files) {
      if (!file.endsWith('.js') || file.includes(' ')) { continue }

      const handler = new (require(this.options.requestPath + file))(this)
      this.requestHandlers.set(handler.name, handler)
      this.log.debug('R-Loader', `Handler ${handler.name} loaded`)

      if (typeof handler.init === 'function') { await handler.init() }

      for (const event of handler.canHandle) {
        this.on(event, handler.handle.bind(handler))
      }
    }
  }
}

module.exports = GhostGateway
