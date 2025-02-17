const Arena = require('bull-arena');
const { Queue } = require('bullmq');
const express = require('express');
const router = express.Router();
const config = require("config");

const redisHost = config.get("redis_host");
const redisPort = config.get("redis_port");

const arenaConfig = Arena(
  {
    BullMQ: Queue,
    queues: [
      {
        type: 'bullmq',
        name: 'file-checkin',  
        hostId: 'Local Worker',
        redis: {
          host: redisHost,
          port: redisPort, 
        },
      },
    ],
  },
  {
    basePath: '/', 
    disableListen: true,
  }
);

router.use('/', arenaConfig);

module.exports = router;
