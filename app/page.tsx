// "use client";

import { Experiment } from "@/components/Experiment";
import Link from "next/link";

export default function Home() {
    return (
        <>
            <div className="container relative mx-auto max-w-5xl p-6">
                <h1 className="text-2xl mb-4 text-teal-900 uppercase tracking-wide">Experiments</h1>

                <div className="flex flex-col gap-4">
                    <Experiment
                        heading="Scholarships Search"
                        subheading="Chatbot"
                        link="/scholarships2"
                    >
                        <h2 className="mb-1 font-semibold">Expriment Description</h2>
                        <p className="">
                            This bot will have a conversation with you and ask you questions to help
                            you match with scholarships that align with your interests
                        </p>
                        <h2 className="font-semibold mb-1 mt-4">
                            Information collected by the bot
                        </h2>
                        <ol className="">
                            <li>- user name</li>
                            <li>- where they live</li>
                            <li>- education information</li>
                            <li>- how much loan is needed</li>
                            <li>- interests and hobbies</li>
                        </ol>
                    </Experiment>

                    <Experiment
                        heading="Tell me about Earnest"
                        subheading="Answering Questions"
                        link="/blog"
                    >
                        <h2 className="font-semibold mb-1">Expriment Description</h2>
                        <p className="">
                            You can ask this bot questions that it will attempt to answer from
                            information collected from Earnest blogs
                        </p>
                        <h2 className="font-semibold mb-1 mt-4">Example Questions</h2>
                        <ol className="">
                            <li>- what can Earnest do for me</li>
                            <li>- what is precision pricing</li>
                        </ol>
                    </Experiment>
                </div>
            </div>
        </>
    );
}
