export function serverConfig() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_PATH: process.env.ADMIN_PATH,
    AI_PROVIDER_API_KEY: process.env.AI_PROVIDER_API_KEY,
    AA_API_KEY: process.env.AA_API_KEY,
    MAIL_ENCRYPTION_KEY: process.env.MAIL_ENCRYPTION_KEY,
    SMTP_AUTH_CODE: process.env.SMTP_AUTH_CODE,
  };
}
