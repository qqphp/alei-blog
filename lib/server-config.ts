export function serverConfig() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    AI_PROVIDER_API_KEY: process.env.AI_PROVIDER_API_KEY,
    AA_API_KEY: process.env.AA_API_KEY,
  };
}
