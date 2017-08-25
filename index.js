var ric = require('./lib/requestIdleCallback')

var onAsyncHook = require('on-async-hook')
var loopbench = require('loopbench')
var mapLimit = require('map-limit')
var pidUsage = require('pidusage')
var heapdump = require('heapdump')
var gcStats = require('gc-stats')
var path = require('path')
var os = require('os')
var fs = require('fs')

var maxMem = os.totalmem()

module.exports = nodeClinic

function nodeClinic (emit) {
  var pid = process.pid

  sequence(function () {
    snapshot(function (err, obj) {
      if (err) emit('error', err)
      emit('heapsnapshot', obj)
    })
  })

  ric(function gatherStats (remaining) {
    pidUsage.stat(pid, function (_, stat) {
      var mem = stat.memory / maxMem
      emit('memory', mem)
      emit('cpu', stat.cpu)

      setTimeout(function () {
        ric(gatherStats)
      }, 300)
    })
  })

  onAsyncHook(function (data) {
    var first = data.spans[0]
    if (first.type === 'TCPWRAP' ||
      first.type === 'TCPCONNECTWRAP' ||
      first.type === 'HTTPPARSER') {
      emit('trace', data)
    }
  })

  var instance = loopbench()
  instance.on('load', function () {
    emit('load', instance.delay)
  })
  instance.on('unload', function () {
    emit('unload', instance.delay)
  })

  var gc = gcStats()
  gc.on('stats', function (stats) {
    emit('gc', stats)
  })
}

function snapshot (cb) {
  var filename = path.join(os.tmpdir(), Date.now() + '.heapsnapshot')
  heapdump.writeSnapshot(filename, function (err, filename) {
    if (err) return cb(err)
    fs.readFile(filename, function (err, buf) {
      if (err) return cb(err)
      fs.unlink(filename, function (err) {
        if (err) return cb(err)
        cb(null, {
          data: buf,
          path: filename
        })
      })
    })
  })
}

function sequence (cb) {
  var arr = [
    1000 * 10 * 1,
    1000 * 60 * 5,
    1000 * 60 * 10,
    1000 * 60 * 20
  ]

  mapLimit(arr, Infinity, iterator, function (err) {
    if (err) return cb(err)
    setInterval(cb, 60 * 30)
  })

  function iterator (val, done) {
    setTimeout(function () {
      cb()
      done()
    }, val)
  }
}