const express = require('express');
const winston = require('winston');
const Joi = require('joi');
const auth = require('../middlewares/auth'); // JWT authentication middleware
const { setWorkingDirectory, getUserDirectories } = require('../services/directoryService');
const { StatusCodes } = require('http-status-codes');
const asyncMiddleware = require('../middlewares/async');
const router = express.Router();

// Set Working Directory
router.post('/working-directory', auth, asyncMiddleware(async (req, res) => {
    const userId = req.user.id; 
    const { folder_path } = req.body;

    winston.info(`Received folder path: ${folder_path} from user ${userId}`);
    const { error } = folderPathSchema.validate(req.body);

    if (error) {
        return res.status(StatusCodes.BAD_REQUEST).send({ message: error.details[0].message });
    }

    const result = await setWorkingDirectory(userId, folder_path);
    res.status(result.status).send(result.message);
}));


router.get('/directories', auth, asyncMiddleware(async (req, res) => {
    const userId = req.user.id;
    const result = await getUserDirectories(userId);
    res.status(result.status).send(result.directories);
}));

// Joi schema to validate the folder path
const folderPathSchema = Joi.object({
    folder_path: Joi.string().max(255).required().messages({
        'string.max': 'Folder path must be less than or equal to 255 characters.',
        'string.empty': 'Folder path is required.'
    })
});

module.exports = router;
