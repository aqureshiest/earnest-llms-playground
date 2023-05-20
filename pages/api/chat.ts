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

async function chat(history: string) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    history = history.replaceAll("\n", " ");

    const HISTORY =
        history.length > 0
            ? `Conversation History:
${history}
`
            : "";

    const QA_PROMPT = `You are a helpful AI assistant who works for the company called Earnest. The company helps its user find scholarships programs that they might be good match based on their information and preferences. The AI agent will ask the user a series of questions to collect the user name, the country they live in, what is their job and income, which degree the user is enrolled in, and finally what are the user interests and hobbies. You should ask these questions in a friendly. Ask these questions one at a time and build an engaging conversation with the user. Once you have successfully collected all the information, you can inform the user that you will look for scholarship programs that they may qualify for based on the information they have provided, and include a [Done] token in your response. After the [Done] token, provide all user information collected in JSON format with keys as one words in lower case and sorrounded with quotes. If the user asks other questions or deviates from the conversation in any way, politely redirect the conversation back to the above questionnaire.
Start the conversation by greeting the user and keep your responses readable and concise.
${HISTORY}
Assistant:
`;

    console.log(QA_PROMPT);

    const answer = await fetch("https://api.openai.com/v1/completions", {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        method: "POST",
        body: JSON.stringify({
            model: "text-davinci-003",
            prompt: QA_PROMPT,
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

    const { history } = (await req.json()) as {
        history: string;
    };

    try {
        const stream = await chat(history);
        return new Response(stream);
    } catch (e: any) {
        console.error(e);
        return new Response(e, { status: 500 });
    }
}
