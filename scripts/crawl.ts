import { Crawler, Page } from "../utils/crawler";
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { loadEnvConfig } from "@next/env";
import { truncateStringByBytes } from "@/utils/utils";
import { answer, generateEmbeddingFor, getMatches, summarizeMatches } from "@/utils/blogai";

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

async function main() {
    if (!pinecone) await initPineconeClient();

    // const documents = await crawl();
    // console.log("crawling done");

    const query = "Why should I get my student loan from Earnest instead of the government?";

    // generateEmbeddings(documents);
    // console.log("embeddings generated and stored in pinecone");
    // const embedding = await generateEmbeddingForUserQuery(query);
    // console.log("query embedding done");
    // const matches = await getMatches(embedding, 5);
    // console.log("got matches from pinecone", matches?.length);
    // const summarizedMatches = await summarizeMatches(query, matches);
    // console.log("summarized matches done");
    // const result = await answer(query, [], summarizedMatches);
    // console.log(result);

    const matches = await getMatches(
        pinecone!,
        await generateEmbeddingFor("where do elephants live"),
        5
    );
    const m = await summarizeMatches("where do elephants live", matches);
    console.log(m);

    const result = await answer("where do elephants live", [], m);
    console.log(result);

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
