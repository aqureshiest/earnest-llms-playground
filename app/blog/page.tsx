"use client";

import { ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import { ChangeEvent, useEffect, useState } from "react";
import { Answer } from "../../components/Answer";
import { EventStreamContentType, fetchEventSource } from "@microsoft/fetch-event-source";
import { useRouter } from "next/navigation";

export default function Home() {
    const router = useRouter();

    const [answer, setAnswer] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const [chatInput, setChatInput] = useState("");
    const [chatHistory, setChatHistory] = useState<string[]>([]);

    async function ask() {
        setIsLoading(true);

        if (!chatInput) return;
        else setChatHistory((prev) => [...prev, "[User] " + chatInput]);

        const response: string[] = [];
        const chat = await fetchEventSource("/api/blog", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input: chatInput,
                history: chatHistory,
            }),
            async onopen(response) {
                if (
                    response.ok &&
                    response.headers.get("content-type") === EventStreamContentType
                ) {
                    setIsLoading(false);
                    setAnswer("");
                    setChatInput("");
                    return; // everything's good
                }
            },
            onmessage(ev) {
                setAnswer((prev) => prev + ev.data);
                response.push(ev.data);
            },
            onclose() {
                if (response.length > 0) {
                    console.log(response.join(""));
                    setChatHistory((prev) => [...prev, "[Assistant] " + response.join("")]);
                }
            },
            onerror(err) {
                setError("error status in chat response: " + err);
            },
        });
    }

    return (
        <>
            <div className="container relative mx-auto max-w-5xl p-6">
                {error && <div className="mt-4 font-semibold text-red-600">{error}</div>}

                <h1 className="text-2xl uppercase tracking-wider">Ask me anything about Earnest</h1>

                <div className="flex flex-col mt-4">
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
                        <div className="relative w-full mt-2">
                            <div className="w-full flex-1 items-center rounded-lg border px-4 py-4 shadow-md max-h-96 min-h-max overflow-y-auto ">
                                <div className="flex flex-col gap-6 text-gray-500">
                                    {chatHistory
                                        .slice(0, chatHistory.length - 1)
                                        .reverse()
                                        .map((ch, i) => (
                                            <div
                                                className="prose-em"
                                                key={i}
                                                dangerouslySetInnerHTML={{ __html: ch }}
                                            />
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center rounded-lg border px-4 py-2 shadow-md mt-2">
                        <ChatBubbleLeftIcon className="inline h-6 fill-current text-teal-700" />
                        <input
                            type="text"
                            value={chatInput}
                            className="ml-2 w-full appearance-none border-0 p-2 text-lg text-gray-600 focus:outline-none focus:ring-0 md:p-4 md:text-2xl bg-transparent"
                            placeholder="Lets chat!"
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setChatInput(e.currentTarget.value)
                            }
                            onKeyUp={(e: any) => {
                                if (e.keyCode == 13) ask();
                            }}
                        />
                    </div>

                    <div className="mt-4">
                        <div className="flex items-center justify-end"></div>
                    </div>
                </div>
            </div>
        </>
    );
}
