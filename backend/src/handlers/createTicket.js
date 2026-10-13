'use strict';

// tkt-createTicket — POST /tickets (JWT authorizer, any signed-in user).
// Creates a ticket with status Open; createdBy comes from verified claims.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { getUserFromLambdaEvent } = require('../lib/auth');
const { createTicketItem, tableFromEnv } = require('../lib/ticketsSingleTable');
const { httpError, toLambdaResponse, parseJsonBody } = require('../lib/response');

const defaultDb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
);

function buildHandler(db) {
  return async (event) => {
    try {
      const user = getUserFromLambdaEvent(event);
      if (!user) throw httpError(401, 'UNAUTHORIZED', 'Valid authentication is required.');
      const ticket = await createTicketItem(db, tableFromEnv(), user, parseJsonBody(event));
      return toLambdaResponse({ ticket }, 201);
    } catch (err) {
      return toLambdaResponse(err);
    }
  };
}

module.exports = { handler: buildHandler(defaultDb), buildHandler };
