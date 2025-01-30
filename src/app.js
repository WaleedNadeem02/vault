const express = require('express');
const winston = require('winston');
const config = require('config');
const logging = require('./startups/logging');
const routes = require('./startups/routes');

const app = express();
logging();
routes(app);


app.get('/', (req, res) => {
    res.status(200).send('Decentralized File Vault API is running.');
});

const PORT = config.get("app.PORT");
winston.info(`PORT: ${PORT}`);

const password = config.get("db.password");
winston.info(`Password: ${password}`);

const db = config.get("db");
winston.info("DB", db);

const dbUrl = `postgres://${db.username}:${db.password}@${db.host}:${db.port}/${db.name}`;
winston.info(`Constructed URL: ${dbUrl}`);

const jwt_secret = config.get("JWT_SECRET");
winston.info(`JWT SECRET: ${jwt_secret}`);

app.listen(PORT, () => {
    winston.info(`Server is running on http://localhost:${PORT}`);
});


module.exports = app;
