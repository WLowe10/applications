import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DB_URL: z.string(),
    OPENAI_API_KEY: z.string(),
    PINECONE_API_KEY: z.string(),
    MODE: z.string(),
    COOKD_API_KEY: z.string(),
    COOKD_RESUME_SCREENER_ID: z.string(),
    COOKD_SLUG_ID: z.string(),
    GITHUB_TOKEN: z.string(),
    SCRAPIN_API_KEY: z.string(),
    WHOP_API_KEY: z.string(),
    WHOP_COOKIE: z.string(),
    GITHUB_QUEUE_URL: z.string(),
    LINKEDIN_QUEUE_URL: z.string(),
    TOKEN_GITHUB: z.string(),
  },
  client: {
    NEXT_PUBLIC_WHOP_APP_ID: z.string(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DB_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    PINECONE_API_KEY: process.env.PINECONE_API_KEY,
    NEXT_PUBLIC_WHOP_APP_ID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
    MODE: process.env.MODE,
    COOKD_API_KEY: process.env.COOKD_API_KEY,
    COOKD_RESUME_SCREENER_ID: process.env.COOKD_RESUME_SCREENER_ID,
    COOKD_SLUG_ID: process.env.COOKD_SLUG_ID,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    SCRAPIN_API_KEY: process.env.SCRAPIN_API_KEY,
    WHOP_API_KEY: process.env.WHOP_API_KEY,
    WHOP_COOKIE: process.env.WHOP_COOKIE,
    GITHUB_QUEUE_URL: process.env.GITHUB_QUEUE_URL,
    LINKEDIN_QUEUE_URL: process.env.LINKEDIN_QUEUE_URL,
    TOKEN_GITHUB: process.env.TOKEN_GITHUB,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
