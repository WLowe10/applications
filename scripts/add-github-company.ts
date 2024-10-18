import "dotenv/config";
import { graphql } from "@octokit/graphql";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { RateLimiter } from "../src/utils/rate-limiter";
import { env } from "../src/lib/env";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

const rateLimiter = new RateLimiter();

// Function to fetch the company information of a GitHub user
const fetchUserCompany = async (username: string) => {
	const query = `
    query($login: String!) {
      user(login: $login) {
        company
      }
    }
  `;

	try {
		const result = await rateLimiter.execute(() =>
			graphql({
				query,
				login: username,
				headers: {
					authorization: `Bearer ${env.GITHUB_TOKEN}`,
				},
			})
		);

		return result ? (result as any).user.company : null;
	} catch (error) {
		console.error(`Error fetching company for user: ${username}`, error);
		return null;
	}
};

// Function to update the company field in the database
const updateUserCompany = async (personId: string, company: string | null) => {
	try {
		await db
			.update(schema.people)
			.set({
				githubCompany: company || null,
				isGithubCompanyChecked: true,
			})
			.where(eq(schema.people.id, personId));
		console.log(`Updated company for person ID: ${personId}`);
	} catch (error) {
		console.error(`Error updating company for person ID: ${personId}`, error);
	}
};

// Function to process a batch of users
const processBatch = async (users: any[]) => {
	for (const user of users) {
		const { id: personId, githubLogin } = user;

		// Fetch the company information from GitHub
		const company = await fetchUserCompany(githubLogin!);

		// Update the company in the database
		await updateUserCompany(personId, company);
	}
};

// Main function to process users in the database
const processUsers = async () => {
	console.log("[processUsers] Starting company update process...");

	// Fetch users from the database
	const users = await db
		.select({
			id: schema.people.id,
			githubLogin: schema.people.githubLogin,
		})
		.from(schema.people)
		.where(
			and(
				isNull(schema.people.githubCompany),
				eq(schema.people.isGithubCompanyChecked, false),
				isNotNull(schema.people.githubLogin)
			)
		);

	console.log(`[processUsers] Found ${users.length} users to process.`);

	// Process users in batches of 1000
	const batchSize = 1000;
	for (let i = 0; i < users.length; i += batchSize) {
		const batch = users.slice(i, i + batchSize);
		await processBatch(batch);
		console.log(`[processUsers] Processed batch ${i / batchSize + 1}`);
	}

	console.log("[processUsers] Company update process completed.");
};

// Execute the main function
processUsers()
	.then(() => {
		console.log("[processUsers] Script finished successfully.");
		process.exit(0);
	})
	.catch((error) => {
		console.error("[processUsers] Error during processing:", error);
		process.exit(1);
	});
