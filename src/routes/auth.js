require('express-async-errors');
const express = require('express');
const { StatusCodes } = require('http-status-codes');
const { loginUser, registerUser } = require('../services/authService');
const { validateUser } = require('../models/user');
require('dotenv').config();

const router = express.Router();

// Register User
router.post('/users', async (req, res) => {
    const { error } = validateUser(req.body); 
    if (error) return res.status(StatusCodes.BAD_REQUEST).send(error.details[0].message);

    const { username, email, password } = req.body;

    const result = await registerUser(username, email, password);
    res.status(result.status).send(result);
});

router.post('/sessions', async (req, res) => {

    const { email, password } = req.body;

    const result = await loginUser(email, password);
    res.status(result.status).send(result.token);
});

module.exports = router;
