import { openai } from "./clients";

export async function getEmbedding(text: string) {
	const response = await openai.embeddings.create({
		model: "text-embedding-3-large",
		input: text,
		encoding_format: "float",
	});

	return response.data[0]!.embedding;
}
