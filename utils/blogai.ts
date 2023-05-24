import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeClient, ScoredVector, Vector } from "@pinecone-database/pinecone";
import { OpenAI, PromptTemplate } from "langchain";
import { LLMChain } from "langchain/chains";
import { chunkSubstr } from "./utils";

export async function generateEmbeddingFor(query: string) {
    const embedding = new OpenAIEmbeddings();
    return await embedding.embedQuery(query);
}

export async function formulateQuestion(question: string, chatHistory: string[]) {
    const prompt =
        PromptTemplate.fromTemplate(`Given the following user prompt and conversation log, formulate a question that would be the most relevant to provide the user with an answer from a knowledge base. Always prioritize the user prompt over the conversation log. Ignore any conversation log that is not directly related to the user prompt. If you are unable to formulate a question, respond with the same USER PROMPT you got.

USER PROMPT: {question}

CONVERSATION LOG: {chatHistory}

Answer:
`);
    const llm = new OpenAI({ temperature: 0 });
    const chain = new LLMChain({ llm, prompt });
    const answer = await chain.call({
        question: question,
        chatHistory: chatHistory,
    });
    return answer.text;
}

export async function getMatches(pinecone: PineconeClient, embedding: number[], topK: number) {
    const index = pinecone!.Index("earnest-blog");
    const result = await index.query({
        queryRequest: {
            vector: embedding,
            topK,
            includeMetadata: true,
        },
    });

    const hsMatches = result.matches?.filter((res) => res.score! > 0.75);
    const mdhs = hsMatches?.map((m) => {
        const md = m.metadata as any;
        return [md.url, m.score];
    });
    console.log(mdhs!.join(" "));

    return hsMatches;
}

export async function summarize(document: string, query: string) {
    if (document.length == 0) return "";

    const prompt =
        PromptTemplate.fromTemplate(`Summarize the following text in an attempt to answer the user question. Apply the following rules:
- If the Text is not relevant to the User Question ,the answer should be empty string
- The summary should be under 4000 characters
        
User Question: {query}
Text:
{document}

Answer:
`);
    const chain = new LLMChain({
        llm: new OpenAI({
            temperature: 0,
            maxTokens: 256,
            topP: 1,
            frequencyPenalty: 0,
            presencePenalty: 0,
        }),
        prompt,
    });
    const response = await chain.call({
        query: query,
        document: document,
    });
    return response.text;
}

export async function summarizeDocument(document: string, query: string): Promise<string> {
    if (document.length > 8000) {
        const chunks = chunkSubstr(document, 8000);
        const result = [];
        for (const chunk of chunks) {
            const res = await summarize(chunk, query);
            result.push(res);
        }
        return result.join(" ");
    }
    return await summarize(document, query);
}

export async function summarizeMatches(query: string, matches: ScoredVector[] | undefined) {
    return Promise.all(
        matches!.map(async (match: any) => {
            let text = match?.metadata?.text as string;
            text = text.replace(/(\r\n|\r|\n){2}/g, "$1").replace(/(\r\n|\r|\n){3,}/g, "$1\n");
            text = text.replaceAll("\n", " ");

            const response = await summarizeDocument(text, query);
            return response;
        })
    );
}

export async function answer(question: string, chatHistory: string[], context: string[]) {
    const prompt =
        PromptTemplate.fromTemplate(`You are an AI agent that can only answer questions about Earnest. Answer the user question ONLY from the knowledge base below. Take into consideration the chat history. Based on the question and chat history, choose parts of the context that are most relevant and provide a final answer based on that. If the answer is not found in the context, simply respond that you do not know the answer.

User Question: {question}

Chat History:
{chatHistory}

Knowledge base:
{context}

Answer:
`);
    const llm = new OpenAI({
        temperature: 0,
        maxTokens: 256,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
    });
    const chain = new LLMChain({ llm, prompt });
    const answer = await chain.call({
        question: question,
        chatHistory: chatHistory,
        context: context,
    });
    return answer;
}
