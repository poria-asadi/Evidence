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
    LOCAL_DEV_AUTH?: string;
    LOCAL_DEV_USER_ID?: string;
    LOCAL_DEV_USER_EMAIL?: string;
  }
}
