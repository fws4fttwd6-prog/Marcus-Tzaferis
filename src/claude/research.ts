import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { getClient, modelId, ResearchError, USER_LOCATION } from "./client.js";

/**
 * Research runs in two passes.
 *
 * Pass one turns Claude loose on the web with the search tool and lets it
 * write up what it found in prose. Pass two reads that write-up back and
 * extracts it into a strict schema. Splitting them keeps the schema strict
 * (no tool blocks to interleave), makes `pause_turn` easy to resume, and means
 * a malformed extraction can be retried without paying for the search again.
 */

export interface ResearchOutput {
  text: string;
  sources: Array<{ title: string; url: string }>;
  searchCount: number;
  model: string;
}

const MAX_PAUSE_RESUMES = 4;

export async function runResearch(args: {
  system: string;
  prompt: string;
  maxSearches?: number;
  maxFetches?: number;
  allowedDomains?: string[];
  effort?: "low" | "medium" | "high" | "xhigh";
  signal?: AbortSignal;
}): Promise<ResearchOutput> {
  const client = getClient();
  const model = modelId();

  const webSearch: Record<string, unknown> = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: args.maxSearches ?? 14,
    user_location: USER_LOCATION,
  };
  if (args.allowedDomains?.length) webSearch.allowed_domains = args.allowedDomains;

  /**
   * Search results alone are not enough for retail.
   *
   * A search index returns whatever it cached, which for the LCBO means old
   * vintage pages and years-old Vintages release PDFs — complete with prices
   * for wine that left the shelves long ago. Fetching the page reads what it
   * says now, including whether the bottle is actually in stock. Fetch is
   * limited to URLs already in the conversation, so search finds the page and
   * this reads it.
   */
  const webFetch: Record<string, unknown> = {
    type: "web_fetch_20260209",
    name: "web_fetch",
    max_uses: args.maxFetches ?? 10,
    citations: { enabled: true },
    max_content_tokens: 20000,
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: args.prompt }];
  const collected: Anthropic.ContentBlock[] = [];
  let searchCount = 0;

  for (let attempt = 0; attempt <= MAX_PAUSE_RESUMES; attempt++) {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 32000,
        system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
        output_config: { effort: args.effort ?? "high" },
        tools: [
          webSearch as unknown as Anthropic.ToolUnion,
          webFetch as unknown as Anthropic.ToolUnion,
        ],
        messages,
      },
      args.signal ? { signal: args.signal } : undefined,
    );

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new ResearchError(
        "The model declined this request.",
        message.stop_details?.explanation ?? undefined,
      );
    }

    for (const block of message.content) {
      collected.push(block);
      if (block.type === "server_tool_use") searchCount++;
    }

    if (message.stop_reason === "pause_turn") {
      // A long search turn was suspended. Hand the partial turn back to continue it.
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    break;
  }

  const text = collected
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new ResearchError("The research pass came back empty.");
  }

  return { text, sources: collectSources(collected), searchCount, model };
}

/** Pull citation URLs out of the web-search result blocks. */
function collectSources(blocks: Anthropic.ContentBlock[]): Array<{ title: string; url: string }> {
  const seen = new Map<string, string>();
  for (const block of blocks) {
    if (block.type !== "web_search_tool_result") continue;
    // A successful result carries a list; an error carries a single object.
    const content = (block as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      const r = item as { url?: unknown; title?: unknown };
      if (typeof r.url === "string" && r.url && !seen.has(r.url)) {
        seen.set(r.url, typeof r.title === "string" && r.title ? r.title : hostOf(r.url));
      }
    }
    }
  return [...seen.entries()].map(([url, title]) => ({ title, url }));
}

/**
 * Pass two: read the research prose back into a schema. No tools, low effort,
 * one retry with the validation error fed back in.
 */
export async function extract<T extends z.ZodType>(args: {
  schema: T;
  system: string;
  research: string;
  instruction: string;
  signal?: AbortSignal;
}): Promise<z.infer<T>> {
  const client = getClient();
  const model = modelId();

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const correction = lastError
      ? `\n\nYour previous attempt failed validation with: ${lastError}\nFix it and return valid output.`
      : "";

    const response = await client.messages.parse(
      {
        model,
        max_tokens: 16000,
        system: args.system,
        output_config: { effort: "low", format: zodOutputFormat(args.schema) },
        messages: [
          {
            role: "user",
            content: `${args.instruction}\n\n--- RESEARCH NOTES ---\n${args.research}${correction}`,
          },
        ],
      },
      args.signal ? { signal: args.signal } : undefined,
    );

    if (response.stop_reason === "refusal") {
      throw new ResearchError("The model declined to structure these results.");
    }
    if (response.parsed_output) return response.parsed_output as z.infer<T>;
    lastError = "the response did not match the required schema";
  }

  throw new ResearchError("Could not turn the research into structured results.");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
