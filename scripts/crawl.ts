import { Crawler, Page } from "../utils/crawler";
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import Bottleneck from "bottleneck";
import { uuid } from "uuidv4";
import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { loadEnvConfig } from "@next/env";
import { OpenAI, PromptTemplate } from "langchain";
import { LLMChain } from "langchain/chains";

loadEnvConfig("");

const prompt = require("prompt-sync")();

const truncateStringByBytes = (str: string, bytes: number) => {
    const enc = new TextEncoder();
    return new TextDecoder("utf-8").decode(enc.encode(str).slice(0, bytes));
};

const sliceIntoChunks = (arr: Vector[], chunkSize: number) => {
    return Array.from({ length: Math.ceil(arr.length / chunkSize) }, (_, i) =>
        arr.slice(i * chunkSize, (i + 1) * chunkSize)
    );
};

const chunkSubstr = (str: string, size: number) => {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substring(o, size);
    }
    return chunks;
};

let pinecone: PineconeClient | null = null;

async function initPineconeClient() {
    pinecone = new PineconeClient();
    console.log("init pinecone");
    await pinecone.init({
        environment: process.env.PINECONE_ENVIRONMENT!,
        apiKey: process.env.PINECONE_API_KEY!,
    });
}

async function crawl() {
    const urls = ["https://www.earnest.com/blog/"];

    // Instantiate the crawler
    const crawler = new Crawler(urls, 100, 200);
    // Start the crawler
    const pages = (await crawler.start()) as Page[];

    const documents = await Promise.all(
        pages.map((row) => {
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 800,
                chunkOverlap: 200,
            });
            const docs = splitter.splitDocuments([
                new Document({
                    pageContent: row.text,
                    metadata: {
                        url: row.url,
                        text: truncateStringByBytes(row.text, 35000),
                    },
                }),
            ]);
            return docs;
        })
    );

    console.log(documents.flat().length);
    return documents;
}

async function generateEmbeddings(documents: Document<Record<string, any>>[][]) {
    const getEmbeddingAsVetor = async (doc: Document) => {
        const embedding = await embeddings.embedQuery(doc.pageContent);
        return {
            id: uuid(),
            values: embedding,
            metadata: {
                content: doc.pageContent,
                text: doc.metadata.text as string,
                url: doc.metadata.url as string,
            },
        } as Vector;
    };

    const embeddings = new OpenAIEmbeddings();

    const limiter = new Bottleneck({
        minTime: 50,
    });

    const rateLimitedEmbeddings = limiter.wrap(getEmbeddingAsVetor);
    console.log("done embedding");

    if (!pinecone) await initPineconeClient();

    const index = pinecone!.Index("earnest-blog");
    let vectors = [] as Vector[];

    try {
        vectors = (await Promise.all(
            documents.flat().map((doc) => rateLimitedEmbeddings(doc))
        )) as unknown as Vector[];
        vectors.map((v) => console.log(v.id));
        const chunks = sliceIntoChunks(vectors, 10);

        await Promise.all(
            chunks.map(async (chunk) =>
                index.upsert({
                    upsertRequest: {
                        vectors: chunk as Vector[],
                        namespace: "",
                    },
                })
            )
        );
        console.log("added to pinecone");
    } catch (e) {
        console.log(e);
    }
}

async function generateEmbeddingForUserQuery(query: string) {
    const embedding = new OpenAIEmbeddings();
    return await embedding.embedQuery(query);
}

async function getMatches(embedding: number[], topK: number) {
    if (!pinecone) await initPineconeClient();

    const index = pinecone!.Index("earnest-blog");

    const result = await index.query({
        queryRequest: {
            vector: embedding,
            topK,
            includeMetadata: true,
        },
    });

    // result.matches?.map((res) => console.log(JSON.stringify(res.metadata)));
    return result.matches;
}

async function summarize(document: string, query: string) {
    const prompt =
        PromptTemplate.fromTemplate(`You goal is to summarize the text in the CONTENT in attempting to answer the USER QUESTION. Follow the following rules when generating the summary:
- If the CONTENT is not relevant to the USER QUESTION ,the final answer should be empty
- The summary should be under 4000 characters

USER QUESTION: {query}
CONTENT: {document}

Final Answer:
`);
    const chain = new LLMChain({ llm: new OpenAI({ temperature: 0.5 }), prompt });
    const response = await chain.call({
        query: query,
        document: document,
    });
    return response.text;
}

async function summarizeDocument(document: string, query: string): Promise<string> {
    if (document.length > 3000) {
        const chunks = chunkSubstr(document, 4000);
        const summarizedChunks = [];
        for (const chunk of chunks) {
            const result = await summarize(chunk, query);
            summarizedChunks.push(result);
        }
        const result = summarizedChunks.join("\n");

        if (result.length > 3000) {
            return await summarizeDocument(result, query);
        } else {
            return result;
        }
    } else {
        return document;
    }
}

async function summarizeMatches(query: string, matches: ScoredVector[] | undefined) {
    return Promise.all(
        matches!.map(async (match: any) => {
            let text = match.metadata.text;
            text = text.replace(/(\r\n|\r|\n){2}/g, "$1").replace(/(\r\n|\r|\n){3,}/g, "$1\n");

            const response = await summarizeDocument(text, query);
            return response;
        })
    );
}

async function answer(question: string, chatHistory: string[], context: string[]) {
    const prompt =
        PromptTemplate.fromTemplate(`Answer the question based on the context below. Take into account the entire conversation so far, marked as CONVERSATION LOG, but prioritize the CONTEXT. Based on the CONTEXT, choose the source that is most relevant to the QUESTION. Do not make up any answers if the CONTEXT does not have relevant information. Do not mention the CONTEXT or the CONVERSATION LOG in the answer, but use them to generate the answer. The answer should only be based on the CONTEXT. Do not use any external sources. Summarize the CONTEXT to make it easier to read, but don't omit any information.

CONVERSATION HISTORY: {chat_history}

CONTEXT: {context}

QUESTION: {question}

Final Answer:
`);
    const model = new OpenAI({ temperature: 0 });
    const chain = new LLMChain({ llm: new OpenAI({ temperature: 0.5 }), prompt });
    const answer = await chain.call({
        question: question,
        chat_history: chatHistory,
        context: context,
    });
    return answer;
}

async function formulateQuestion(question: string, chatHistory: string[]) {
    const prompt =
        PromptTemplate.fromTemplate(`Given the following user prompt and conversation log, formulate a question that would be the most relevant to provide the user with an answer from a knowledge base. Always prioritize the user prompt over the conversation log. Ignore any conversation log that is not directly related to the user prompt. If you are unable to formulate a question, respond with the same USER PROMPT you got.

USER PROMPT: {question}

CONVERSATION LOG: {chatHistory}

Answer:
`);
    const model = new OpenAI({ temperature: 0 });
    const chain = new LLMChain({ llm: new OpenAI({ temperature: 0.5 }), prompt });
    const answer = await chain.call({
        question: question,
        chatHistory: chatHistory,
    });
    return answer;
}

async function main() {
    // const documents = await crawl();
    // console.log("crawling done");

    const query = "Why should I get my student loan from Earnest instead of the government?";

    // generateEmbeddings(documents);
    // console.log("embeddings generated and stored in pinecone");
    const embedding = await generateEmbeddingForUserQuery(query);
    console.log("query embedding done");
    const matches = await getMatches(embedding, 5);
    console.log("got matches from pinecone", matches?.length);
    // const summarizedMatches = await summarizeMatches(query, matches);
    // console.log("summarized matches done");
    // const result = await answer(query, [], summarizedMatches);
    // console.log(result);

    // const history = [
    //     "[AI] Hi how are you?",
    //     "[User] My name is Adeel",
    //     "[AI] How can I help you?",
    //     "[User] I want to know about precision pricing",
    //     "[AI] What would you like to know about it?",
    //     "[User] I want to know how it applies to student loans",
    //     "[AI] is there anything else you would like to know?",
    // ];
    // const result = await formulateQuestion("no", history);
    // console.log(result);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
