const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { StatusCodes } = require('http-status-codes');
const pool = require('../../config/db');

async function setWorkingDirectory(userId, folderPath) {
    if (!folderPath) {
        return { status: StatusCodes.BAD_REQUEST, message: 'Folder path is required.' };
    }

    const resolvedPath = path.resolve(folderPath);
    const pathHash = crypto.createHash('sha256').update(resolvedPath).digest('hex');

    if (!fs.existsSync(resolvedPath)) {
        return { status: StatusCodes.NOT_FOUND, message: 'Folder path does not exist.' };
    }

    const query = `
        INSERT INTO folders (user_id, folder_path, path_hash, is_working_directory, is_active, is_deleted, created_at, updated_at)
        VALUES ($1, $2, $3, true, true, false, NOW(), NOW())
        ON CONFLICT (path_hash)
        DO UPDATE SET is_working_directory = true, updated_at = NOW();
    `;
    await pool.query(query, [userId, resolvedPath, pathHash]);

    return { status: StatusCodes.CREATED, message: 'Working directory set successfully.' };
}

async function getUserDirectories(userId) {
    const query = `
        SELECT folder_id, folder_path, is_working_directory 
        FROM folders
        WHERE user_id = $1
        ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [userId]);

    return { status: StatusCodes.OK, directories: result.rows.length ? result.rows : [] };
}

module.exports = {
    setWorkingDirectory,
    getUserDirectories
};
