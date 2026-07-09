import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { GameError } from "../game.js";

// DynamoDB-backed store for Lambda. One item per game, keyed by id, with the
// same optimistic-concurrency contract as the memory store. Items expire a
// day after their last write via the table's TTL attribute.
const GAME_TTL_SECONDS = 24 * 60 * 60;

export function createDynamoStore(tableName) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return {
    async get(id) {
      const { Item } = await client.send(
        new GetCommand({ TableName: tableName, Key: { id } }),
      );
      return Item ?? null;
    },

    async put(game, expectedVersion) {
      const saved = {
        ...game,
        version: expectedVersion === null ? 1 : expectedVersion + 1,
        expiresAt: Math.floor(Date.now() / 1000) + GAME_TTL_SECONDS,
      };
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: saved,
            ...(expectedVersion === null
              ? { ConditionExpression: "attribute_not_exists(id)" }
              : {
                  ConditionExpression: "version = :expected",
                  ExpressionAttributeValues: { ":expected": expectedVersion },
                }),
          }),
        );
      } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
          throw new GameError(409, "game was modified concurrently");
        }
        throw err;
      }
      return saved;
    },
  };
}
