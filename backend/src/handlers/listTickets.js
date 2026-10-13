'use strict';

// tkt-listTickets — GET /tickets?status=&priority=&q= (JWT authorizer).
// Agents see all tickets; customers see only their own.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { getUserFromLambdaEvent } = require('../lib/auth');
const { listTicketItems, tableFromEnv, defaultGetSigner } = require('../lib/ticketsSingleTable');
const { httpError, toLambdaResponse } = require('../lib/response');

const defaultDb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
);

function buildHandler(db, urlSigner = defaultGetSigner) {
  return async (event) => {
    try {
      const user = getUserFromLambdaEvent(event);
      if (!user) throw httpError(401, 'UNAUTHORIZED', 'Valid authentication is required.');
      const result = await listTicketItems(db, tableFromEnv(), user, event?.queryStringParameters || {}, urlSigner);
      return toLambdaResponse(result, 200);
    } catch (err) {
      return toLambdaResponse(err);
    }
  };
}

module.exports = { handler: buildHandler(defaultDb), buildHandler };
