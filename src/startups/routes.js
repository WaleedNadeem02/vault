const express = require('express');
const authRoutes = require('../routes/auth');
const fileRoutes = require("../routes/files");
const workingDirectoryRoutes = require('../routes/workingDirectory');
const errorMiddleware = require('../middlewares/error');
const arena = require('./arena')

module.exports = function (app) {
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/arena', arena);
  app.use('/users', workingDirectoryRoutes);
  app.use("/files", fileRoutes);
  app.use(errorMiddleware);
};
