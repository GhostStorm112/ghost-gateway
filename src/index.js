require('bluebird')
require('dotenv').config()

const EventEmitter = require('eventemitter3')
const GhostCore = require('ghost-core')
const path = require('path')
const { default: Cache } = require('@spectacles/cache')
const bodyParser = require('body-parser')
const express = require('express')
const app = express()
const DiscordConnector = require('./utils/DiscordConnector')
const WorkerConnector = require('./utils/WorkerConnector')

const gatewayRouter = require('./routes/gatewayRoutes')
const shardRouter = require('./routes/shardStatusRoutes')
const StatsD = require('hot-shots')
const CloudStorm = require('Cloudstorm')
const promisifyAll = require('tsubaki').promisifyAll
const fs = promisifyAll(require('fs'))

class GhostGateway extends EventEmitter {
  constructor (options = { }) {
    super()

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
      firstShardId: options.firstShard || 0,
      lastShardId: options.lastShard || (options.numShards ? options.numShards - 1 : 0),
      shardAmount: options.numShards || (options.firstShard && options.lastShard ? options.lastShard - options.firstShard + 1 : 1)
    })

    this.eventHandlers = new Map()

    app.use(bodyParser.urlencoded({extended: true}))
    app.use(bodyParser.json())
    app.use((req, res, next) => {
      req.bot = this.bot
      next()
    })
    app.use('/shards', shardRouter)
    app.use('/gateway', gatewayRouter)
    app.all('/', (req, res) => {
      res.json({version: '0.1', gatewayVersion: '0.1'})
    })
    app.listen(options.gwPort, options.gwHost)
  }

  async initialize () {
    await this.loadRequestHandlers()
    await this.discordConnector.initialize()
    await this.workerConnector.initialize()
    await this.bot.connect()
    this.discordConnector.on('event', event => this.processEvent(event))
  }

  async loadRequestHandlers () {
    const files = await fs.readdirAsync(this.options.eventPath)
    for (const file of files) {
      if (!file.endsWith('.js') || file.includes(' ')) { continue }

      const handler = new (require(this.options.eventPath + file))(this)
      this.eventHandlers.set(handler.name, handler)

      if (typeof handler.init === 'function') { await handler.init() }

      for (const event of handler.canHandle) {
        this.on(event, handler.handle.bind(handler))
      }
    }
  }

  processEvent (event) {
    return this.emit(event.t, event.d)
  }
}

module.exports = GhostGateway
