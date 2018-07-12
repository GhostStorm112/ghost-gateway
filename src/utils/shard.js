class Shard {
  constructor (wm) {
    this.wm = wm
  }
  sendWS (shardID, op, packet) {
    this.wm.connector.sendToGateway({
      s: shardID,
      t: op,
      d: packet
    })
  }
}
module.exports = Shard
