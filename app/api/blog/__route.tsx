import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { loadEnvConfig } from "@next/env";
import { OpenAI, PromptTemplate } from "langchain";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { ConversationalRetrievalQAChain, LLMChain, RetrievalQAChain } from "langchain/chains";
import { BufferMemory, ChatMessageHistory } from "langchain/memory";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { AIChatMessage, HumanChatMessage, SystemChatMessage } from "langchain/schema";
import { CallbackManager } from "langchain/callbacks";

let pinecone: PineconeClient | null = null;

async function initPineconeClient() {
    pinecone = new PineconeClient();
    await pinecone.init({
        environment: process.env.PINECONE_ENVIRONMENT!,
        apiKey: process.env.PINECONE_API_KEY!,
    });
    console.log("pinecone initialized");
}

export async function POST(req: Request) {
    const { input, history } = await req.json();
    console.log({ input, history });
    try {
        const pastMessages: any[] = history.map((h: string) => {
            if (h.trim().length == 0) return;

            const speaker = h.substring(h.indexOf("[") + 1, h.indexOf("]"));
            const message = h.substring(h.indexOf("]") + 2);
            if (speaker == "User") return new HumanChatMessage(message);
            if (speaker == "Assistant") return new AIChatMessage(message);
            if (speaker == "System") return new SystemChatMessage(message);
        });

        await initPineconeClient();

        const pineconeIndex = pinecone!.Index("earnest-blog");
        const embeddings = new OpenAIEmbeddings();
        const vectorstore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: pineconeIndex,
            textKey: "content",
        });

        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();

        const streaming = req.headers.get("accept") === "text/event-stream";
        console.log("streaming", streaming);

        const streamingModel = new ChatOpenAI({
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
        const nonStreamingModel = new ChatOpenAI({});
        const chain = ConversationalRetrievalQAChain.fromLLM(
            streamingModel,
            vectorstore.asRetriever(),
            {
                // memory: new BufferMemory({
                //     memoryKey: "chat_history",
                //     inputKey: "question", // The key for the input to the chain
                //     outputKey: "text", // The key for the final conversational output of the chain
                //     returnMessages: true, // If using with a chat model
                // }),
                // verbose: true,
                questionGeneratorTemplate: `Using the chat history and the user question, formulate the final question
                    
User Question: {question}

Chat History:
{chat_history}

Answer:
`,
                qaTemplate: `You are a helpful AI agent who can answer questions from the knowledge base of a company called Earnest.
Use the following rules when answering the questions:
- Answer the user question based on the provided context from the knowledge base and the chat history.
- If the answer is not found in the context, do not make up an answer.
- Provide your answer in HTML and use bullet points and paragraphs.

User Question: {question}

Chat History:
{chat_history}

Context:
{context}

Answer:
`,
            }
        );

        chain
            .call({
                question: input,
                chat_history: new ChatMessageHistory(pastMessages),
                urls: ["https://earnest.com"],
            })
            .catch((e: Error) => console.error(e));

        return new Response(stream.readable, {
            headers: { "Content-Type": "text/event-stream" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: (e as any).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

export const runtime = "edge";
