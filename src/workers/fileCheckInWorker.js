const { Worker } = require("bullmq");
const pool = require("../../config/db");
const winston = require("winston");
const path = require("path");
const fs = require("fs/promises");
const { uploadFileToS3, getRelativePath, generatePathHash, calculateChecksum, getOrCreateFolders, getFilesRecursively } = require("../services/fileService");
const config = require("config");

const redisHost = config.get("redis_host");
const redisPort = config.get("redis_port");


const worker = new Worker(
  "file-checkin",
  async (job) => {
    const { userId, workingDirectoryId, folders, files } = job.data;
    const client = await pool.connect();

    try {
      let uploadedFiles = [];
      await client.query("BEGIN");

      // Fetch base folder path
      const baseFolderQuery = `SELECT folder_path FROM folders WHERE folder_id = $1 AND user_id = $2 AND is_active = true`;
      const baseFolderResult = await client.query(baseFolderQuery, [workingDirectoryId, userId]);

      if (baseFolderResult.rowCount === 0) {
        throw new Error(`Base folder not found or inactive for user ${userId}`);
      }

      const baseFolderPath = path.normalize(baseFolderResult.rows[0].folder_path);

      for (const folder of folders) {
        const resolvedPath = path.join(baseFolderPath, folder.folder_path);
        try {
          const stat = await fs.stat(resolvedPath);
          if (!stat.isDirectory()) throw new Error(`Path is not a directory: ${resolvedPath}`);
        } catch (err) {
          throw new Error(`Folder does not exist: ${resolvedPath}`);
        }

        const folderFiles = await getFilesRecursively(resolvedPath);
        files.push(...folderFiles.map((absolutePath) => ({ file_path: path.relative(baseFolderPath, absolutePath) })));
      }

      for (const file of files) {
        winston.info(`Processing file: ${file.file_path}, Base Folder: ${baseFolderPath}`);

        const resolvedPath = path.join(baseFolderPath, file.file_path);
        try {
          await fs.access(resolvedPath);
        } catch (err) {
          throw new Error(`File does not exist: ${resolvedPath}`);
        }

        const relativeFilePath = getRelativePath(resolvedPath, baseFolderPath);
        winston.info(`Relative Path: ${relativeFilePath}`);

        const fileSize = (await fs.stat(resolvedPath)).size;
        const fileChecksum = await calculateChecksum(resolvedPath);
        const s3Updation = await uploadFileToS3(resolvedPath);
        const s3Url = s3Updation.Location;
        const s3Version = s3Updation.VersionId;
        const fileName = path.basename(resolvedPath);
        const filePathHash = generatePathHash(resolvedPath);

        let folderId = await getOrCreateFolders(userId, workingDirectoryId, resolvedPath);

        // Check if file exists
        const existingFileQuery = `SELECT file_id, latest_version FROM files WHERE path_hash = $1 AND file_name = $2`;
        const existingFileResult = await client.query(existingFileQuery, [filePathHash, fileName]);

        let fileId, newVersionNumber;

        if (existingFileResult.rowCount > 0) {
          // File exists, check checksum
          fileId = existingFileResult.rows[0].file_id;
          const latestVersion = existingFileResult.rows[0].latest_version;

          const latestVersionQuery = `SELECT checksum FROM versions WHERE file_id = $1 AND version_number = $2`;
          const latestVersionResult = await client.query(latestVersionQuery, [fileId, latestVersion]);

          if (latestVersionResult.rowCount > 0 && latestVersionResult.rows[0].checksum === fileChecksum) {
            winston.info(`Checksum matches for file: ${fileName}, skipping update.`);
            continue;
          }

          newVersionNumber = latestVersion + 1;
          await client.query(`UPDATE files SET latest_version = $1 WHERE file_id = $2`, [newVersionNumber, fileId]);
        } else {
          // File does not exist, create a new file entry
          newVersionNumber = 1;
          const insertFileQuery = `
            INSERT INTO files (file_name, folder_id, path_hash, file_path, latest_version, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING file_id;
          `;
          const insertFileResult = await client.query(insertFileQuery, [
            fileName,
            folderId,
            filePathHash,
            resolvedPath,
            newVersionNumber,
          ]);
          fileId = insertFileResult.rows[0].file_id;
        }

        // Insert new version
        const insertVersionQuery = `
          INSERT INTO versions (file_id, version_number, size_in_bytes, checksum, s3_key, s3_version_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          RETURNING version_id;
        `;
        const insertVersionResult = await client.query(insertVersionQuery, [fileId, newVersionNumber, fileSize, fileChecksum, s3Url, s3Version]);
        const versionId = insertVersionResult.rows[0].version_id;

        // Deactivate previous versions
        await client.query(`UPDATE userFiles SET is_active = FALSE WHERE file_id = $1`, [fileId]);

        // Insert new entry in userFiles
        await client.query(`INSERT INTO userFiles (user_id, file_id, version_id, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())`, [userId, fileId, versionId]);

        uploadedFiles.push({ file_id: fileId, file_path: resolvedPath, s3_url: s3Url, size: fileSize, checksum: fileChecksum });
      }

      await client.query("COMMIT");
      winston.info(`Check-in completed for user ${userId}`);
    } catch (error) {
      await client.query("ROLLBACK");
      winston.error("Error in file check-in worker:", error);
      throw new Error("Worker job failed.");
    } finally {
      client.release();
    }
  },
  { 
    connection: { host: redisHost, port: redisPort }, 
    concurrency: 3, 
  }
);

winston.info("BullMQ worker started for file check-in.");

module.exports = worker;
