import "dotenv/config";
import { inArray } from "drizzle-orm";
import { openai, pinecone } from "@/lib/clients";
import { db } from "../server/db";
import * as schema from "@/server/db/schema";

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

async function searchCandidates() {
	try {
		// Qualifications text
		const qualificationsText = `
      Strong understanding of AWS services, including Aurora/RDS, OpenSearch, ECS, and S3
      Experience with CI/CD tools, particularly GitHub Actions and self-hosted runners
      Excellent documentation and communication skills
      Strong networking knowledge, including VPCs, DNS, and Cloudflare
      Expertise in security measures, including rate limits and WAF rules
      Ability to manage and optimize infrastructure for performance and scalability
      Proactive approach to monitoring and maintaining infrastructure health
      Experience with disaster recovery planning and execution
      Familiarity with distributed tracing, logging, and observability tools (NewRelic)
      Deep knowledge of HTTP and networking concepts, including load balancers or web sockets
      Experience scaling Ruby on Rails applications
      Nice to haves
      Experience with Next.js / Vercel
      Experience with Terraform
      Proficiency in Infrastructure as Code (IAC) with Pulumi and TypeScript
    `;

		// Get embedding for the qualifications text
		const qualificationsEmbedding = await getEmbedding(qualificationsText);

		// Query Pinecone's x-bio namespace for the top 100 most similar bios
		const queryResponse = await index.namespace("x-bio").query({
			topK: 100,
			vector: qualificationsEmbedding,
			includeMetadata: true,
			includeValues: false,
		});

		const matches = queryResponse.matches ?? [];

		// Extract user IDs and similarity scores from the matches
		const userIdToSimilarity: Record<string, number> = {};
		for (const match of matches) {
			const userId = match.metadata?.userId;
			const similarity = match.score ?? 0;
			if (userId) {
				userIdToSimilarity[userId as string] = similarity;
			}
		}

		const userIds = Object.keys(userIdToSimilarity);

		// Fetch user data from the database for the matched user IDs
		const users = await db
			.select()
			.from(schema.githubUsers)
			.where(inArray(schema.githubUsers.id, userIds));

		console.log(`Found ${users.length} users matching the query.`);

		const results: {
			userId: string;
			username: string;
			totalScore: number;
			locationScore: number;
			similarityScore: number;
			followerCountScore: number;
			followerRatioScore: number;
			avgLikesScore: number;
			normalizedLocation: string | null;
			twitterFollowerCount: number | null;
			twitterFollowingCount: number | null;
			twitterFollowerToFollowingRatio: number | null;
			twitterBio: string;
		}[] = [];

		for (const user of users) {
			const twitterBio = user.twitterBio!;
			const username = user.twitterUsername ?? "unknown";
			const userId = user.id;
			const normalizedLocation = user.normalizedLocation;

			// Initialize score components
			let locationScore = 0;
			let similarityScore = 0;
			let followerCountScore = 0;
			let followerRatioScore = 0;
			let avgLikesScore = 0;

			// Check if the user is in New York using normalizedLocation
			const isInNewYork = normalizedLocation === "NEW YORK";
			if (isInNewYork) {
				locationScore = 2.5; // Increase score if in New York
			}

			// Get similarity score from Pinecone query
			const similarity = userIdToSimilarity[userId] ?? 0;
			similarityScore = similarity * 5; // Adjust the weight as needed

			// Factor in Twitter follower count and ratio
			const followerCount = user.twitterFollowerCount ?? 0;
			const followerRatio = user.twitterFollowerToFollowingRatio ?? 0;

			// Normalize follower count (e.g., logarithmic scale)
			const normalizedFollowerCount = Math.log10(followerCount + 1); // Logarithmic scale
			followerCountScore = normalizedFollowerCount * 0.5; // Adjust the weight as needed

			// Factor in follower ratio
			const normalizedFollowerRatio = Math.min(followerRatio / 10, 1); // Cap at 1
			followerRatioScore = normalizedFollowerRatio * 0.5; // Adjust the weight as needed

			let avgLikes = 0;
			if (user.tweets && Array.isArray(user.tweets)) {
				const tweets = user.tweets;
				const totalLikes = tweets.reduce((sum, tweet) => {
					return sum + (tweet.favorite_count || 0);
				}, 0);
				avgLikes = tweets.length > 0 ? totalLikes / tweets.length : 0;
			}

			const normalizedAvgLikes = Math.log10(avgLikes + 1); // Logarithmic scale
			avgLikesScore = normalizedAvgLikes * 0.5;

			// Calculate total score
			const totalScore =
				locationScore +
				similarityScore +
				followerCountScore +
				followerRatioScore +
				avgLikesScore;

			// Collect the result
			results.push({
				userId,
				username,
				totalScore,
				locationScore,
				similarityScore,
				followerCountScore,
				followerRatioScore,
				avgLikesScore,
				normalizedLocation,
				twitterFollowerCount: followerCount,
				twitterFollowingCount: user.twitterFollowingCount ?? 0,
				twitterFollowerToFollowingRatio: followerRatio,
				twitterBio,
			});
		}

		// Sort the results by score in descending order
		results.sort((a, b) => b.totalScore - a.totalScore);

		// Output the top results
		console.log("Top candidates:");
		for (const result of results.slice(0, 50)) {
			console.log(
				`https://x.com/${result.username}, Total Score: ${result.totalScore.toFixed(2)} ` +
					`(Location: ${result.locationScore.toFixed(2)}, ` +
					`Similarity: ${result.similarityScore.toFixed(2)}, ` +
					`Follower Count: ${result.followerCountScore.toFixed(2)}, ` +
					`Follower Ratio: ${result.followerRatioScore.toFixed(2)}, ` +
					`Avg Likes: ${result.avgLikesScore.toFixed(2)}), ` +
					`Location: ${result.normalizedLocation ?? "Unknown"}, ` +
					`Followers: ${result.twitterFollowerCount}`
			);
		}

		// Optionally, save the results to a file
		// import fs from 'fs';
		// fs.writeFileSync('top_candidates.json', JSON.stringify(results, null, 2));
	} catch (error) {
		console.error("Error in searchCandidates:", error);
	}
}

searchCandidates();
