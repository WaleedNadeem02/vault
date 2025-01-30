const express = require('express');
const authRoutes = require('../routes/auth');
const workingDirectoryRoutes = require('../routes/workingDirectory');
const errorMiddleware = require('../middlewares/error');

module.exports = function (app) {
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/users', workingDirectoryRoutes);
  app.use(errorMiddleware);
};
