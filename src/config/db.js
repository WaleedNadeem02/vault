const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
    console.log('Connected to the database.');
});

pool.on('error', (err) => {
    console.error('Database connection error:', err.stack);
});

module.exports = pool;
