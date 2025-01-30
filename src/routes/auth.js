const express = require('express');
const Joi = require('joi');
const { StatusCodes } = require('http-status-codes');
const { loginUser, registerUser } = require('../services/authService');
const asyncMiddleware = require('../middlewares/async');
require('dotenv').config();

const router = express.Router();

// Register User
router.post('/users', asyncMiddleware(async (req, res) => {
    const { error } = validate(req.body); 
    if (error) return res.status(StatusCodes.BAD_REQUEST).send(error.details[0].message);

    const { username, email, password } = req.body;

    const result = await registerUser(username, email, password);
    res.status(result.status).send(result);
}));

router.post('/sessions', asyncMiddleware(async (req, res) => {
    const { error } = validate(req.body);
    if (error) return res.status(StatusCodes.BAD_REQUEST).send(error.details[0].message);

    const { email, password } = req.body;

    const result = await loginUser(email, password);
    res.status(result.status).send(result);
}));

function validate(user) {
    const schema = Joi.object({
        username: Joi.string().min(5).max(50).required(),
        email: Joi.string().min(5).max(255).required().email(),
        password: Joi.string().min(5).max(255).required()
    });
    return schema.validate(user);
}

module.exports = router;
