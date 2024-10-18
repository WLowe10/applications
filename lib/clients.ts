import { OpenAI } from "openai";
import { env } from "./env";
import { Pinecone } from "@pinecone-database/pinecone";

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY,
});
