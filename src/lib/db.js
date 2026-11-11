// El runtime nodejs20.x de Lambda ya incluye AWS SDK v3
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(client);

module.exports = { doc, USERS_TABLE: process.env.USERS_TABLE };
