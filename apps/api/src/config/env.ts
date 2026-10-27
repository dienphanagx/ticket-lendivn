import * as z from 'zod';

export const AppEnv = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;

export type AppEnv = (typeof AppEnv)[keyof typeof AppEnv];

const POSTGRES_PROTOCOL = /^postgres(ql)?$/;

const envSchema = z.object({
  APP_ENV: z.enum([AppEnv.DEVELOPMENT, AppEnv.STAGING, AppEnv.PRODUCTION]),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL }),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Parse env lúc bootstrap; thiếu hoặc sai → throw (fail fast, rule `policy-code` § Environment). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Chỉ in tên biến + lý do, không in giá trị (có thể chứa secret)
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment: ${issues.join('; ')}`);
  }
  return result.data;
}
