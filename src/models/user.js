const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

class User {
    constructor(id, username, email, passwordHash) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    async isValidPassword(password) {
        return await bcrypt.compare(password, this.passwordHash);
    }

    generateAuthToken() {
        const payload = { id: this.id, email: this.email };
        return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
    }
}

function validateUser(user) {
    const schema = Joi.object({
        username: Joi.string().min(5).max(50).required(),
        email: Joi.string().min(5).max(255).required().email(),
        password: Joi.string().min(5).max(255).required()
    });
    return schema.validate(user);
}

module.exports = { User, validateUser };

