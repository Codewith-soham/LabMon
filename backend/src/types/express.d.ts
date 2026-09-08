import type { AuthTokenPayload } from "./auth.js";
import type { MongoFilter } from "./mongo.js";

// Request augmentations for values attached by middleware:
//   - `user`  is set by the `auth` middleware from a verified access token
//   - `scope` is set by the `deptScope` middleware (department-scoped Mongo
//     filter); currently only used on the /pc routes it is mounted on
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      scope?: MongoFilter;
    }
  }
}

export {};
