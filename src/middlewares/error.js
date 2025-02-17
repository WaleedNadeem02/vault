const winston = require('winston');
const { StatusCodes } = require("http-status-codes");

module.exports = function (err, req, res, next) {
  winston.error(err.message, err);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ message: 'Something failed.' });
};
