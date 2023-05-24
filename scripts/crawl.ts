import { Crawler, Page } from "../utils/crawler";
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { loadEnvConfig } from "@next/env";
import { sliceIntoChunks, truncateStringByBytes } from "@/utils/utils";
import { answer, generateEmbeddingFor, getMatches, summarizeMatches } from "@/utils/blogai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import Bottleneck from "bottleneck";
import { uuid } from "uuidv4";

loadEnvConfig("");

const prompt = require("prompt-sync")();

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

async function main() {
    if (!pinecone) await initPineconeClient();

    // const documents = await crawl();
    // console.log("crawling done");

    const query = "Why should I get my student loan from Earnest instead of the government?";

    // generateEmbeddings(documents);
    // console.log("embeddings generated and stored in pinecone");
    const embedding = await generateEmbeddingFor(query);
    console.log("query embedding done");
    const matches = await getMatches(pinecone!, embedding, 5);
    console.log("got matches from pinecone", matches?.length);

    const md = matches![0].metadata as any;
    console.log(md.text);

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
