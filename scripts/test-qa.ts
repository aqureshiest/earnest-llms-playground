import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { loadEnvConfig } from "@next/env";
import { OpenAI, PromptTemplate } from "langchain";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { ConversationalRetrievalQAChain, LLMChain, RetrievalQAChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";

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

    const question = "tell me about the leadership team at Earnest";

    const model = new OpenAI({ temperature: 0, maxTokens: 2000 });
    const pineconeIndex = pinecone!.Index("earnest-blog");
    const embeddings = new OpenAIEmbeddings();
    const vectorstore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex: pineconeIndex,

        textKey: "content",
    });
    const chain = RetrievalQAChain.fromLLM(model, vectorstore.asRetriever(), {
        returnSourceDocuments: true,
    });
    const res = await chain.call({
        query: question,
    });
    console.log(res);

    //     const prompt =
    //         PromptTemplate.fromTemplate(`Based on the following conversation between a human and an AI assistant, suggest a few funny follow up questions:

    // CHAT_HISTORY:
    // {chatHistory}

    // Follow up questions:
    // `);

    //     const nextchain = new LLMChain({
    //         llm: new OpenAI({
    //             temperature: 0.9,
    //         }),
    //         prompt,
    //     });
    //     const response = await nextchain.call({
    //         query: "",
    //         chatHistory: `
    // [user] Who is David Green?
    // [ai assistant] he is the CEO of Earnest
    // `,
    //     });

    //     console.log(response);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
