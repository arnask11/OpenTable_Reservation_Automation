import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get browserbaseApiKey() {
    return required('BROWSERBASE_API_KEY');
  },
  get browserbaseProjectId() {
    return required('BROWSERBASE_PROJECT_ID');
  },
  get port() {
    return Number(process.env.PORT ?? 3000);
  },
  get nodeEnv() {
    return process.env.NODE_ENV ?? 'development';
  },
  /** When true (default), Vapi make_reservation never submits a real booking. */
  get vapiDryRun() {
    return process.env.VAPI_DRY_RUN !== 'false';
  },
};
