const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
const EMBED_BATCH = 50;
const EMBED_CONCURRENCY = 3;

type EmbeddingResponse = {
  success: boolean;
  errors: { message: string }[];
  result: {
    data: number[][];
  };
};

type WorkerEmbeddingResponse = {
  data: number[][];
};

function getWorkerEmbeddingUrl(): string | null {
  const workerUrl = process.env.CF_WORKER_URL;
  if (!workerUrl) {
    return null;
  }

  const url = new URL(workerUrl);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return new URL("embed", url).toString();
}

async function embedViaWorker(text: string[]) {
  const workerUrl = getWorkerEmbeddingUrl();
  const workerSecret = process.env.CF_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new Error("CF_WORKER_URL and CF_WORKER_SECRET are required for worker embeddings");
  }

  const res = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": workerSecret,
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Worker embedding request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as WorkerEmbeddingResponse;
  if (!Array.isArray(data.data)) {
    throw new Error("Worker embedding response was malformed");
  }

  return data.data;
}

async function embedViaCloudflareApi(text: string[]) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("CF_ACCOUNT_ID and CF_API_TOKEN are required");
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!res.ok) {
    throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  if (!data.success) {
    throw new Error(data.errors.map((x) => x.message).join(", "));
  }

  return data.result.data;
}

async function embedBatch(text: string[]) {
  const failures: string[] = [];

  if (process.env.CF_WORKER_URL && process.env.CF_WORKER_SECRET) {
    try {
      return await embedViaWorker(text);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    return await embedViaCloudflareApi(text);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  throw new Error(`All embedding providers failed: ${failures.join(" | ")}`);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    batches.push(texts.slice(i, i + EMBED_BATCH));
  }

  const vectors: number[][] = new Array(texts.length);
  for (let i = 0; i < batches.length; i += EMBED_CONCURRENCY) {
    const group = batches.slice(i, i + EMBED_CONCURRENCY);
    const groupVectors = await Promise.all(group.map((batch) => embedBatch(batch)));

    for (let j = 0; j < groupVectors.length; j++) {
      const base = (i + j) * EMBED_BATCH;
      const batchVectors = groupVectors[j];
      for (let k = 0; k < batchVectors.length; k++) {
        vectors[base + k] = batchVectors[k];
      }
    }
  }

  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
