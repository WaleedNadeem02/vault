const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // For generating path_hash
const pool = require('../config/db'); // PostgreSQL pool connection
const Joi = require('joi');
const auth = require('../middlewares/auth'); // JWT authentication middleware
const { StatusCodes } = require('http-status-codes');
const router = express.Router();

// Set Working Directory
router.post('/working-directory', auth, async (req, res) => {
    try {
        const userId = req.user.id; 
        const { folder_path } = req.body;
        const { error } = folderPathSchema.validate(folder_path);
        if (error) {
            return res.status(StatusCodes.BAD_REQUEST).send({ message: error.details[0].message });
        }

        if (!folder_path) {
            return res.status(StatusCodes.BAD_REQUEST).send({ message: 'Folder path is required.' });
        }

        // Resolve the absolute path
        const resolvedPath = path.resolve(folder_path);
        console.log("RESOLVED PATH", resolvedPath);
        // Generate hash for the folder path
        const pathHash = crypto.createHash('sha256').update(resolvedPath).digest('hex');

        // Check if the directory exists, if not create it
        if (!fs.existsSync(resolvedPath)) {
            return res.status(StatusCodes.NOT_FOUND).send({ message: 'Folder path does not exist.' });
        }
        else
        {
            console.log("PATH EXISTS");
        }

        const insertQuery = `
            INSERT INTO folders (user_id, folder_path, path_hash, is_working_directory, is_active, is_deleted, created_at, updated_at)
            VALUES ($1, $2, $3, true, true, false, NOW(), NOW())
            ON CONFLICT (path_hash)
            DO UPDATE SET
                is_working_directory = true,
                updated_at = NOW();
        `;
        await pool.query(insertQuery, [userId, resolvedPath, pathHash]);

        // Return success response
        res.status(StatusCodes.CREATED).send({ message: 'Working directory set successfully.' });
    } catch (err) {
        console.error('Error setting working directory:', err.message);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ message: 'An error occurred while setting the working directory.' });
    }
});


router.get('/directories', auth, async (req, res) => {
    try {
        const userId = req.user.id; // Extract user ID from the decoded JWT

        // Query to fetch all directories for the user
        const query = `
            SELECT folder_id, folder_path, is_working_directory 
            FROM folders
            WHERE user_id = $1
            ORDER BY created_at DESC;
        `;
        const result = await pool.query(query, [userId]);

        // If no directories are found, return an empty array
        if (result.rows.length === 0) {
            return res.status(StatusCodes.NO_CONTENT).json([]);
        }

        // Send the list of directories
        res.status(StatusCodes.OK).send(result.rows);
    } catch (error) {
        console.error("Error fetching user directories:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ message: "Error fetching user directories." });
    }
});

// Joi schema to validate the folder path
const folderPathSchema = Joi.object({
    folder_path: Joi.string().max(255).required().messages({
        'string.max': 'Folder path must be less than or equal to 255 characters.',
        'string.empty': 'Folder path is required.'
    })
});

module.exports = router;
