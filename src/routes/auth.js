const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { StatusCodes } = require('http-status-codes');
const pool = require('../config/db'); 
const User = require('../models/user');
require('dotenv').config();

const router = express.Router();

// Register User
router.post('/users', async (req, res) => {
    const { error } = validate(req.body); 
    if (error) return res.status(StatusCodes.BAD_REQUEST).send(error.details[0].message);

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        console.log(username, email, password);
        return res.status(StatusCodes.BAD_REQUEST).send('All fields are required.');
    }

    try {
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(StatusCodes.CONFLICT).send('User already registered.');
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash, created_at, updated_at) 
             VALUES ($1, $2, $3, NOW(), NOW()) RETURNING user_id`,
            [username, email, passwordHash]
        );

        const userId = result.rows[0].user_id;

        res.status(StatusCodes.CREATED).send({ user_id: userId, message: 'User registered successfully.'});
    } catch (err) {
        console.error(err);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('An error occurred.');
    }
});

router.post('/sessions', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(StatusCodes.BAD_REQUEST).send('Email and password are required.');
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(StatusCodes.UNAUTHORIZED).send('Invalid email or password.');
        }

        const userRow = result.rows[0];
        const user = new User(userRow.user_id, userRow.username, userRow.email, userRow.password_hash);

        const validPassword = await user.isValidPassword(password);
        if (!validPassword) {
            return res.status(StatusCodes.UNAUTHORIZED).send('Invalid email or password.');
        }

        const token = user.generateAuthToken();
        res.status(StatusCodes.OK).send({ token });
    } catch (err) {
        console.error(err);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('An error occurred.');
    }
});

function validate(user) {
    const schema = Joi.object({
        username: Joi.string().min(5).max(50).required(),
        email: Joi.string().min(5).max(255).required().email(),
        password: Joi.string().min(5).max(255).required()
    });
    return schema.validate(user);
}

module.exports = router;
