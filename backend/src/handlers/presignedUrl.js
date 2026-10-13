'use strict';

// tkt-presignedUrl — POST /tickets/presigned-url (JWT authorizer).
// Validates filename/MIME/size, returns a short-lived PUT URL for a
// user-scoped key attachments/<userSub>/…. 501 until ATTACHMENTS_BUCKET is
// configured (Stage C approval); signing runs only with a bucket set.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getUserFromLambdaEvent } = require('../lib/auth');
const { planPresignedUpload } = require('../lib/ticketsSingleTable');
const { httpError, toLambdaResponse, parseJsonBody } = require('../lib/response');

const UPLOAD_EXPIRY_SECONDS = 300;

const defaultDb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
);

async function defaultSigner({ bucket, key, contentType }) {
  const client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_EXPIRY_SECONDS }
  );
}

function buildHandler(db, signer = defaultSigner) {
  return async (event) => {
    try {
      const user = getUserFromLambdaEvent(event);
      if (!user) throw httpError(401, 'UNAUTHORIZED', 'Valid authentication is required.');
      const plan = planPresignedUpload(user, parseJsonBody(event));
      // Deployment contract names: BUCKET_NAME (ATTACHMENTS_BUCKET accepted).
      const bucket = process.env.BUCKET_NAME || process.env.ATTACHMENTS_BUCKET;
      if (!bucket) {
        throw httpError(501, 'AWS_NOT_CONFIGURED', 'S3 uploads have not been configured yet.');
      }
      const uploadUrl = await signer({ bucket, key: plan.key, contentType: plan.contentType });
      return toLambdaResponse({ uploadUrl, key: plan.key, expiresIn: UPLOAD_EXPIRY_SECONDS }, 200);
    } catch (err) {
      return toLambdaResponse(err);
    }
  };
}

module.exports = { handler: buildHandler(defaultDb), buildHandler, UPLOAD_EXPIRY_SECONDS };
