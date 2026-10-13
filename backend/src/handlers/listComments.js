'use strict';

// tkt-listComments — GET /tickets/{ticketId}/comments (JWT authorizer).
// Owner or Agent (else documented 404); oldest first via Query ScanIndexForward.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { getUserFromLambdaEvent } = require('../lib/auth');
const { requireVisibleTicket, listCommentItems, tableFromEnv, ticketIdFromPk } = require('../lib/ticketsSingleTable');
const { httpError, toLambdaResponse } = require('../lib/response');

const defaultDb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
);

function buildHandler(db) {
  return async (event) => {
    try {
      const user = getUserFromLambdaEvent(event);
      if (!user) throw httpError(401, 'UNAUTHORIZED', 'Valid authentication is required.');
      const tables = tableFromEnv();
      const meta = await requireVisibleTicket(db, tables, user, event?.pathParameters?.ticketId);
      const comments = await listCommentItems(db, tables, ticketIdFromPk(meta.pk));
      return toLambdaResponse({ comments }, 200);
    } catch (err) {
      return toLambdaResponse(err);
    }
  };
}

module.exports = { handler: buildHandler(defaultDb), buildHandler };
