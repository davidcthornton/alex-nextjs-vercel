import OpenAI from "openai";
import { CloudClient } from "chromadb";

const EMBEDDING_MODEL = "text-embedding-3-small";

export type RetrievedChunk = {
  text: string;
  source: string | null;
  chunkNumber: number | null;
  distance: number | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function retrieveKnowledge(
  question: string,
  nResults = 3
): Promise<RetrievedChunk[]> {
  // ---------------------------------------------------------
  // 1. Create OpenAI client
  // ---------------------------------------------------------

  const openai = new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
  });

  // ---------------------------------------------------------
  // 2. Embed the question
  // ---------------------------------------------------------

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: question,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;

  // ---------------------------------------------------------
  // 3. Connect to Chroma Cloud
  // ---------------------------------------------------------

  const chroma = new CloudClient({
    apiKey: requireEnv("CHROMA_API_KEY"),
    tenant: requireEnv("CHROMA_TENANT"),
    database: requireEnv("CHROMA_DATABASE"),
  });

  // ---------------------------------------------------------
  // 4. Get the existing ALEX collection
  // ---------------------------------------------------------

  const collection = await chroma.getCollection({
    name:
      process.env.CHROMA_COLLECTION ??
      "document_qa_collection",
  });

  // ---------------------------------------------------------
  // 5. Search using our OpenAI embedding
  // ---------------------------------------------------------

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults,
    include: [
      "documents",
      "metadatas",
      "distances",
    ],
  });

  // Chroma returns results grouped by query.
  // We submitted one query, so use [0].
  const documents = results.documents?.[0] ?? [];
  const metadatas = results.metadatas?.[0] ?? [];
  const distances = results.distances?.[0] ?? [];

  const chunks: RetrievedChunk[] = [];

  for (let i = 0; i < documents.length; i++) {
    const document = documents[i];

    if (!document) {
      continue;
    }

    const metadata = metadatas[i];

    chunks.push({
      text: document,

      source:
        metadata &&
        typeof metadata.source === "string"
          ? metadata.source
          : null,

      chunkNumber:
        metadata &&
        typeof metadata.chunk_number === "number"
          ? metadata.chunk_number
          : null,

      distance:
        typeof distances[i] === "number"
          ? distances[i]
          : null,
    });
  }

  return chunks;
}


export function formatKnowledgeContext(
  chunks: RetrievedChunk[]
): string {
  if (chunks.length === 0) {
    return "No relevant knowledge-base chunks were retrieved.";
  }

  return chunks
    .map((chunk, index) => {
      const source =
        chunk.source ?? "Unknown source";

      const chunkLabel =
        chunk.chunkNumber !== null
          ? `Chunk ${chunk.chunkNumber}`
          : "Unknown chunk";

      return [
        `--- KNOWLEDGE BASE RESULT ${index + 1} ---`,
        `Source: ${source}`,
        `Location: ${chunkLabel}`,
        "",
        chunk.text,
      ].join("\n");
    })
    .join("\n\n");
}