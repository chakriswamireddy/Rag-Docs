/**
 * Embedder using the Cloudflare Workers AI binding.
 *
 * Model: @cf/baai/bge-small-en-v1.5 (384 dimensions)
 * Bound via the `AI` binding in wrangler.toml — no extra HTTP call needed.
 */

import type { Env } from "./index";

interface AiEmbeddingResult {
  shape: [number, number];
  data: number[][];
}

/**
 * Embed a batch of texts.
 * Workers AI supports up to 50 strings per request for this model.
 */
export async function embedTexts(texts: string[], env: Env): Promise<number[][]> {
  const result = (await env.AI.run("@cf/baai/bge-small-en-v1.5", {
    text: texts,
  })) as AiEmbeddingResult;

  return result.data;
}
