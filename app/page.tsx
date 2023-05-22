"use client";

import Link from "next/link";

export default function Home() {
    return (
        <>
            <div className="container relative mx-auto max-w-5xl p-6">
                <div className="flex items-center justify-center flex-col gap-8">
                    <Link
                        href="/scholarships"
                        className="p-4 border rounded-lg text-lg bg-gray-50 hover:bg-gray-100"
                    >
                        Scholarship Search - OpenAI APIs
                    </Link>
                    <Link
                        href="/scholarships2"
                        className="p-4 border rounded-lg text-lg bg-gray-50 hover:bg-gray-100"
                    >
                        Scholarship Search - Chatbot
                    </Link>
                </div>
            </div>
        </>
    );
}
