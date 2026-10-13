'use strict';

// tkt-updateTicket — PUT /tickets/{ticketId} (JWT authorizer, Agent only).
// Updates status/assignee(+priority), appends an activity item with actorId.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { getUserFromLambdaEvent } = require('../lib/auth');
const { updateTicketItem, tableFromEnv } = require('../lib/ticketsSingleTable');
const { httpError, toLambdaResponse, parseJsonBody } = require('../lib/response');

const defaultDb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
);

function buildHandler(db) {
  return async (event) => {
    try {
      const user = getUserFromLambdaEvent(event);
      if (!user) throw httpError(401, 'UNAUTHORIZED', 'Valid authentication is required.');
      const ticket = await updateTicketItem(
        db, tableFromEnv(), user, event?.pathParameters?.ticketId, parseJsonBody(event)
      );
      return toLambdaResponse({ ticket }, 200);
    } catch (err) {
      return toLambdaResponse(err);
    }
  };
}

module.exports = { handler: buildHandler(defaultDb), buildHandler };
