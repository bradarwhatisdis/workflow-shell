'use strict';

/**
 * Upload middleware for Workflow Shell.
 *
 * Extracted from server.js (lines 390–399).
 * Requires multer and sanitizeFilename (from services/files.js).
 *
 * @param {Function} getSafePath - resolves safe paths (from server.js or config)
 * @returns {Function} multer middleware configured for single file uploads
 */

const multer = require('multer');
const fs = require('fs');
const { sanitizeFilename } = require('../services/files');

module.exports = function createUploadMiddleware(getSafePath) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = getSafePath(req.body.path || '/') || process.env.WORKSPACE_DIR || '/home/runner/work';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
    }),
  }).single('file');
};
