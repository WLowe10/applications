import "dotenv/config";
import { eq } from "drizzle-orm";
import { pinecone, openai } from "../src/lib/clients";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

const index = pinecone.Index("whop");

async function getEmbedding(text: string) {
	const response = await openai.embeddings.create({
		model: "text-embedding-3-large",
		input: text,
		encoding_format: "float",
	});

	return response.data[0]!.embedding;
}

async function computeAndStoreJobTitleAverages() {
	let processedCount = 0;

	const candidates = await db.query.candidates.findMany({
		where: eq(schema.candidates.isJobTitleAvgInVectorDB, false),
		columns: {
			id: true,
			jobTitles: true,
		},
	});

	console.log(`Retrieved ${candidates.length} candidates`);

	for (const candidate of candidates) {
		if (!candidate.jobTitles || candidate.jobTitles.length === 0) {
			continue;
		}

		const jobTitles = candidate.jobTitles;
		const jobTitleEmbeddings = await Promise.all(jobTitles.map(getEmbedding));
		const averageEmbedding = jobTitleEmbeddings.reduce(
			(acc, embedding) =>
				acc.map(
					(val: number, i: number) => val + embedding[i]! / jobTitleEmbeddings.length
				),
			new Array(jobTitleEmbeddings[0]!.length).fill(0)
		);

		await index.namespace("candidate-job-title-average").upsert([
			{
				id: candidate.id,
				values: averageEmbedding,
				metadata: {
					userId: candidate.id,
					jobTitles,
				},
			},
		]);

		await db
			.update(schema.candidates)
			.set({ isJobTitleAvgInVectorDB: true })
			.where(eq(schema.candidates.id, candidate.id));

		processedCount++;
		console.log(`Processed candidate ${candidate.id} (${processedCount} total)`);
	}

	console.log(`Completed processing ${processedCount} candidates.`);
}

computeAndStoreJobTitleAverages()
	.then(() => console.log("Script completed successfully."))
	.catch((error) => console.error("Error:", error));
