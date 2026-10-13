'use strict';

/**
 * Shared HTTP response helpers (Express-compatible, no dependencies).
 * Keeps error shape consistent between server.js and aws-server.js.
 */

function errorBody(code, message) {
  return { error: { code, message } };
}

function sendError(res, status, code, message) {
  return res.status(status).json(errorBody(code, message));
}

function sendOk(res, status, payload) {
  return res.status(status).json(payload);
}

/**
 * Coded error for the standalone tkt-* Lambda handlers (HTTP API v2 proxy).
 * Throw via `throw httpError(404, 'NOT_FOUND', 'Ticket not found.')`.
 */
function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function statusOf(err) {
  return Number.isInteger(err?.status) ? err.status : 500;
}

function codeOf(err) {
  return typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR';
}

/** Never leak stacks or internals: 500s collapse to a generic message. */
function toLambdaResponse(errOrBody, status = 200) {
  if (errOrBody instanceof Error || (errOrBody && errOrBody.status)) {
    const statusCode = statusOf(errOrBody);
    const body =
      statusCode === 500
        ? errorBody('INTERNAL_ERROR', 'An unexpected server error occurred.')
        : errorBody(codeOf(errOrBody), errOrBody.message);
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(errOrBody)
  };
}

/** Parse a Lambda proxy JSON body; invalid JSON is a 400, never a 500. */
function parseJsonBody(event) {
  if (!event?.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw httpError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
}

module.exports = { errorBody, sendError, sendOk, httpError, toLambdaResponse, parseJsonBody };
