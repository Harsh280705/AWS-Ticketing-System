'use strict';

/**
 * S3 pre-signed upload validation + key building.
 * Pure functions — no AWS SDK calls here, so unit tests never touch AWS.
 * The live `getSignedUrl` call lives in aws-server.js and is only wired
 * after S3 bucket approval (Stage C).
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB PoC limit
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain'
]);
const FILENAME_RE = /^[A-Za-z0-9._-]{1,180}$/;

function sanitizeFilename(name) {
  if (typeof name !== 'string') return '';
  const base = name.split(/[\\/]/).pop() || '';
  // Keep only safe characters; collapse the rest to underscores.
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
}

function validatePresignedRequest(body = {}) {
  const errors = [];
  const { filename, contentType, fileSize } = body;

  if (typeof filename !== 'string' || filename.trim() === '') {
    errors.push('filename is required.');
  } else {
    const clean = sanitizeFilename(filename.trim());
    if (!FILENAME_RE.test(clean)) errors.push('filename contains unsupported characters.');
  }

  if (typeof contentType !== 'string' || !ALLOWED_MIME.has(contentType)) {
    errors.push(`contentType must be one of: ${[...ALLOWED_MIME].join(', ')}.`);
  }

  if (fileSize !== undefined) {
    if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
      errors.push(`fileSize must be between 1 and ${MAX_FILE_BYTES} bytes.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      filename: typeof filename === 'string' ? sanitizeFilename(filename.trim()) : '',
      contentType,
      fileSize
    }
  };
}

/** Restrict upload keys to the authenticated user's namespace (supplement: attachments/USER_ID/...). */
function buildUploadKey({ userSub, filename, ticketId }) {
  const safeSub = String(userSub || 'unknown').replace(/[^A-Za-z0-9@._-]/g, '_').slice(0, 128);
  const safeFile = sanitizeFilename(filename);
  const uuid = require('crypto').randomUUID();
  const scope = ticketId ? `${String(ticketId).slice(0, 64)}/` : '';
  return `attachments/${safeSub}/${scope}${uuid}-${safeFile}`;
}

/** Strip the `<uuid>-` prefix that buildUploadKey adds, for display. */
function displayNameFromKey(stored) {
  const m = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i.exec(stored);
  return m ? m[1] : stored;
}

module.exports = {
  MAX_FILE_BYTES,
  ALLOWED_MIME,
  validatePresignedRequest,
  sanitizeFilename,
  buildUploadKey,
  displayNameFromKey
};
