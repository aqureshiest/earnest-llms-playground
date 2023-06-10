import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeClient, ScoredVector } from "@pinecone-database/pinecone";
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
        PromptTemplate.fromTemplate(`Provide a concise summary of the following text. Apply the following rules:
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
        }),
        prompt,
    });
    const response = await chain.call({
        query: query,
        document: document,
    });
    return response.text;
}

export async function summarizeDocument(document: string, query: string): Promise<string | null> {
    if (document.length > 8000) {
        console.log("summarizing coz length " + document.length);
        const chunks = chunkSubstr(document, 8000);
        const result = [];
        for (const chunk of chunks) {
            const res = await summarize(chunk, query);
            result.push(res);
        }
        return result.join(" ");
    }
    console.log("no need to summarize coz length is " + document.length);
    return null;
}

export async function summarizeMatches(
    pinecone: PineconeClient,
    query: string,
    matches: ScoredVector[] | undefined
) {
    const pineconeIndex = pinecone!.Index("earnest-blog");
    return Promise.all(
        matches!.map(async (match: ScoredVector) => {
            let md = match?.metadata as any;

            // check if we already have the summary
            // if (md.summary) {
            //     return md.summary;
            // }

            let text = md.text as string;
            text = text.replace(/(\r\n|\r|\n){2}/g, "$1").replace(/(\r\n|\r|\n){3,}/g, "$1\n");
            text = text.replaceAll("\n", " ");

            const response = await summarizeDocument(text, query);
            return response;
            // if (response) {
            //     console.log("got summary, updating in pinecone");
            //     // put the summary in pinecone so we dont have to generate it again
            //     await pineconeIndex.update({
            //         updateRequest: {
            //             id: match.id,
            //             setMetadata: {
            //                 summary: response,
            //             },
            //         },
            //     });
            //     console.log("summary updated for ", match.id);
            //     return response;
            // }

            // return text;
        })
    );
}

export async function answer(question: string, chatHistory: string[], context: string[]) {
    const prompt =
        PromptTemplate.fromTemplate(`You are a helpful AI agent who can answer questions from a knowledgebase.
Based on the chat history below and the knowledge base provided, answer the user question. 
If the answer is not found in the context, do not make up an answer.

Think about why your answer is correct. Include your reasoning in the response.

User Question: {question}

Chat History:
{chatHistory}

Knowledge base:
{context}

Answer:
`);
    console.log(prompt);
    const llm = new OpenAI({
        temperature: 0,
    });
    const chain = new LLMChain({ llm, prompt });
    const answer = await chain.call({
        question: question,
        chatHistory: chatHistory,
        context: context,
    });
    return answer;
}
