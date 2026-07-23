import "dotenv/config";

export const config = {
  baseUrl: process.env.OUPS_BASE_URL ?? "https://oh811.centerlogix.org",
  center: process.env.OUPS_CENTER ?? "oups",
  email: process.env.OUPS_EMAIL ?? "",
  password: process.env.OUPS_PASSWORD ?? "",
  memberCode: process.env.OUPS_MEMBER_CODE ?? "",
  port: Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 8811),
};

export function requireCredentials(): void {
  const missing: string[] = [];
  if (!config.email) missing.push("OUPS_EMAIL");
  if (!config.password) missing.push("OUPS_PASSWORD");
  if (missing.length) {
    throw new Error(`Missing required .env values: ${missing.join(", ")}`);
  }
}
