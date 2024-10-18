import "dotenv/config";
import { eq } from "drizzle-orm/expressions";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

// Function to copy data from githubUsers to people
async function copyGitHubDataToPeople() {
	console.log("[copyGitHubDataToPeople] Starting the data copy process...");

	// Fetch all people with a matching githubLogin in githubUsers
	const peopleWithGitHub = await db
		.select()
		.from(schema.people)
		.innerJoin(schema.githubUsers, eq(schema.people.githubLogin, schema.githubUsers.login))
		.execute();

	console.log(`[copyGitHubDataToPeople] Found ${peopleWithGitHub.length} people to process.`);

	const batchSize = 1000;
	const batches = [];

	for (let i = 0; i < peopleWithGitHub.length; i += batchSize) {
		batches.push(peopleWithGitHub.slice(i, i + batchSize));
	}

	console.log(`[copyGitHubDataToPeople] Processing ${batches.length} batches.`);

	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex]!;

		console.log(
			`[copyGitHubDataToPeople] Processing batch ${batchIndex + 1}/${batches.length}`
		);

		await Promise.all(
			batch.map(async (person) => {
				const {
					people: { id: personId },
					github_users: githubUser,
				} = person;

				const user = githubUser;

				// Update the people table with the corresponding data
				try {
					await db
						.update(schema.people)
						.set({
							followers: user.followers,
							following: user.following,
							followerToFollowingRatio: user.followerToFollowingRatio,
							contributionYears: user.contributionYears,
							totalCommits: user.totalCommits,
							restrictedContributions: user.restrictedContributions,
							totalRepositories: user.totalRepositories,
							totalStars: user.totalStars,
							totalForks: user.totalForks,
							githubLanguages: user.languages,
							uniqueTopics: user.uniqueTopics,
							externalContributions: user.externalContributions,
							totalExternalCommits: user.totalExternalCommits,
							sponsorsCount: user.sponsorsCount,
							sponsoredProjects: user.sponsoredProjects,
							organizations: user.organizations,
							githubBio: user.bio,
							twitterFollowerCount: user.twitterFollowerCount,
							twitterFollowingCount: user.twitterFollowingCount,
							twitterFollowerToFollowingRatio: user.twitterFollowerToFollowingRatio,
							tweets: user.tweets,
						})
						.where(eq(schema.people.id, personId))
						.execute();

					console.log(
						`[copyGitHubDataToPeople] Updated person ID: ${personId} with GitHub data.`
					);
				} catch (error) {
					console.error(
						`[copyGitHubDataToPeople] Failed to update person ID: ${personId}`,
						error
					);
				}
			})
		);
	}

	console.log("[copyGitHubDataToPeople] Data copy process completed.");
}

// Execute the main function
copyGitHubDataToPeople()
	.then(() => {
		console.log("[copyGitHubDataToPeople] Script finished successfully.");
		process.exit(0);
	})
	.catch((error) => {
		console.error("[copyGitHubDataToPeople] Error during processing:", error);
		process.exit(1);
	});
