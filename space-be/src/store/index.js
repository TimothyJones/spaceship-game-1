// Pick the store from the environment: Lambda sets GAME_TABLE and gets
// DynamoDB; local development gets the in-memory store. The dynamo module is
// imported lazily so local dev doesn't need the AWS SDK installed.
let storePromise = null;

export function getStore() {
  if (!storePromise) {
    storePromise = process.env.GAME_TABLE
      ? import("./dynamo.js").then((m) =>
          m.createDynamoStore(process.env.GAME_TABLE),
        )
      : import("./memory.js").then((m) => m.createMemoryStore());
  }
  return storePromise;
}
