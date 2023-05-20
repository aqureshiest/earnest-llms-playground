import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { Configuration, OpenAIApi } from "openai";

const prompt = require("prompt-sync")();

loadEnvConfig("");

// configure openai
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// configure supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    }
);

const LOAD_COUNT = 1000;
const BATCH_SIZE = 20;

async function loadScholarships() {
    console.log("Loading scholarships from the database");

    // read from database
    const { error, data } = await supabase.from("scholarships_intl").select("*").limit(LOAD_COUNT);

    if (error) {
        console.error("Error in reading titles from database");
        throw error;
    }

    return data;
}

async function generateAndUpdateEmbeddings() {
    console.log("generating embeddings");
    let batch = [];

    const scholarships = await loadScholarships();
    for (const scholarship of scholarships) {
        // add to batch
        batch.push(scholarship);

        // generate embeddings when batch is full
        if (batch.length >= BATCH_SIZE) {
            await processEmbeddingsBatch(batch);
            // empty the batch
            batch = [];
        }
    }

    batch.length > 0 && (await processEmbeddingsBatch(batch));
}

async function processEmbeddingsBatch(batch: any[]) {
    const batchData = batch.map((b) => b.title);
    console.log(
        `>> Ready to generate embeddings for the batch\n-------\n${batchData.join(
            "\n"
        )}\n--------\n\n`
    );

    // request embedding from openai
    const embeddings = await generateEmbeddingsInBatch(batchData);

    // iterate over each embedding
    for (const embedding of embeddings) {
        // add embedding to the database
        const { error, data } = await supabase.from("scholarships_intl_embeddings").insert({
            title: batch[embedding.index].title,
            embeddings: embedding.embedding,
            scholarship_id: batch[embedding.index].id,
        });
        if (error) {
            console.error("Error in adding embedding to database");
            throw error;
        }
    }
}

async function generateEmbeddingsInBatch(input: string[]) {
    const sanitizedInput: string[] = input;
    sanitizedInput.forEach((i) => i.trim());

    // request embeddings from openai
    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: sanitizedInput,
    });

    if (response.status != 200) {
        throw new Error("embedding request failed");
    }

    return response.data.data;
}

async function generateEmbedding(input: string) {
    const sanitizedInput = input.trim();

    // request embeddings from openai
    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: sanitizedInput,
    });

    if (response.status != 200) {
        throw new Error("embedding request failed");
    }

    const [responseData] = response.data.data;
    return responseData.embedding;
}

async function findMatchingEmbeddings(input: string, loc: string, deg: string) {
    const embedding = await generateEmbedding(input);

    const { error: rpcError, data: rpcData } = await supabase.rpc("match_scholarships_intl", {
        embeddings: embedding,
        loc,
        deg,
        match_threshold: 0.78,
        match_count: 10,
    });
    if (rpcError) {
        console.log("Error in finding matching embedding");
        throw rpcError;
    }

    return rpcData;
}

async function extract(history: string) {
    const EXTRACT_PROMPT = `You are an AI agent that can extract personal information from given text.
You are provided a chat between another AI agent and a user. The format of the chat looks like this:

Assistant: Hi there! I'm an AI assistant from Earnest. I'm here to help you find the right scholarship programs that you may qualify for. Before we get started, could you please tell me your name? 
User: My name is Adeel
Extracted information: User name = Adeel

Here is the chat history:
${history}

Below is the complete chat history. From this chat history, you are given the task to extract the following information. Provide you answer in a JSON map and use the labels specified on each question:
1. what is the name of the user? (label is username)
2. which country the user wants to go to school? (label is country)
3. does the user have a job and how much is the approximate income? (label is job)
4. which degree the user is enrolled in? (label is degree)
5. how much is the tution fee for user? (label is fee)
6. what are the user interests and hobbies? (label is interests)

Answer:
`;

    console.log(EXTRACT_PROMPT);

    const answer = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: EXTRACT_PROMPT,
        max_tokens: 2000,
        temperature: 0.5,
    });

    return answer.data;
}

async function qa(history: string) {
    const HISTORY =
        history.length > 0
            ? `Below is the conversation so far. Make sure to continue the conversation from this chat history:
${history}
`
            : "";

    const QA_PROMPT = `You are a helpful AI assistant who works for the company called Earnest. 
The company builds financial products such student laons and personal loans. 
Earnest has recently added another product to help users find scholarships programs that they may qualify for.
Earnest maintains a database of these scholarship programs. Your goal is to the help Earnest users find the right scholarship programs 
that they may qualify for. 
To find the relevant scholarship program, you need to ask the users a few questions. Here are those questions:
1. what is the user's name?
2. which country the user wants to go to school?
3. do they have a job and how much is the approximate income?
4. which degree they are enrolled in (choices are bachelors, masters, or phd)?
5. how much is the tution fee?
6. what are you interests and hobbies?
You should ask these questions in a friendly and conversational manner. You should ask these questions only one at a time and build a conversation
that leads to asking these questions in a natural way. Once the user has answered all the questions, you can tell the user that you will 
look for the scholarship programs that they may qualify for, based on the information that they have provided. If the user asks other questions
or deviate from the conversation in any way, politely redirect the conversation back to the above questionnaire.

${HISTORY}
Assistant:
`;

    // console.log(QA_PROMPT);

    const answer = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: QA_PROMPT,
        max_tokens: 2000,
        temperature: 0.5,
    });

    return answer.data;
}

async function find(input: string, scholarships: string) {
    const FIND_SCHOLARSHIP_PROMPT = `You are a helpful AI assistant who works for the company called Earnest. 
The company builds financial products such as student laons and personal loans. 
Earnest maintains a database of these scholarship programs. Your job is to the help Earnest users and tell them about these scholarship
programs.

Below is the list of scholarship programs that match the user interest of ${input}:
${scholarships}

Provide your answer in markdown.


Answer:
`;

    console.log(FIND_SCHOLARSHIP_PROMPT);

    const answer = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: FIND_SCHOLARSHIP_PROMPT,
        max_tokens: 2000,
        temperature: 0.5,
    });

    console.log(answer.data);
}

async function main() {
    // console.log(await loadScholarships());
    // await generateAndUpdateEmbeddings();

    const history = [];

    // const answer: any = await qa("");
    // console.log(answer.choices[0].text);
    // history.push("Assistant: " + answer.choices[0].text);

    // let input = "";
    // while (true) {
    //     input = "User: " + prompt(">");
    //     if (input == "User: done") break;

    //     const answer: any = await qa(history.join("\n") + "\n" + input);
    //     history.push(input + "\n" + "Assistant: " + answer.choices[0].text);
    //     console.log(answer.choices[0].text);
    // }

    // console.log("-------------------");
    const historyText = `
Assistant: Hi there! I'm here to help you find the right scholarship programs that you may qualify for. To do this, I need to ask you a few questions. 
What is your name?
User: sure my name is adeel qureshi
Assistant: Nice to meet you Adeel! Can you tell me which country you want to go to school in?
User: united states
Assistant: Great! What is your approximate income if you have a job?
User: i dont have a job
Assistant: No problem, that's fine. What degree are you enrolled in? Are you pursuing a Bachelor's, Master's, or PhD?
User: bachelor
Assistant: Got it. Lastly, what is the tuition fee for the program you are enrolled in?
User: 10000 per semester
Assistant: Thanks for the information Adeel. Based on the information you have provided, I will look for scholarship programs that you may qualify for. 
If you have any other questions, please let me know.
Assistant: What are your interests and hobbies?
User: I like to do volunteer work
    `;
    const extracted: any = await extract(historyText);
    const json = JSON.parse(extracted.choices[0].text);

    const response = await findMatchingEmbeddings(json.interests, json.country, json.degree);
    const scholarships: string[] = [];
    for (const r of response) {
        scholarships.push(
            `Scholarship Title: "${r.title}" Degree: "${r.degree}" Amount Offered: "${r.funds} Country: "${r.location}" Funds: "${r.funds}"`
        );
    }

    const answer = await find(json.interests, scholarships.join(" "));
    console.log(answer);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
