import { ConversationChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
    MessagesPlaceholder,
} from "langchain/prompts";
import { BufferMemory } from "langchain/memory";

const prompt = require("prompt-sync")();

export const run = async () => {
    const chat = new ChatOpenAI({
        openAIApiKey: "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",
        temperature: 0,
    });

    const chatPrompt = ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
            "The following is a friendly conversation between a human and an AI. The AI is talkative and provides lots of specific details from its context. If the AI does not know the answer to a question, it truthfully says it does not know."
        ),
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate("{input}"),
    ]);

    const chain = new ConversationChain({
        memory: new BufferMemory({ returnMessages: true, memoryKey: "history" }),
        prompt: chatPrompt,
        llm: chat,
    });

    const response = await chain.call({
        input: "hi! whats up?",
    });

    console.log(response);

    while (true) {
        const input = prompt(">");
        if (input == "done") break;

        const resp = await chain.call({
            input: input,
        });
        console.log(resp);
        console.log(chain.memory?.loadMemoryVariables);
    }
};

run();
