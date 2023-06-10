import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { Configuration, OpenAIApi } from "openai";
import fs from "fs";

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

async function loadPosts() {
    console.log("Loading posts from the database");

    // read from database
    const { error, data: posts } = await supabase.from("reddit_posts").select("*");

    if (error) {
        console.error("Error in reading titles from database");
        throw error;
    }

    const docs = posts.map((post) => {
        return {
            title: post.title,
            metadataJson: JSON.stringify({
                url: post.url,
                numComments: post.num_comments,
                score: post.score,
            }),
            text: post.body,
        };
    });

    return docs;
}

async function main() {
    const posts = await loadPosts();
    const doc = {
        documentId: "redditposts1",
        title: "redditposts",
        section: posts,
    };

    fs.writeFile("./data/redditposts.json", JSON.stringify(doc, null, 1), "utf-8", () =>
        console.log("done")
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
