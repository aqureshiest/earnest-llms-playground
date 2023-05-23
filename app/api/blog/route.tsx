import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { OpenAI, PromptTemplate } from "langchain";
import { LLMChain } from "langchain/chains";
import { CallbackManager } from "langchain/callbacks";

const TEMPERATURE = 0.5;
const MODEL = "text-curie-001"; //text-davinci-003

async function generateEmbeddingFor(query: string) {
    const embedding = new OpenAIEmbeddings();
    return await embedding.embedQuery(query);
}

async function formulateQuestion(question: string, chatHistory: string[]) {
    const prompt =
        PromptTemplate.fromTemplate(`Given the following user prompt and conversation log, formulate a question that would be the most relevant to provide the user with an answer from a knowledge base. Always prioritize the user prompt over the conversation log. Ignore any conversation log that is not directly related to the user prompt. If you are unable to formulate a question, respond with the same USER PROMPT you got.

USER PROMPT: {question}

CONVERSATION LOG: {chatHistory}

Answer:
`);
    const llm = new OpenAI({ temperature: TEMPERATURE });
    const chain = new LLMChain({ llm, prompt });
    const answer = await chain.call({
        question: question,
        chatHistory: chatHistory,
    });
    return answer.text;
}

async function getMatches(pinecone: PineconeClient, embedding: number[], topK: number) {
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
        PromptTemplate.fromTemplate(`Provide a concise summary of the text in the CONTENT in attempting to answer the USER QUESTION. Follow the following rules when generating the summary:
- If the CONTENT is not relevant to the USER QUESTION ,the final answer should be empty
- The summary should be under 4000 characters

USER QUESTION: {query}
CONTENT: {document}

Final Answer:
`);
    const llm = new OpenAI({ modelName: MODEL, temperature: TEMPERATURE });
    const chain = new LLMChain({ llm, prompt });
    const response = await chain.call({
        query: query,
        document: document,
    });
    return response.text;
}

async function summarizeDocument(document: string, query: string): Promise<string> {
    console.log("document length " + document.length);
    const result = document.length > 4000 ? await summarize(document, query) : document;
    console.log("summarized length " + result.length);
    return result;
}

async function summarizeMatches(query: string, matches: ScoredVector[] | undefined) {
    return Promise.all(
        matches!.map(async (match: any) => {
            let text = match?.metadata?.content as string;
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
    const llm = new OpenAI({ temperature: TEMPERATURE });
    const chain = new LLMChain({ llm, prompt });
    const answer = await chain.call({
        question: question,
        chat_history: chatHistory,
        context: context,
    });
    return answer;
}

export async function POST(req: Request) {
    const prompt =
        PromptTemplate.fromTemplate(`Answer the question based on the context below. Take into account the entire conversation so far, marked as CONVERSATION LOG, but prioritize the CONTEXT. Based on the CONTEXT, choose the source that is most relevant to the QUESTION. Do not make up any answers if the CONTEXT does not have relevant information. Do not mention the CONTEXT or the CONVERSATION LOG in the answer, but use them to generate the answer. The answer should only be based on the CONTEXT. Do not use any external sources. Summarize the CONTEXT to make it easier to read, but don't omit any information.

CONVERSATION HISTORY: {chat_history}

CONTEXT: {context}

QUESTION: {question}

Final Answer:
`);

    try {
        const { input, history } = await req.json();
        console.log({ input, history });

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
                temperature: 0.5,
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
                .call({ question: question, chat_history: history, context: summarizedMatches })
                .catch((e: Error) => console.error(e));

            return new Response(stream.readable, {
                headers: { "Content-Type": "text/event-stream" },
            });
        } else {
            const llm = new OpenAI({ temperature: 0 });
            const chain = new LLMChain({
                prompt: prompt,
                llm: llm,
            });

            const response = await chain.call({
                question: question,
                chat_history: history,
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
