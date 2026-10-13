'use strict';

// tkt-getTicket — GET /tickets/{ticketId} (JWT authorizer).
// Returns ticket details + activity + attachment download URLs (when S3 is
// configured); owner or Agent, else documented 404.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { getUserFromLambdaEvent } = require('../lib/auth');
const { requireVisibleTicket, withComments, tableFromEnv, defaultGetSigner } = require('../lib/ticketsSingleTable');
const { httpError, toLambdaResponse } = require('../lib/response');

const defaultDb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
);

function buildHandler(db, urlSigner = defaultGetSigner) {
  return async (event) => {
    try {
      const user = getUserFromLambdaEvent(event);
      if (!user) throw httpError(401, 'UNAUTHORIZED', 'Valid authentication is required.');
      const tables = tableFromEnv();
      const meta = await requireVisibleTicket(db, tables, user, event?.pathParameters?.ticketId);
      return toLambdaResponse({ ticket: await withComments(db, tables, meta, urlSigner) }, 200);
    } catch (err) {
      return toLambdaResponse(err);
    }
  };
}

module.exports = { handler: buildHandler(defaultDb), buildHandler };
