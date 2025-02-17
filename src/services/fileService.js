const fs = require("fs").promises;
const fs_normal = require("fs");
const path = require("path");
const https = require('https');
const checkInQueue = require("../queues/checkInQueue");
const AWS = require("aws-sdk");
const pool = require("../../config/db");
const { StatusCodes } = require("http-status-codes");
const winston = require("winston");
const crypto = require("crypto");

// Function to delete a specific version of a file
const deleteFileVersion = async (fileId, version) => {
  // Mark the specific version as deleted
  const query = `
      UPDATE userFiles uf
      SET is_deleted = TRUE, updated_at = NOW()
      FROM versions v
      WHERE v.file_id = $1
        AND v.version_number = $2
        AND uf.file_id = v.file_id
        AND uf.version_id = v.version_id
        AND v.is_deleted = FALSE
        AND uf.is_active = TRUE
      RETURNING uf.user_file_id;
    `;

  const result = await pool.query(query, [fileId, version]);

  // If the version was not found or already deleted
  if (result.rowCount === 0) {
    throw new Error('Version not found or already deleted.');
  }

  // Return success message
  return { message: 'File version deleted successfully.' };
};

const getAllFilesWithLatestVersion = async (userId) => {
  const query = `
      SELECT 
        f.file_id, 
        f.file_name, 
        f.file_path, 
        f.latest_version, 
        v.size_in_bytes, 
        v.timestamp AS updated_at
      FROM files f
      JOIN versions v ON f.file_id = v.file_id AND v.version_number = f.latest_version
      JOIN userFiles uf ON uf.file_id = f.file_id
      WHERE uf.user_id = $1
        AND uf.is_active = TRUE
        AND uf.is_deleted = FALSE
        AND f.is_active = TRUE
        AND f.is_deleted = FALSE
      ORDER BY f.file_name;
    `;

  const result = await pool.query(query, [userId]);
  return result.rows;
};

async function getFileVersionToDirectory(file_id, version_number, userId) {
  // 1. Get version details from the database
  const versionQuery = `
    SELECT version_id, s3_key, s3_version_id, f.file_path
    FROM versions v
    JOIN files f ON v.file_id = f.file_id
    WHERE v.file_id = $1 AND v.version_number = $2
    LIMIT 1;
  `;
  const versionResult = await pool.query(versionQuery, [file_id, version_number]);

  if (versionResult.rowCount === 0) {
    return { error: "Version not found", status: StatusCodes.NOT_FOUND };
  }

  const { version_id, s3_key, s3_version_id, file_path } = versionResult.rows[0];

  // 2. Construct the S3 download URL
  let downloadUrl = `${s3_key}`;
  if (s3_version_id) downloadUrl += `?versionId=${s3_version_id}`;

  // 3. Ensure the directory exists before writing
  const fileDir = path.dirname(file_path);
  if (!fs_normal.existsSync(fileDir)) fs_normal.mkdirSync(fileDir, { recursive: true });

  // 4. Download and replace the file
  return new Promise((resolve, reject) => {
    const fileStream = fs_normal.createWriteStream(file_path);
    https.get(downloadUrl, (fileRes) => {
      fileRes.pipe(fileStream);

      fileStream.on("finish", async () => {
        fileStream.close();

        // 5. Mark previous versions as inactive
        const updateFileQuery = `
          UPDATE userFiles SET is_active = false
          WHERE user_id = $1 AND file_id = $2 AND version_id != $3;
        `;
        await pool.query(updateFileQuery, [userId, file_id, version_id]);

        // 6. Set the requested version as active
        const setActiveQuery = `
          UPDATE userFiles SET is_active = true
          WHERE user_id = $1 AND file_id = $2 AND version_id = $3;
        `;
        await pool.query(setActiveQuery, [userId, file_id, version_id]);

        resolve({ file_id, version_number, download_url: downloadUrl });
      });

      fileStream.on("error", (err) => {
        console.error("File write error:", err);
        reject({ error: "File write failed", status: StatusCodes.INTERNAL_SERVER_ERROR });
      });
    }).on("error", (err) => {
      console.error("Error downloading file:", err);
      reject({ error: "File download failed", status: StatusCodes.INTERNAL_SERVER_ERROR });
    });
  });
}

// Get version history of a file
async function getFileVersions(file_id, userId) {
  const query = `
    SELECT v.version_id, v.version_number, v.created_at, v.size_in_bytes
    FROM versions v
    JOIN userFiles uf ON v.version_id = uf.version_id
    WHERE uf.user_id = $1 AND v.file_id = $2
    ORDER BY v.version_number ASC;
  `;

  const result = await pool.query(query, [userId, file_id]);

  if (result.rowCount === 0) return { error: "No version history found", status: StatusCodes.NOT_FOUND };

  return result.rows.map((row) => ({
    version_id: row.version_id,
    version: row.version_number,
    timestamp: row.created_at.toISOString(),
    size_in_bytes: row.size_in_bytes,
  }));
}

// Get the latest file version
async function getLatestVersion(file_id, userId) {
  const query = `
    SELECT v.version_number, v.s3_key, v.s3_version_id
    FROM versions v
    JOIN userFiles uf ON v.version_id = uf.version_id
    WHERE uf.user_id = $1 AND v.file_id = $2
    ORDER BY v.version_number DESC
    LIMIT 1;
  `;

  const result = await pool.query(query, [userId, file_id]);

  if (result.rowCount === 0) return { error: "No version found for this file", status: StatusCodes.NOT_FOUND };

  const { version_number, s3_key, s3_version_id } = result.rows[0];

  let downloadUrl = `${s3_key}`;
  if (s3_version_id) downloadUrl += `?versionId=${s3_version_id}`;

  return {
    file_id: parseInt(file_id),
    latest_version: version_number,
    download_url: downloadUrl,
  };
}

const generatePathHash = (filePath) => {
    return crypto.createHash("sha256").update(filePath).digest("hex");
};

const calculateChecksum = async (filePath) => {
  const hash = crypto.createHash("sha256");
  const fileStream = fs_normal.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    fileStream.on('data', (chunk) => {
      hash.update(chunk);
    });

    fileStream.on('end', () => {
      resolve(hash.digest("hex"));
    });

    fileStream.on('error', (err) => {
      reject(new Error(`Error reading file: ${err.message}`));
    });
  });
};

const getRelativePath = (absolutePath, basePath) => {
  return path.relative(basePath, absolutePath).replace(/\\/g, "/"); // Normalize for consistency
};

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const getOrCreateFolders = async (userId, baseFolderId, filePath) => {
  const baseFolderQuery = `SELECT folder_id, folder_path FROM folders WHERE folder_id = $1`;
  const baseFolderResult = await pool.query(baseFolderQuery, [baseFolderId]);

  if (baseFolderResult.rowCount === 0) {
    throw new Error("Invalid working directory ID.");
  }

  let baseFolderPath = path.normalize(baseFolderResult.rows[0].folder_path);
  let fullFolderPath = path.dirname(path.normalize(filePath));
  let parentFolderId = baseFolderId;

  // First, check if the full folder path already exists
  const fullPathHash = generatePathHash(fullFolderPath);
  const existingFolderQuery = `SELECT folder_id FROM folders WHERE path_hash = $1`;
  const existingFolderResult = await pool.query(existingFolderQuery, [fullPathHash]);

  if (existingFolderResult.rowCount > 0) {
    return existingFolderResult.rows[0].folder_id; // Folder already exists, return its ID
  }

  // Split the paths and determine missing folders
  const baseParts = baseFolderPath.split(path.sep).filter(Boolean);
  const fullParts = fullFolderPath.split(path.sep).filter(Boolean);

  let missingFolders = [];
  for (let i = baseParts.length; i < fullParts.length; i++) {
    missingFolders.push(fullParts[i]); // Collect only the missing folders
  }

  let currentPath = baseFolderPath;
  for (const folderName of missingFolders) {
    currentPath = path.join(currentPath, folderName);
    const folderHash = generatePathHash(currentPath);

    // **Check again if folder exists to prevent duplicates**
    const checkFolderQuery = `SELECT folder_id FROM folders WHERE path_hash = $1`;
    const checkFolderResult = await pool.query(checkFolderQuery, [folderHash]);

    if (checkFolderResult.rowCount > 0) {
      parentFolderId = checkFolderResult.rows[0].folder_id; // Use existing folder ID
      continue; // Skip insertion if folder exists
    }

    // Insert only if folder does not exist
    const insertFolderQuery = `
      INSERT INTO folders (user_id, folder_path, parent_folder_id, is_active, is_deleted, folder_name, path_hash, created_at, updated_at)
      VALUES ($1, $2, $3, true, false, $4, $5, NOW(), NOW())
      RETURNING folder_id;
    `;
    const insertFolderResult = await pool.query(insertFolderQuery, [userId, currentPath, parentFolderId, folderName, folderHash]);
    parentFolderId = insertFolderResult.rows[0].folder_id;
  }

  return parentFolderId;
};

// Helper function to recursively collect files from a directory
const getFilesRecursively = async (dir) => {
  let results = [];

  try {
    // Check if directory exists
    await fs.access(dir);

    const files = await fs.readdir(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        // If directory, recursively call the function
        const folderFiles = await getFilesRecursively(filePath);
        results = results.concat(folderFiles);
      } else {
        results.push(filePath); // Store full absolute path
      }
    }
  } catch (err) {
    console.error(`Error accessing directory ${dir}:`, err.message);
  }

  return results;
};

// Function to upload a file to S3
const uploadFileToS3 = async (filePath) => {
  const fileStream = fs_normal.createReadStream(filePath);
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: path.basename(filePath),
    ACL: "public-read",
    Body: fileStream,
  };

  try {
    const uploadResult = await s3.upload(params).promise();
    return uploadResult; // Return S3 URL
  } catch (error) {
    winston.error("Error uploading file to S3", error);
    throw new Error("File upload failed");
  }
};

// const checkInFiles = async (userId, workingDirectoryId, folders, files) => {
//   const client = await pool.connect(); // Get a dedicated client from the client
//   try {
//     let uploadedFiles = [];
//     // Make transaction for folders and files both

//     // Start transaction
//     await client.query("BEGIN");

//     const baseFolderQuery = `SELECT folder_path FROM folders WHERE folder_id = $1 AND user_id = $2 AND is_active = true`;
//     const baseFolderResult = await client.query(baseFolderQuery, [workingDirectoryId, userId]);

//     const baseFolderPath = path.normalize(baseFolderResult.rows[0].folder_path);

//     for (const folder of folders) {
//       const resolvedPath = path.join(baseFolderPath, folder.folder_path);
//       try {
//         // Use fs.stat to confirm if directory exists
//         const stat = await fs.stat(resolvedPath);
//         if (!stat.isDirectory()) {
//           throw new Error(`Path is not a directory: ${resolvedPath}`);
//         }
//       } catch (err) {
//         throw new Error(`Folder does not exist: ${resolvedPath}`);
//       }

//       const folderFiles = await getFilesRecursively(resolvedPath);
//       files.push(
//         ...folderFiles.map((absolutePath) => ({
//           file_path: path.relative(baseFolderPath, absolutePath), // Convert to relative path
//         }))
//       );
//     }

//     for (const file of files) {
//       winston.info(`Processing file: ${file.file_path}, Base Folder: ${baseFolderPath}`);

//       const resolvedPath = path.join(baseFolderPath, file.file_path);
//       try {
//         await fs.access(resolvedPath);
//       } catch (err) {
//         throw new Error(`Folder does not exist: ${resolvedPath}`);
//       }

//       const relativeFilePath = getRelativePath(resolvedPath, baseFolderPath);
//       winston.info(`Relative Path: ${relativeFilePath}`);

//       const fileSize = (await fs.stat(resolvedPath)).size;
//       const fileChecksum = await calculateChecksum(resolvedPath);
//       const s3Updation = await uploadFileToS3(resolvedPath);
//       const s3Url = s3Updation.Location;
//       const s3Version = s3Updation.VersionId;
//       const fileName = path.basename(resolvedPath);
//       const fileDirPath = path.dirname(resolvedPath);
//       const filePathHash = generatePathHash(resolvedPath);
  
//       let folderId = await getOrCreateFolders(userId, workingDirectoryId, resolvedPath);

//       // Check if file exists
//       const existingFileQuery = `SELECT file_id, latest_version FROM files WHERE path_hash = $1 AND file_name = $2`;
//       const existingFileResult = await client.query(existingFileQuery, [filePathHash, fileName]);

//       let fileId, newVersionNumber;

//       if (existingFileResult.rowCount > 0) {
//         // Case 1: File exists, check checksum for the latest version
//         fileId = existingFileResult.rows[0].file_id;
//         const latestVersion = existingFileResult.rows[0].latest_version;

//         // Get the checksum of the latest version
//         const latestVersionQuery = `SELECT checksum FROM versions WHERE file_id = $1 AND version_number = $2`;
//         const latestVersionResult = await client.query(latestVersionQuery, [fileId, latestVersion]);

//         if (latestVersionResult.rowCount > 0) {
//           const storedChecksum = latestVersionResult.rows[0].checksum;
          
//           if (storedChecksum === fileChecksum) {
//             winston.info(`Checksum matches for file: ${fileName}, skipping update.`);
//             continue; // Skip this file
//           }
//         }

//         newVersionNumber = latestVersion + 1;
//         newVersionInDirectory = newVersionNumber;

//         const updateFileQuery = `UPDATE files SET latest_version = $1, version_in_directory = $1 WHERE file_id = $2`;
//         await client.query(updateFileQuery, [newVersionNumber, fileId]);
//       } else {
//         // File does not exist, create a new file entry
//         newVersionNumber = 1;
//         newVersionInDirectory = 1;

//         const insertFileQuery = `
//           INSERT INTO files (file_name, folder_id, path_hash, file_path, latest_version, version_in_directory, created_at, updated_at)
//           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
//           RETURNING file_id;
//         `;
//         const insertFileResult = await client.query(insertFileQuery, [
//           fileName,
//           folderId,
//           filePathHash,
//           resolvedPath, 
//           newVersionNumber,
//           newVersionInDirectory
//         ]);
//         fileId = insertFileResult.rows[0].file_id;
//       }
//       const insertVersionQuery = `
//         INSERT INTO versions (file_id, version_number, size_in_bytes, checksum,  s3_key, s3_version_id, created_at, updated_at)
//         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
//         RETURNING version_id;
//       `;
//       const insertVersionResult = await client.query(insertVersionQuery, [fileId, newVersionNumber, fileSize, fileChecksum, s3Url, s3Version]);
//       const versionId = insertVersionResult.rows[0].version_id;

//       // Step 1: Deactivate previous versions
//       const deactivateOldVersionsQuery = `
//       UPDATE userFiles
//       SET is_active = FALSE
//       WHERE file_id = $1;
//       `;
//       await client.query(deactivateOldVersionsQuery, [fileId]);

//       // Insert new entry in userFiles table
//       const insertUserFileQuery = `
//         INSERT INTO userFiles (user_id, file_id, version_id, created_at, updated_at)
//         VALUES ($1, $2, $3, NOW(), NOW());
//       `;
//       await client.query(insertUserFileQuery, [userId, fileId, versionId]);

//       uploadedFiles.push({ file_id: fileId, file_path: resolvedPath, s3_url: s3Url, size: fileSize, checksum: fileChecksum });
//     }
//     await client.query("COMMIT");
//     return uploadedFiles;
//   } 
//   catch (error) {
//     await client.query("ROLLBACK");
//     winston.error("Error in file check-in:", error);
//     throw new Error("File check-in failed.");
//   }
//   finally {
//     client.release(); 
//   }
// };

const checkInFiles = async (userId, workingDirectoryId, folders, files) => {
  try {
    await checkInQueue.add("check-in-job", { userId, workingDirectoryId, folders, files });
    return { message: "Check-in started, processing in background." };
  } catch (error) {
    winston.error("Error adding job to queue:", error);
    throw new Error("Failed to queue check-in job.");
  }
};

module.exports = { checkInFiles, 
  getFileVersionToDirectory, getFileVersions, getLatestVersion, 
  getAllFilesWithLatestVersion, deleteFileVersion, uploadFileToS3, 
  getRelativePath, generatePathHash, calculateChecksum, getOrCreateFolders, getFilesRecursively };
