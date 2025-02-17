const { Queue } = require("bullmq");
const config = require("config");

const redisHost = config.get("redis_host");
const redisPort = config.get("redis_port");

const checkInQueue = new Queue("file-checkin", {
  connection: { host: redisHost, port: redisPort }, 
});

(async () => {
  await checkInQueue.setGlobalConcurrency(3); 
})();

module.exports = checkInQueue;
