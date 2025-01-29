const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1]; // Extract Bearer token
    if (!token) return res.status(401).send('Access denied. No token provided.');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach decoded payload to the request
        next();
    } catch (err) {
        res.status(400).send('Invalid token.');
    }
};
