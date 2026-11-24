import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError } from "@/server/errors/app-error";
import { toPublicError } from "@/server/errors/to-response";
import { createLogger } from "@/server/logger";
import { parseInput } from "@/server/validation";

describe("toPublicError", () => {
  it("maps AppError to its status and public message", () => {
    const { status, body } = toPublicError(
      new AppError("FORBIDDEN", "Not allowed", { cause: "secret" }),
    );
    expect(status).toBe(403);
    expect(body.error).toEqual({ code: "FORBIDDEN", message: "Not allowed", details: undefined });
  });

  it("hides internal error details", () => {
    const { status, body } = toPublicError(
      new Error("connect ECONNREFUSED postgresql://admin:hunter2@db.internal/gms"),
    );
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/hunter2|postgresql|ECONNREFUSED/);
  });
});

describe("parseInput", () => {
  const schema = z.object({ registration: z.string().min(2) });

  it("returns parsed data", () => {
    expect(parseInput(schema, { registration: "AB12CDE" })).toEqual({ registration: "AB12CDE" });
  });

  it("throws a VALIDATION_FAILED AppError with field details", () => {
    try {
      parseInput(schema, { registration: "" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION_FAILED");
      expect((error as AppError).details).toHaveProperty("registration");
    }
  });
});

describe("logger redaction", () => {
  it("redacts credentials and personal data", () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = createLogger({ level: "info", destination });
    log.info(
      {
        password: "p@ss",
        user: { email: "a@b.test", phone: "0700" },
        req: { headers: { cookie: "s=1" } },
      },
      "test",
    );
    const out = lines.join("");
    expect(out).not.toMatch(/p@ss|a@b\.test|0700|s=1/);
    expect(out).toContain("[REDACTED]");
  });
});
