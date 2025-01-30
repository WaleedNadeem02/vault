const { Pool } = require('pg');
const winston = require('winston');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
    winston.info('Connected to the database.');
});

pool.on('error', (err) => {
    winston.error('Database connection error:', err.stack);
});

module.exports = pool;
