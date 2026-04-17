/**
 * Pre-downloads the Xenova/all-MiniLM-L6-v2 model to data/models/
 * so the API route never has to fetch it from HuggingFace at request time.
 *
 * Run once: npm run download-model
 */

import { env, pipeline } from "@xenova/transformers";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, "..", "data", "models");

env.cacheDir = cacheDir;
console.log(`Downloading model to: ${cacheDir}`);

const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);

// Run a dummy inference to ensure all model weights are cached
await extractor("warmup", { pooling: "mean", normalize: true });

console.log("Model downloaded and cached successfully.");
