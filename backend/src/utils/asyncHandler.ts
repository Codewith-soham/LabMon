// No need to repeat try/catch in every controller: any rejection from the
// wrapped handler is forwarded to Express's error middleware via next(err).

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";

type AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction,
) => Promise<unknown>;

const asyncHandler = <P = ParamsDictionary, ResBody = unknown, ReqBody = unknown, ReqQuery = Query>(
  requestHandler: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err: unknown) => {
      next(err);
    });
  };
};

export { asyncHandler };
