const express = require('express');
require('dotenv').config();
const app = express();
const authRoutes = require('./routes/auth');
const workingDirectoryRoute = require('./routes/workingDirectory');

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.status(200).send('Decentralized File Vault API is running.');
});

app.use('/auth', authRoutes);
app.use('/users', workingDirectoryRoute);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


module.exports = app;
