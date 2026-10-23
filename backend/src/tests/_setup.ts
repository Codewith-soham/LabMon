// Test bootstrap, loaded via `node --import ./src/tests/_setup.ts` (after the tsx
// loader) before any test file evaluates.
//
// Behaviour:
//  - If `MONGO_URL` is already present in the real process environment when this
//    runs (CI sets it, or a dev exports it), that database is used unchanged.
//  - Otherwise (the usual local case: the value only lives in `backend/.env`),
//    an ephemeral in-memory MongoDB is started and `MONGO_URL` is pointed at it,
//    so `npm test` is hermetic and never touches the shared cluster.
//
// It also loads `backend/.env` here so a statically-imported module (e.g. the
// shared test helpers) can pull in `src/config/env.ts` without each test file
// having to call `dotenv.config()` first.

const hadMongoUrl = Boolean(process.env.MONGO_URL);

await import("dotenv/config");

process.env.NODE_ENV = "test";

if (!hadMongoUrl) {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  // Override whatever backend/.env just set - we want the throwaway server.
  process.env.MONGO_URL = mongod.getUri();

  const stop = (): void => {
    mongod.stop().catch(() => {});
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
