/**
 * CI pre-flight (ADR 0017, G-3): the database job may only run against the pinned Neon `ci-testing`
 * branch. Verifies both connection strings (exact endpoint allow-list) and the branch id each one
 * reports from the server. Fails closed. Prints identifiers only — never connection strings.
 */
import { describeTarget, verifyCiTarget } from "../src/server/db/identity";

verifyCiTarget("migrate-deploy", process.env)
  .then((v) => console.log(`verify-ci-target: OK — ${describeTarget(v)}`))
  .catch((error) => {
    console.error(`verify-ci-target: ${error instanceof Error ? error.message : "failed"}`);
    process.exit(1);
  });
