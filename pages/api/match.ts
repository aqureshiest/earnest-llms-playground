import { ParsedEvent, ReconnectInterval, createParser } from "eventsource-parser";
import { Configuration, OpenAIApi } from "openai";

export const config = {
    runtime: "edge",
};

// configure openai
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function match(userInfo: string, scholarships: string) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    console.log("userInfo: ", userInfo);
    console.log("scholarships: ", scholarships);

    userInfo = userInfo.replaceAll("\n", " ");
    scholarships = scholarships.replaceAll("\n", " ");

    const PROMPT = `You are a helpful AI assistant who works for the company called Earnest. 
Earnest maintains a database of scholarship programs. Your job is to the help Earnest users in matching them with scholarships programs based on the information that they have provided.
User Information:
${userInfo}
We have identified a few scholarships that might be a good match. Pick the top 3 scholarships that will be the best match based on the user information and the scholarship title, country, and degree. Tell the user about these scholarships and why you picked these ones. Answer only from the provided scholarships and do not make up an answer. If no scholarships are provided or the user information does not match with the provided scholarships, politely tell the user that you werent able to find any scholarships.
Scholarships:
${scholarships}
Provide your answer in HTML.
Answer:
`;

    console.log(PROMPT);

    const answer = await fetch("https://api.openai.com/v1/completions", {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        method: "POST",
        body: JSON.stringify({
            model: "text-davinci-003",
            prompt: PROMPT,
            max_tokens: 2000,
            temperature: 0.5,
            stream: true,
        }),
    });

    if (answer.status !== 200) {
        throw new Error(`OpenAI API returned an error ${answer.status}`);
    }

    const stream = new ReadableStream({
        async start(controller) {
            const onParse = (event: ParsedEvent | ReconnectInterval) => {
                if (event.type === "event") {
                    const data = event.data;

                    if (data === "[DONE]") {
                        controller.close();
                        return;
                    }

                    try {
                        const json = JSON.parse(data);
                        const text = json.choices[0].text;
                        const queue = encoder.encode(text);
                        controller.enqueue(queue);
                    } catch (e: any) {
                        console.log("error in parsing stream response", e.message);
                        controller.error(e);
                    }
                }
            };

            const parser = createParser(onParse);

            for await (const chunk of answer.body as any) {
                parser.feed(decoder.decode(chunk));
            }
        },
    });

    return stream;
}

export default async function (req: Request, res: Response) {
    if (!configuration.apiKey) {
        return new Response("OpenAI key not provided", { status: 500 });
    }

    const { userInfo, scholarships } = (await req.json()) as {
        userInfo: string;
        scholarships: string;
    };

    console.log({ userInfo, scholarships });

    try {
        const stream = await match(userInfo, scholarships);
        return new Response(stream);
    } catch (e: any) {
        console.error(e);
        return new Response(e, { status: 500 });
    }
}
