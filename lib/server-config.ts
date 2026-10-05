export function serverConfig() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    TEAMOROUTER_KEY: process.env.TEAMOROUTER_KEY,
    AA_API_KEY: process.env.AA_API_KEY,
  };
}
