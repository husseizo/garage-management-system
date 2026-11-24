import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "../logger";
import { toPublicError } from "./to-response";

type Handler<Ctx> = (request: Request, ctx: Ctx) => Promise<Response>;

/**
 * Wrap a Route Handler with centralised error handling: every failure is logged with a request
 * id, and the client receives only the safe public error shape plus that id for support.
 */
export function withErrorHandling<Ctx>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, ctx) => {
    const requestId = randomUUID();
    try {
      return await handler(request, ctx);
    } catch (error) {
      const { status, body } = toPublicError(error);
      const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
      log(
        {
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          status,
          err: error,
        },
        "route handler failed",
      );
      body.error.requestId = requestId;
      return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
    }
  };
}
