import "dotenv/config";
import { isNotNull, eq, or, isNull, and, inArray } from "drizzle-orm";
import { pinecone, openai } from "../src/lib/clients";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

const index = pinecone.Index("whop");

async function getEmbedding(text: string): Promise<number[]> {
	try {
		const response = await openai.embeddings.create({
			model: "text-embedding-3-large",
			input: text,
		});
		return response.data[0]!.embedding;
	} catch (error) {
		console.error("Error generating embedding:", error);
		throw error;
	}
}

async function upsertEmbeddingsToPinecone(
	embeddings: number[][],
	metadataList: any[],
	namespace: string
) {
	try {
		const vectors = embeddings.map((embedding, idx) => ({
			id: metadataList[idx].id,
			values: embedding,
			metadata: metadataList[idx],
		}));

		// Batch upsert for efficiency
		await index.namespace(namespace).upsert(vectors);

		console.log(`Upserted ${vectors.length} embeddings to namespace ${namespace}`);
	} catch (error) {
		console.error(`Error upserting embeddings to Pinecone namespace ${namespace}:`, error);
		throw error; // Re-throw error to handle in the calling function
	}
}

async function upsertTwitterBiosToPinecone() {
	try {
		// Fetch all users with a non-null twitterBio and isUpsertedInAllBios is false or null
		const users = await db
			.select()
			.from(schema.githubUsers)
			.where(
				and(
					isNotNull(schema.githubUsers.twitterBio),
					or(
						isNull(schema.githubUsers.isUpsertedInAllBios),
						eq(schema.githubUsers.isUpsertedInAllBios, false)
					)
				)
			);

		console.log(`Found ${users.length} users with Twitter bios to upsert.`);

		const batchSize = 25;

		for (let i = 0; i < users.length; i += batchSize) {
			const batchUsers = users.slice(i, i + batchSize);
			const embeddings: number[][] = [];
			const metadataList: any[] = [];
			const userIdsToUpdate: string[] = [];

			// Process each user in the batch
			for (const user of batchUsers) {
				const twitterBio = user.twitterBio;
				const username = user.twitterUsername;
				const userId = user.id;

				if (twitterBio) {
					try {
						// Generate embedding
						const embedding = await getEmbedding(twitterBio);

						// Prepare metadata
						const metadata = {
							id: `${username}-bio`,
							text: twitterBio,
							username,
							userId,
						};

						embeddings.push(embedding);
						metadataList.push(metadata);
						userIdsToUpdate.push(userId);
					} catch (error) {
						console.error(`Error processing user ${username}:`, error);
					}
				} else {
					console.log(`User ${username} has no Twitter bio.`);
				}

				// Optional: Delay between requests to avoid rate limits
				await new Promise((resolve) => setTimeout(resolve, 200));
			}

			// Upsert the batch to Pinecone
			if (embeddings.length > 0) {
				try {
					await upsertEmbeddingsToPinecone(embeddings, metadataList, "x-bio");
					console.log(
						`Upserted batch ${i / batchSize + 1} of ${Math.ceil(
							users.length / batchSize
						)} to Pinecone.`
					);

					// Update users in database to set isUpsertedInAllBios to true
					await db
						.update(schema.githubUsers)
						.set({ isUpsertedInAllBios: true })
						.where(inArray(schema.githubUsers.id, userIdsToUpdate));

					console.log(
						`Updated isUpsertedInAllBios to true for ${userIdsToUpdate.length} users.`
					);
				} catch (error) {
					console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
				}
			}

			// Delay between batches to avoid rate limits
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		console.log("Completed upserting Twitter bios to Pinecone.");
	} catch (error) {
		console.error("Error upserting Twitter bios to Pinecone:", error);
	}
}

// Run the script
upsertTwitterBiosToPinecone()
	.then(() => console.log("Process completed."))
	.catch((error) => console.error("Error in processing:", error));
