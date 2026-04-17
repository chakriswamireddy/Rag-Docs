import { Pinecone } from "@pinecone-database/pinecone";
import { getPineconeIndex } from "@/shared/pinecone";

export const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export const index = getPineconeIndex();
