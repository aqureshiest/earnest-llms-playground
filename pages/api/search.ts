import { createClient } from "@supabase/supabase-js";
import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

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

export default async function (req: NextApiRequest, res: NextApiResponse) {
    if (!configuration.apiKey) {
        res.status(500).json({
            error: {
                message: "OpenAI API key not configured",
            },
        });
        return;
    }

    try {
        const { query, location, degree } = req.body;
        const sanitizedQuery = query.replaceAll("\n", " ");

        // generate embedding for the search query
        const embedding = await generateEmbedding(sanitizedQuery);

        // search in database for similarity with the search query embeddings
        const { error: rpcError, data: rpcData } = await supabase.rpc("match_scholarships_intl", {
            embeddings: embedding,
            loc: location,
            deg: degree,
            match_threshold: 0.78,
            match_count: 10,
        });
        if (rpcError) {
            console.log("Error in finding matching embedding", rpcError);
            res.status(500).json({ error: rpcError });
        }

        res.status(200).json(rpcData);
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
