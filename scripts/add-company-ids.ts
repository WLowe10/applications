import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

async function updateCandidateCompanyIds() {
	const batchSize = 500;
	let offset = 0;
	let totalUpdated = 0;
	const updateBatchSize = 500;

	while (true) {
		// Fetch candidates in batches
		const candidates = await db
			.select()
			.from(schema.candidates)
			.limit(batchSize)
			.offset(offset);

		if (candidates.length === 0) break;

		const updates = [];

		for (const candidate of candidates) {
			// Extract LinkedIn URLs from position history
			const companyLinkedInUrls = candidate.linkedinData.positions.positionHistory
				.map((position: any) =>
					position.linkedInUrl?.endsWith("/")
						? position.linkedInUrl.slice(0, -1)
						: position.linkedInUrl
				)
				.filter(Boolean); // Filter out any undefined or null values

			if (companyLinkedInUrls.length === 0) continue;

			// Find matching companies
			const matchingCompanies = await db
				.select({ id: schema.company.id })
				.from(schema.company)
				.where(inArray(schema.company.linkedinUrl, companyLinkedInUrls));

			const companyIds = matchingCompanies.map((company) => company.id);

			// Add update to the batch
			updates.push({
				id: candidate.id,
				companyIds: companyIds,
			});

			if (updates.length >= updateBatchSize) {
				await performBatchUpdate(updates);
				totalUpdated += updates.length;
				updates.length = 0; // Clear the updates array
			}
		}

		// Perform any remaining updates
		if (updates.length > 0) {
			await performBatchUpdate(updates);
			totalUpdated += updates.length;
		}

		offset += batchSize;
		console.log(`Processed ${offset} candidates so far. Total updated: ${totalUpdated}`);
	}

	console.log(`All candidates updated successfully. Total updated: ${totalUpdated}`);
}

async function performBatchUpdate(updates: { id: string; companyIds: string[] }[]) {
	const updatePromises = updates.map((update) =>
		db
			.update(schema.candidates)
			.set({ companyIds: update.companyIds })
			.where(eq(schema.candidates.id, update.id))
	);

	await Promise.all(updatePromises);
	console.log(`Batch update completed for ${updates.length} candidates.`);
}

updateCandidateCompanyIds().catch(console.error);
