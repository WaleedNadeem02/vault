require('express-async-errors');
const express = require("express");
const auth = require("../middlewares/auth");
const pool = require("../../config/db");
const {
  checkInFiles,
  getFileVersionToDirectory,
  getFileVersions,
  getLatestVersion,
  getAllFilesWithLatestVersion,
  deleteFileVersion
} = require("../services/fileService");
const { StatusCodes } = require("http-status-codes");

const router = express.Router();

// Delete a version of a file
router.patch(
  "/:file_id/version/:version",
  auth, async (req, res) => {
    const { file_id, version } = req.params;
    const userId = req.user.id;

    const fileQuery = `
      SELECT 1 FROM userFiles uf 
      JOIN files f ON uf.file_id = f.file_id 
      WHERE uf.user_id = $1 AND f.file_id = $2 AND uf.is_active = TRUE AND f.is_active = TRUE
    `;
    const fileResult = await pool.query(fileQuery, [userId, file_id]);

    if (fileResult.rowCount === 0) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'File does not belong to this user or is not active.' });
    }

    const response = await deleteFileVersion(file_id, version);

    // Send response
    res.status(StatusCodes.OK).json(response);
  }
);

// Check in files
router.post(
  "/",
  auth, async (req, res) => {
    const userId = req.user.id;
    const { working_directory_id, folders = [], files = []} = req.body;

    if (!working_directory_id) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Working directory ID is required." });
    }

    const uploadedFiles = await checkInFiles(
      userId,
      working_directory_id,
      folders,
      files
    );

    res.status(StatusCodes.CREATED).json({
      message: "Files checked in successfully.",
      uploadedFiles,
    });
  }
);

// Get all files with latest version
router.get(
  "/",
  auth, async (req, res) => {
    const userId = req.user.id; 
    // Get files with their latest version information
    const files = await getAllFilesWithLatestVersion(userId);

    // Respond with the files in the required format
    res.status(StatusCodes.OK).json(files);
  }
);

// Get a version of a file
router.get(
  "/:file_id/version/:version_number",
  auth, async (req, res) => {
    const { file_id, version_number } = req.params;
    const userId = req.user.id;

    const result = await getFileVersionToDirectory(file_id, version_number, userId);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(StatusCodes.OK).json(result);
  }
);

// Get all versions of a file
router.get(
  "/:file_id/versions",
  auth, async (req, res) => {
    const { file_id } = req.params;
    const userId = req.user.id;

    const result = await getFileVersions(file_id, userId);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(StatusCodes.OK).json(result);
  }
);

// Get latest version of a file
router.get(
  "/:file_id/latest",
  auth, async (req, res) => {
    const { file_id } = req.params;
    const userId = req.user.id;

    const result = await getLatestVersion(file_id, userId);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(StatusCodes.OK).json(result);
  }
);

module.exports = router;
