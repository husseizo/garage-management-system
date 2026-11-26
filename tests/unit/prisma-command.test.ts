import { describe, expect, it } from "vitest";

import { classifyPrismaCommand } from "@/server/db/prisma-command";

const cli = (...args: string[]) => ["/usr/bin/node", "/app/node_modules/.bin/prisma", ...args];

describe("classifyPrismaCommand", () => {
  it.each([
    ["generate"],
    ["validate", "--config", "./prisma.config.ts"],
    ["format"],
    ["migrate", "status"],
    ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma"],
    ["db", "pull"],
    ["--version"],
    ["-v"],
    [],
  ])("treats %j as read-only", (...args) => {
    expect(classifyPrismaCommand(cli(...args)).kind).toBe("read");
  });

  it.each([
    [["migrate", "deploy"], "migrate-deploy"],
    [["migrate", "resolve", "--applied", "x"], "migrate-deploy"],
    [["migrate", "dev", "--name", "deploy"], "migrate-dev"],
    [["--schema", "prisma/schema.prisma", "migrate", "deploy"], "migrate-deploy"],
    [["db", "execute", "--file", "x.sql"], "migrate-dev"],
    [["studio"], "migrate-dev"],
  ])("treats %j as a write needing %s", (args, action) => {
    expect(classifyPrismaCommand(cli(...args))).toMatchObject({ kind: "write", action });
  });

  it.each([
    ["migrate", "reset", "--force"],
    ["db", "push", "--accept-data-loss"],
    ["db", "seed"],
  ])("always refuses %j", (...args) => {
    expect(classifyPrismaCommand(cli(...args)).kind).toBe("forbidden");
  });

  it.each([["migrate"], ["db"], ["migrate", "something-new"], ["mcp"], ["dev"]])(
    "fails closed on unknown command %j (write, most restrictive action)",
    (...args) => {
      expect(classifyPrismaCommand(cli(...args))).toMatchObject({
        kind: "write",
        action: "migrate-dev",
      });
    },
  );

  it("does not take an option value for a subcommand", () => {
    expect(classifyPrismaCommand(cli("--config", "migrate", "generate")).kind).toBe("read");
  });

  it("recognises the CLI entry point however it is invoked", () => {
    expect(
      classifyPrismaCommand(["node", "/x/node_modules/prisma/build/index.js", "migrate", "deploy"])
        .kind,
    ).toBe("write");
    expect(
      classifyPrismaCommand(["node", "C:\\x\\node_modules\\.bin\\prisma", "db", "push"]).kind,
    ).toBe("forbidden");
  });

  it("gives non-CLI loaders (e.g. an editor language server) no database access", () => {
    expect(classifyPrismaCommand(["node", "/ext/language-server.js", "--stdio"]).kind).toBe(
      "not-cli",
    );
    expect(classifyPrismaCommand([]).kind).toBe("not-cli");
  });
});
