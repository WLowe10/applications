import { openai } from "./clients";

export async function getEmbedding(text: string) {
	const response = await openai.embeddings.create({
		model: "text-embedding-3-large",
		input: text,
		encoding_format: "float",
	});

	// i believe the response.data array always has a single element
	return response.data[0]!.embedding;
}
