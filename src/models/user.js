const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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

module.exports = User;
