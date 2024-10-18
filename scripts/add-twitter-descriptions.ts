import "dotenv/config";
import { and, eq, isNotNull, isNull } from "drizzle-orm/expressions";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

// Utility function to chunk an array into smaller arrays of a specified size
function chunkArray<T>(array: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		result.push(array.slice(i, i + size));
	}
	return result;
}

// Function to update twitterDescription
async function updateTwitterDescriptions() {
	console.log("[updateTwitterDescriptions] Starting update process...");

	// Step 1: Select people where twitterData is not null
	const peopleWithTwitterData = await db
		.select({
			id: schema.people.id,
			twitterData: schema.people.twitterData,
		})
		.from(schema.people)
		.where(and(isNotNull(schema.people.twitterData), isNull(schema.people.twitterBio)))
		.execute();

	console.log(
		`[updateTwitterDescriptions] Found ${peopleWithTwitterData.length} people with twitterData.`
	);

	if (peopleWithTwitterData.length === 0) {
		console.log("[updateTwitterDescriptions] No people found with twitterData.");
		return;
	}

	// Step 2: Chunk the people into manageable batches (e.g., 100 per batch)
	const batchSize = 10000;
	const batches = chunkArray(peopleWithTwitterData, batchSize);

	// Step 3: Process each batch sequentially
	for (const [batchIndex, batch] of batches.entries()) {
		console.log(
			`[updateTwitterDescriptions] Processing batch ${batchIndex + 1} of ${batches.length}...`
		);

		// Process all people in the current batch concurrently
		await Promise.all(
			batch.map(async (person) => {
				const { id: personId, twitterData } = person;
				let twitterDescription: string | null = null;

				// Extract description from twitterData
				if (
					twitterData &&
					typeof twitterData === "object" &&
					"description" in twitterData
				) {
					const desc = (twitterData as any).description;
					if (typeof desc === "string" && desc.trim() !== "") {
						twitterDescription = desc.trim();
					}
				}

				if (twitterDescription === null) {
					console.log(
						`[updateTwitterDescriptions] No valid description found for person ID: ${personId}. Skipping update.`
					);
					return;
				}

				try {
					// Update the twitterDescription column
					await db
						.update(schema.people)
						.set({ twitterBio: twitterDescription })
						.where(eq(schema.people.id, personId));

					console.log(
						`[updateTwitterDescriptions] Updated twitterDescription for person ID: ${personId}`
					);
				} catch (error) {
					console.error(
						`[updateTwitterDescriptions] Failed to update twitterDescription for person ID: ${personId}`,
						error
					);
				}
			})
		);

		console.log(`[updateTwitterDescriptions] Completed processing batch ${batchIndex + 1}.`);
	}

	console.log("[updateTwitterDescriptions] Update process completed successfully.");
}

// Execute the main function
updateTwitterDescriptions()
	.then(() => {
		console.log("[updateTwitterDescriptions] Script finished successfully.");
		process.exit(0);
	})
	.catch((error) => {
		console.error("[updateTwitterDescriptions] Error during update process:", error);
		process.exit(1);
	});
