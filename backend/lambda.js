
const serverless = require('serverless-http');
const app = require('./aws-server');

module.exports.handler = serverless(app);
