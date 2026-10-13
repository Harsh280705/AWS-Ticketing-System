'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validatePresignedRequest,
  sanitizeFilename,
  buildUploadKey,
  displayNameFromKey,
  MAX_FILE_BYTES
} = require('../src/lib/uploads');

describe('pre-signed URL validation logic (no live S3)', () => {
  it('accepts a valid image request', () => {
    const r = validatePresignedRequest({ filename: 'screenshot.png', contentType: 'image/png', fileSize: 1024 });
    assert.equal(r.valid, true);
    assert.equal(r.value.filename, 'screenshot.png');
  });

  it('rejects missing filename, bad MIME, oversize/zero size', () => {
    assert.equal(validatePresignedRequest({ contentType: 'image/png' }).valid, false);
    assert.equal(validatePresignedRequest({ filename: 'x.png', contentType: 'application/x-msdownload' }).valid, false);
    assert.equal(validatePresignedRequest({ filename: 'x.png', contentType: 'image/png', fileSize: 0 }).valid, false);
    assert.equal(
      validatePresignedRequest({ filename: 'x.png', contentType: 'image/png', fileSize: MAX_FILE_BYTES + 1 }).valid,
      false
    );
  });

  it('sanitizes path traversal and namespaces keys to the user', () => {
    assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
    const key = buildUploadKey({ userSub: 'user-123', filename: 'a.png' });
    assert.match(key, /^attachments\/user-123\//);
    assert.match(key, /a\.png$/);
  });

  it('strips the uuid prefix for display names', () => {
    assert.equal(displayNameFromKey('a356676d-5643-4ea1-926d-44a6e4368c83-shot.png'), 'shot.png');
    assert.equal(displayNameFromKey('plain.png'), 'plain.png');
  });

  it('produces unique keys per call so uploads never collide', () => {
    const key = buildUploadKey({ userSub: 'user-123', filename: 'a.png' });
    const key2 = buildUploadKey({ userSub: 'user-123', filename: 'a.png' });
    assert.notEqual(key, key2);
  });
});
