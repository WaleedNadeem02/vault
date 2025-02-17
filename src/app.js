const express = require('express');
const winston = require('winston');
const app = express();
const config = require('config');

require('./startups/logging');
require('./startups/routes')(app);
require('./startups/validation')();
require('./startups/config')();
require('../config/connection');
require("./workers/fileCheckInWorker"); // Ensure the worker is always running in the background


const PORT = config.get("app.PORT");
winston.info(`PORT: ${PORT}`);

//const password = config.get("db.password");
//winston.info(`Password: ${password}`);

// const db = config.get("db");
// winston.info("DB", db);

// const dbUrl = `postgres://${db.username}:${db.password}@${db.host}:${db.port}/${db.name}`;
// winston.info(`Constructed URL: ${dbUrl}`);

// const jwt_secret = config.get("JWT_SECRET");
// winston.info(`JWT SECRET: ${jwt_secret}`);

app.listen(PORT, () => {
    winston.info(`Server is running on http://localhost:${PORT}`);
});


module.exports = app;
