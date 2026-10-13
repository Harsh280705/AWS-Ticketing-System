'use strict';

// tkt-addComment — POST /tickets/{ticketId}/comments (JWT authorizer).
// Owner or Agent (else documented 404); authorId/authorRole from claims.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { getUserFromLambdaEvent } = require('../lib/auth');
const { addCommentItem, tableFromEnv } = require('../lib/ticketsSingleTable');
const { httpError, toLambdaResponse, parseJsonBody } = require('../lib/response');

const defaultDb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
);

function buildHandler(db) {
  return async (event) => {
    try {
      const user = getUserFromLambdaEvent(event);
      if (!user) throw httpError(401, 'UNAUTHORIZED', 'Valid authentication is required.');
      const comment = await addCommentItem(
        db, tableFromEnv(), user, event?.pathParameters?.ticketId, parseJsonBody(event)
      );
      return toLambdaResponse({ comment }, 201);
    } catch (err) {
      return toLambdaResponse(err);
    }
  };
}

module.exports = { handler: buildHandler(defaultDb), buildHandler };
