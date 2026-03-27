import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { getPool } from "@/lib/db";
import {
  env,
  getAuthCookieSameSite,
  getCorsAllowList,
  hasSecureJwtSecret,
  hasValidDatabaseUrl
} from "@/lib/env";
import { sendSuccess } from "@/lib/response";

export default withMethods(["GET"], async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const databaseConfigured = hasValidDatabaseUrl();
  const jwtConfigured = hasSecureJwtSecret();
  const modelEndpointConfigured = Boolean(env.localModelEndpoint);
  const corsOrigins = getCorsAllowList();

  let databaseReachable = false;
  if (databaseConfigured) {
    try {
      await getPool().query("SELECT 1 AS ok");
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }

  const ok = databaseConfigured && databaseReachable && jwtConfigured && modelEndpointConfigured;

  return sendSuccess(
    res,
    {
      ok,
      service: "flora-backend",
      checks: {
        databaseConfigured,
        databaseReachable,
        jwtConfigured,
        modelEndpointConfigured,
        corsOriginsConfigured: corsOrigins.length > 0
      },
      config: {
        authCookieSameSite: getAuthCookieSameSite(),
        corsOrigins
      }
    },
    ok ? 200 : 503
  );
});
