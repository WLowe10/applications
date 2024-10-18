import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

async function computeTopTechnologies(companyId: string) {
	const companyDb = await db.query.company.findFirst({
		with: {
			candidates: {
				where: eq(schema.candidates.isEngineer, true),
			},
		},
		where: eq(schema.company.id, companyId),
	});

	if (!companyDb) return;

	const techFrequencyMap: Record<string, number> = {};

	companyDb.candidates.forEach((candidate) => {
		candidate.topTechnologies?.forEach((tech: string) => {
			techFrequencyMap[tech] = (techFrequencyMap[tech] || 0) + 1;
		});
	});

	const topTechnologies = Object.entries(techFrequencyMap)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20)
		.map((entry) => entry[0]);

	await db
		.update(schema.company)
		.set({ topTechnologies })
		.where(eq(schema.company.id, companyId));

	console.log(`Updated company ${companyId} with top technologies.`);
}

async function main() {
	const companiesList = await db.query.company.findMany();

	for (const company of companiesList) {
		await computeTopTechnologies(company.id);
	}

	console.log("All companies updated with top technologies.");
}

main().catch((error) => {
	console.error("Error updating companies:", error);
});
