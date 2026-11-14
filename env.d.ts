declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_BASE_URL?: string;
    OPENROUTER_GEMINI_MODEL?: string;
    OPENROUTER_GPT_MODEL?: string;
    OPENROUTER_ZEOUS_MODEL?: string;
    OPENROUTER_ADJUDICATOR_MODEL?: string;
    OPENROUTER_FULLTEXT_ADJUDICATOR_MODEL?: string;
    APP_PUBLIC_URL?: string;
    RESEND_API_KEY?: string;
    VERIFICATION_EMAIL_FROM?: string;
    AUTH_CODE_SECRET?: string;
    NETARZ_FX_API_KEY?: string;
  }
}
