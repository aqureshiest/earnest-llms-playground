import { PineconeClient } from "@pinecone-database/pinecone";
import { OpenAI, PromptTemplate } from "langchain";
import { LLMChain } from "langchain/chains";
import { CallbackManager } from "langchain/callbacks";
import {
    formulateQuestion,
    generateEmbeddingFor,
    getMatches,
    summarizeMatches,
} from "@/utils/blogai";

export async function POST(req: Request) {
    const prompt =
        PromptTemplate.fromTemplate(`You are an AI agent that can only answer questions about Earnest. Answer the user question ONLY from the knowledge base below. Take into consideration the chat history. Based on the question and chat history, choose parts of the context that are most relevant and provide a final answer based on that. If the answer is not found in the context, simply respond that you do not know the answer.
The URLs are the URLs of the pages that contain the Knowledge base. Always include them at the end of the answer as HTML links.

User Question: {question}

Chat History:
{chatHistory}

Knowledge base:
{context}

Urls:
{urls}

Provide your answer in HTML and use bullet points and paragraphs.

Answer:
`);

    try {
        const { input, history } = await req.json();
        console.log({ input, history });

        if (input.length == 0) {
            return new Response("no input provided");
        }

        // initialize pinecone client
        const pinecone: PineconeClient = new PineconeClient();
        await pinecone.init({
            environment: process.env.PINECONE_ENVIRONMENT!,
            apiKey: process.env.PINECONE_API_KEY!,
        });

        // first formulate a better question from user prompt and chat history
        const question = await formulateQuestion(input, history);
        console.log("formulated question: " + question);

        // generate embedding for the formulated question
        const embedding = await generateEmbeddingFor(question);
        console.log("generated embedding for formulated question: " + embedding[0] + "...");

        // lets get matches for this question
        const matches = await getMatches(pinecone, embedding, 3);
        console.log("got matches ==> ", matches?.length);
        if (matches?.length == 0) {
            return new Response("Unable to find any information on this");
        }
        const urls =
            matches &&
            Array.from(
                new Set(
                    matches.map((match) => {
                        const metadata = match.metadata as any;
                        const { url } = metadata;
                        return url;
                    })
                )
            );
        console.log(urls);

        // lets summarize the matches
        const summarizedMatches = await summarizeMatches(question, matches);
        console.log("matches summarized ==> ", summarizedMatches);

        // lets do the final query
        const streaming = req.headers.get("accept") === "text/event-stream";
        if (streaming) {
            const encoder = new TextEncoder();
            const stream = new TransformStream();
            const writer = stream.writable.getWriter();

            const llm = new OpenAI({
                temperature: 0,
                maxTokens: 256,
                topP: 1,
                frequencyPenalty: 0,
                presencePenalty: 0,
                streaming: true,
                callbackManager: CallbackManager.fromHandlers({
                    handleLLMNewToken: async (token: string) => {
                        await writer.ready;
                        await writer.write(encoder.encode(`data: ${token}\n\n`));
                    },
                    handleLLMEnd: async () => {
                        await writer.ready;
                        await writer.close();
                    },
                    handleLLMError: async (e: Error) => {
                        await writer.ready;
                        await writer.abort(e);
                    },
                }),
            });

            const chain = new LLMChain({
                prompt: prompt,
                llm: llm,
            });

            chain
                .call({
                    question: question,
                    chatHistory: history,
                    context: summarizedMatches,
                    urls,
                })
                .catch((e: Error) => console.error(e));

            return new Response(stream.readable, {
                headers: { "Content-Type": "text/event-stream" },
            });
        } else {
            const llm = new OpenAI({
                temperature: 0,
                maxTokens: 256,
                topP: 1,
                frequencyPenalty: 0,
                presencePenalty: 0,
            });
            const chain = new LLMChain({
                prompt: prompt,
                llm: llm,
            });

            const response = await chain.call({
                question: question,
                chatHistory: history,
                context: summarizedMatches,
            });
            return new Response(JSON.stringify(response), {
                headers: { "Content-Type": "application/json" },
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as any).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

export const runtime = "edge";
