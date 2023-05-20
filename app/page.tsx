"use client";

import { ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import { ChangeEvent, useEffect, useState } from "react";
import { Answer } from "../components/Answer";

export default function Home() {
    const [answer, setAnswer] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const [chatInput, setChatInput] = useState("");
    const [chatHistory, setChatHistory] = useState<string[]>([]);
    const [chatDone, isChatDone] = useState(false);

    async function chat() {
        setIsLoading(true);

        const chat = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                history: chatHistory.join("\n") + (chatInput && "\n[User]: " + chatInput),
            }),
        });
        if (!chat.ok) {
            setError("error status in chat response: " + chat.statusText);
        }

        if (chatInput) setChatHistory((prev) => [...prev, "[User]: " + chatInput]);

        const data = chat.body;
        if (!data) {
            setError("Response stream not available");
            return;
        }

        // read the response stream
        const reader = data.getReader();
        const decoder = new TextDecoder();
        let done = false;

        setIsLoading(false);
        setAnswer("");
        setChatInput("");

        const chunks: string[] = [];
        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = decoder.decode(value);
            chunks.push(chunkValue);

            setAnswer((prev) => prev + chunkValue);
        }
        setChatHistory((prev) => [...prev, "[Assistant]: " + chunks.join("")]);
        isChatDone(chunks.join("").trim().includes("[Done]"));
    }

    async function find() {
        const lastResponse = chatHistory[chatHistory.length - 1];
        console.log("lastResponse", lastResponse);
        const data = JSON.parse(
            lastResponse.substring(lastResponse.indexOf("{"), lastResponse.indexOf("}") + 1)
        );
        console.log(data);

        const matches = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: (data.interests || data.interest) + " " + (data.hobbies || data.hobby),
                location: null,
                degree: null,
            }),
        });
        if (!matches.ok) {
            setError("error status in match response: " + matches.statusText);
        }

        const matchesJson = await matches.json();
        console.log(matchesJson);
        const matchesStr = matchesJson.map(
            (m: any) =>
                `Scholarship Title: ${m.title}, Degree: ${m.degree}, Location: ${m.location}, Funds: ${m.funds}.`
        );

        const answer = await fetch("/api/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userInfo: JSON.stringify(data),
                scholarships: matchesStr.join(" "),
            }),
        });
        if (!answer.ok) {
            setError("error status in match response: " + answer.statusText);
        }

        const answerData = answer.body;
        if (!answerData) {
            setError("Response stream not available");
            return;
        }

        // read the response stream
        const reader = answerData.getReader();
        const decoder = new TextDecoder();
        let done = false;

        setIsLoading(false);
        setAnswer("");

        const chunks: string[] = [];
        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = decoder.decode(value);
            chunks.push(chunkValue);

            setAnswer((prev) => prev + chunkValue);
        }
    }

    useEffect(() => {
        // start chatting
        if (chatHistory.length == 0) chat();
    }, [chatHistory]);

    useEffect(() => {
        if (chatDone) {
            console.log("chat done");
            find();
        }
    }, [chatDone]);

    return (
        <>
            <div className="container relative mx-auto max-w-5xl p-6">
                {error && <div className="mt-4 font-semibold text-red-600">{error}</div>}

                <div className="flex flex-col shadow-lg rounded-lg mt-4">
                    {answer && (
                        <div className="relative w-full">
                            <div
                                className={`w-full flex-1 items-center rounded-lg border px-4 py-4 shadow-md ${
                                    isLoading && "opacity-25"
                                }`}
                            >
                                <Answer text={answer} />
                            </div>
                        </div>
                    )}

                    {chatHistory.length > 1 && (
                        <div className="relative w-full max-h-96 min-h-max overflow-y-auto">
                            <div className="w-full flex-1 items-center rounded-lg border px-4 py-4 shadow-md">
                                <div className="flex flex-col gap-6 text-gray-500">
                                    {chatHistory
                                        .slice(0, chatHistory.length - 1)
                                        .reverse()
                                        .map((ch, i) => (
                                            <div key={i}>{ch}</div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center rounded-lg border px-4 py-2 shadow-md">
                        <ChatBubbleLeftIcon className="inline h-6 fill-current text-teal-700" />
                        <input
                            type="text"
                            value={chatInput}
                            className="ml-2 w-full appearance-none border-0 p-2 text-xl text-gray-600 focus:outline-none focus:ring-0 md:p-4 md:text-2xl"
                            placeholder="Lets chat!"
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setChatInput(e.currentTarget.value)
                            }
                            onKeyUp={(e: any) => {
                                if (e.keyCode == 13) chat();
                            }}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}
