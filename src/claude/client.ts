import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5";

export function modelId(): string {
  return process.env.CELLAR_SCOUT_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * True when we have no way to reach the API. The app still runs — it falls
 * back to bundled sample data and says so loudly — but nothing is live.
 */
export function isDemoMode(): boolean {
  if (process.env.CELLAR_SCOUT_DEMO === "1") return true;
  return !(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;

/**
 * The SDK resolves credentials itself: ANTHROPIC_API_KEY, then
 * ANTHROPIC_AUTH_TOKEN, then an `ant auth login` profile.
 */
export function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  return client;
}

/** Toronto, so web search results are localised to where the wine has to land. */
export const USER_LOCATION = {
  type: "approximate" as const,
  city: "Toronto",
  region: "Ontario",
  country: "CA",
  timezone: "America/Toronto",
};

export class ResearchError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}
