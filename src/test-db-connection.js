const pool = require('./config/db');
const winston = require('winston');

(async () => {
    try {
        const res = await pool.query('SELECT NOW()');
        winston.info('Database connected:', res.rows[0]);
    } catch (err) {
        winston.error('Error connecting to the database:', err);
    } finally {
        await pool.end();
    }
})();
