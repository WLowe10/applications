import "dotenv/config";
import { pinecone } from "@/lib/clients";
import { db } from "../../src/server/db";
import * as schema from "../../src/server/db/schema";

const index = pinecone.Index("job-passes-linkedin");

const zeroVector = new Array(3072).fill(1);

async function upsertJobVectors() {
	try {
		const jobs = await db.select().from(schema.jobs);

		for (const job of jobs) {
			const namespaces = [
				`${job.jobSlug}-bio`,
				`${job.jobSlug}-posts`,
				`${job.jobSlug}-jobs`,
				`${job.jobSlug}-education`,
				`${job.jobSlug}-projects`,
			];

			for (const namespace of namespaces) {
				await index.namespace(namespace).upsert([
					{
						id: job.id,
						values: zeroVector,
						metadata: {
							jobId: job.id,
							jobTitle: job.jobTitle,
							jobSlug: job.jobSlug,
						},
					},
				]);
				console.log(`Upserted vector for job ${job.jobTitle} in namespace ${namespace}`);
			}
		}

		console.log("All job vectors upserted successfully.");
	} catch (error) {
		console.error("Error upserting job vectors:", error);
	}
}

async function main() {
	await upsertJobVectors();
}

main().then(() => console.log("Process completed"));
