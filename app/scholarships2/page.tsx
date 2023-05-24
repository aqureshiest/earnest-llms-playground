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
    const [chatStarted, isChatStarted] = useState(false);
    const [chatHistory, setChatHistory] = useState<string[]>([]);
    const [canSearchForScholarships, setCanSearchForScholarship] = useState(false);

    async function chat(starting: boolean = false) {
        setIsLoading(true);

        if (chatInput) setChatHistory((prev) => [...prev, "[User] " + chatInput]);

        const response: string[] = [];
        const chat = await fetchEventSource("/api/chatai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                input: chatInput,
                history: starting ? getChatHistoryFromLS() : chatHistory,
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
                    setCanSearchForScholarship(
                        response.join("").trim().includes('<span class="hidden"') ||
                            response.join("").trim().includes("<span class='hidden'")
                    );
                }
            },
            onerror(err) {
                setError("error status in chat response: " + err);
            },
        });
    }

    async function find() {
        setCanSearchForScholarship(false);
        setIsLoading(true);

        const lastResponse = chatHistory[chatHistory.length - 1];
        console.log("lastResponse", lastResponse);
        const data = JSON.parse(
            lastResponse.substring(lastResponse.indexOf("{"), lastResponse.indexOf("}") + 1)
        );
        console.log(data);

        const query = (data.interests || data.interest) + " " + (data.hobbies || data.hobby);
        const results = await Promise.all(
            query.split(",").map(async (q) => {
                const matches = await fetch("/api/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query: q,
                        location: null,
                        degree: null,
                    }),
                });
                if (!matches.ok) {
                    setError("error status in match response: " + matches.statusText);
                }

                const matchesJson = await matches.json();
                console.log(matchesJson);
                return matchesJson.map(
                    (m: any) =>
                        `Scholarship Title: ${m.title}, Degree: ${m.degree}, Location: ${m.location}, Funds: ${m.funds}.`
                );
            })
        );
        console.log(results.join(" "));

        const answer = await fetch("/api/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userInfo: JSON.stringify(data),
                scholarships: results.join(" "),
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

    function getChatHistoryFromLS() {
        // check for previous history
        const previousChatHistory = window.localStorage.getItem("chat_history");
        const prevChatHistoryArr = previousChatHistory ? JSON.parse(previousChatHistory) : [];
        setChatHistory(prevChatHistoryArr);
        return prevChatHistoryArr;
    }

    useEffect(() => {
        // start chatting
        if (!chatStarted) {
            isChatStarted(true);
            chat(true);
        }
    }, [chatStarted]);

    useEffect(() => {
        if (chatHistory.length > 0) {
            console.log("storing chat history in local storage", chatHistory);
            window.localStorage.setItem("chat_history", JSON.stringify(chatHistory));
        }
    }, [chatHistory]);

    return (
        <>
            <div className="container relative mx-auto max-w-5xl p-6">
                {error && <div className="mt-4 font-semibold text-red-600">{error}</div>}

                <div className="flex flex-col mt-4">
                    {answer && (
                        <div className="relative w-full">
                            <div
                                className={`w-full flex-1 items-center rounded-lg border px-4 py-4 shadow-md ${
                                    isLoading && "opacity-25"
                                }`}
                            >
                                <Answer text={answer} />
                                {canSearchForScholarships && (
                                    <button
                                        className="mt-2 bg-teal-700 rounded-md px-4 py-2 text-white"
                                        onClick={() => find()}
                                    >
                                        Show me the Scholarships
                                    </button>
                                )}
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
                                            <div key={i}>{ch}</div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center rounded-lg border px-4 py-2 shadow-md mt-2">
                        <ChatBubbleLeftIcon className="inline h-6 fill-current text-teal-700 " />
                        <input
                            type="text"
                            value={chatInput}
                            className="ml-2 w-full appearance-none border-0 p-2 text-xl text-gray-600 focus:outline-none focus:ring-0 md:p-4 md:text-2xl bg-transparent"
                            placeholder="Lets chat!"
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setChatInput(e.currentTarget.value)
                            }
                            onKeyUp={(e: any) => {
                                if (e.keyCode == 13) chat();
                            }}
                        />
                    </div>

                    <div className="mt-4">
                        <div className="flex items-center justify-end">
                            <button
                                className="px-2 py-1 rounded-md border bg-gray-50 hover:bg-gray-100"
                                onClick={() => {
                                    window.localStorage.removeItem("chat_history");
                                    setChatHistory([]);
                                    chat(true);
                                }}
                            >
                                Start Over
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
