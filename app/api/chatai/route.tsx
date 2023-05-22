import { ChatOpenAI } from "langchain/chat_models/openai";
import { ConversationChain } from "langchain/chains";
import { CallbackManager } from "langchain/callbacks";
import { BufferMemory, ChatMessageHistory, getInputValue } from "langchain/memory";
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    MessagesPlaceholder,
    SystemMessagePromptTemplate,
} from "langchain/prompts";
import { HumanChatMessage, AIChatMessage } from "langchain/schema";

//"You are a helpful AI assistant who works for the company called Earnest. The company helps its user find scholarships programs that they might be good match based on their information and preferences. The AI agent will ask the user a series of questions to collect the user name, the country they live in, what is their job and income, which degree the user is enrolled in, and finally what are the user interests and hobbies. You should ask these questions in a friendly. Ask these questions one at a time and build an engaging conversation with the user. Once you have successfully collected all the information, you can inform the user that you will look for scholarship programs that they may qualify for based on the information they have provided, and include a [Done] token in your response. After the [Done] token, provide all user information collected in JSON format with keys as one words in lower case and sorrounded with quotes. If the user asks other questions or deviates from the conversation in any way, politely redirect the conversation back to the above questionnaire. Start the conversation by greeting the user and keep your responses readable and concise. Following is the chat history so far:"
const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(
        "You are a helpful AI assistant who works for the company called Earnest. The company helps its user find scholarships programs that they might be good match based on their information and preferences. The AI agent will ask the user a series of questions to collect the user name, the country they live in, what is their job and income, which degree the user is enrolled in, and finally what are the user interests and hobbies. You should ask these questions in a friendly manner. Ask these questions one at a time and DO NOT answer the questions for the user. Once you have successfully collected answers from the user for all questions (especially including interests and hobbies), you can inform the user that you will look for scholarship programs that they may qualify for based on the information they have provided, and include a HTML span tag with class 'hidden' and inside this span, provide all user information collected in JSON format with keys as one words in lower case and sorrounded with quotes. If the user asks other questions or deviates from the conversation in any way, politely redirect the conversation back to the above questionnaire. Start the conversation by greeting the user and keep your responses readable and concise."
    ),
    new MessagesPlaceholder("history"),
    HumanMessagePromptTemplate.fromTemplate("{input}"),
]);

export async function POST(req: Request) {
    try {
        const { input, history } = await req.json();
        console.log({ input, history });

        const pastMessages: any[] = history.map((h: string) => {
            if (h.trim().length == 0) return;

            const speaker = h.substring(h.indexOf("[") + 1, h.indexOf("]"));
            const message = h.substring(h.indexOf("]") + 2);
            if (speaker == "User") return new HumanChatMessage(message);
            if (speaker == "Assistant") return new AIChatMessage(message);
        });

        const memory = new BufferMemory({
            chatHistory: new ChatMessageHistory(pastMessages),
            returnMessages: true,
            memoryKey: "history",
        });

        // Check if the request is for a streaming response.
        const streaming = req.headers.get("accept") === "text/event-stream";

        if (streaming) {
            const encoder = new TextEncoder();
            const stream = new TransformStream();
            const writer = stream.writable.getWriter();

            const llm = new ChatOpenAI({
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

            const chain = new ConversationChain({
                memory: memory,
                prompt: prompt,
                llm: llm,
            });

            chain.call({ input }).catch((e: Error) => console.error(e));

            console.log(await chain.memory?.loadMemoryVariables([]));

            return new Response(stream.readable, {
                headers: { "Content-Type": "text/event-stream" },
            });
        } else {
            const llm = new ChatOpenAI({ temperature: 0 });
            const chain = new ConversationChain({
                memory: memory,
                prompt: prompt,
                llm: llm,
            });

            const response = await chain.call({ input });
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
