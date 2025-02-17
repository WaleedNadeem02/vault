const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');
const pool = require('../../config/db');
require('dotenv').config();

async function loginUser(email, password) {
    if (!email || !password) {
        return { status: StatusCodes.BAD_REQUEST, message: 'Email and password are required.' };
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
        return { status: StatusCodes.UNAUTHORIZED, message: 'Invalid email or password.' };
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
        return { status: StatusCodes.UNAUTHORIZED, message: 'Invalid email or password.' };
    }

    const token = jwt.sign({ id: user.user_id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '10h' });
    return { status: StatusCodes.OK, token };
}


async function registerUser(username, email, password) {
    if (!username || !email || !password) {
        return { status: StatusCodes.BAD_REQUEST, message: 'All fields are required.' };
    }

    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
        return { status: StatusCodes.CONFLICT, message: 'User already registered.' };
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.query(
        `INSERT INTO users (username, email, password_hash, created_at, updated_at) 
            VALUES ($1, $2, $3, NOW(), NOW()) RETURNING user_id`,
        [username, email, passwordHash]
    );

    return { status: StatusCodes.CREATED, user_id: result.rows[0].user_id, message: 'User registered successfully.' };
}

module.exports = {
    loginUser,
    registerUser
};
