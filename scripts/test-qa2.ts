import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { loadEnvConfig } from "@next/env";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";

loadEnvConfig("");

const prompt = require("prompt-sync")();

let pinecone: PineconeClient | null = null;

async function initPineconeClient() {
    pinecone = new PineconeClient();
    await pinecone.init({
        environment: process.env.PINECONE_ENVIRONMENT!,
        apiKey: process.env.PINECONE_API_KEY!,
    });
    console.log("pinecone initialized");
}
async function main() {
    await initPineconeClient();

    const pineconeIndex = pinecone!.Index("earnest-blog");

    await pineconeIndex.update({
        updateRequest: {
            id: "864f5cb3-0a68-453a-9e18-d3f3e059751a",
            setMetadata: {
                test: "value",
            },
        },
    });

    const res = await pineconeIndex.query({
        queryRequest: {
            id: "864f5cb3-0a68-453a-9e18-d3f3e059751a",
            topK: 1,
            includeMetadata: true,
        },
    });

    console.log(JSON.stringify(res, null, 3));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
