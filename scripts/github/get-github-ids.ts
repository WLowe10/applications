import "dotenv/config";
import fs from "fs/promises";
import { graphql } from "@octokit/graphql";
import { and, isNotNull, isNull } from "drizzle-orm";
import { RateLimiter } from "../../src/utils/rate-limiter";
import { env } from "../../src/lib/env";
import { db } from "../../src/server/db";
import * as schema from "../../src/server/db/schema";

const rateLimiter = new RateLimiter();

async function updateGithubIds() {
	console.log("Starting to update GitHub IDs");

	const allUsers = await db
		.select({ githubLogin: schema.people.githubLogin })
		.from(schema.people)
		.where(and(isNotNull(schema.people.githubLogin), isNull(schema.people.githubImage)))
		.limit(100000);

	console.log(`Found ${allUsers.length} users to process`);

	const concurrencyLimit = 100;
	const chunkedUsers = chunkArray(allUsers, concurrencyLimit);

	for (const userChunk of chunkedUsers) {
		await Promise.all(
			userChunk.map(async (user) => {
				try {
					await processUser(user as { githubLogin: string });
					console.log(`Successfully processed user: ${user.githubLogin}`);
				} catch (error) {
					console.error(`Error processing user ${user.githubLogin}:`, error);
				}
			})
		);
		await new Promise((resolve) => setTimeout(resolve, 20000));
	}

	console.log("Finished updating GitHub IDs for all users");
}

function chunkArray<T>(array: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		result.push(array.slice(i, i + size));
	}
	return result;
}

async function processUser(user: { githubLogin: string }) {
	console.log(`Fetching GitHub ID for user: ${user.githubLogin}`);
	await new Promise((resolve) => setTimeout(resolve, 1000));

	try {
		const result: any = await rateLimiter.execute(async () => {
			return graphql<any>({
				query: `
        query($login: String!) {
          user(login: $login) {
            id
            login
            avatarUrl
          }
        }
      `,
				login: user.githubLogin,
				headers: {
					authorization: `Bearer ${env.GITHUB_TOKEN}`,
				},
			});
		});

		console.log(`Result:`, result);

		const avatarUrl = result.user.avatarUrl as string;
		console.log(`Found GitHub ID for ${user.githubLogin}: Avatar URL: ${avatarUrl}`);

		// Write SQL statement to file instead of updating the database
		const sqlStatement = `update people set github_image='${avatarUrl}' where github_login='${user.githubLogin}';\n`;
		await fs.appendFile("get-github.sql", sqlStatement);
		console.log(`SQL statement written for ${user.githubLogin}`);
	} catch (error) {
		console.error(`Error processing user ${user.githubLogin}:`, error);
	}
}

// Call the function to update GitHub IDs
updateGithubIds().catch((error) => console.error("Error in updateGithubIds function:", error));
