const Redis = require('ioredis');
const winston = require('winston');
const config = require('config');
const redis = new Redis(); // Default: localhost:6379

redis.ping()
  .then(response => winston.info(`Redis Connected: ${response}`))
  .catch(err => winston.error("Redis Connection Error", err));

module.exports = redis;
