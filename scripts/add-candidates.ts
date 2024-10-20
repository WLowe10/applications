import "dotenv/config";
import axios from "axios";
import { v4 as uuid } from "uuid";
import { and, eq, isNotNull, ne, not, exists, inArray } from "drizzle-orm";
import { db } from "../src/server/db";
import { openai, pinecone } from "../src/lib/clients";
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

async function scrapeLinkedInProfile(linkedinUrl: string) {
	console.log(`Scraping LinkedIn profile for URL: ${linkedinUrl}`);
	const options = {
		method: "GET",
		url: `https://api.scrapin.io/enrichment/profile`,
		params: {
			apikey: process.env.SCRAPIN_API_KEY!,
			linkedInUrl: linkedinUrl,
		},
	};

	try {
		const response = await axios.request(options);
		console.log("Profile data fetched successfully.");
		return response.data;
	} catch (error) {
		console.error(`Error fetching LinkedIn profile data: ${error}`);
		return null;
	}
}

async function generateMiniSummary(profileData: any) {
	console.log("Generating mini summary...");
	const completion = await openai.chat.completions.create({
		messages: [
			{
				role: "system",
				content:
					"You are to take in this person's LinkedIn profile data, and generate a 1-2 sentence summary of their experience",
			},
			{
				role: "user",
				content: JSON.stringify(profileData),
			},
		],
		response_format: { type: "text" },
		model: "gpt-4o-mini",
		temperature: 0,
		max_tokens: 2048,
	});

	console.log("Mini summary generated.");
	return completion.choices[0]!.message.content;
}

async function gatherTopSkills(profileData: any) {
	console.log("Gathering top skills from profile data...");
	const skills = profileData.skills || [];
	const positions = profileData.positions.positionHistory
		.map((position: any) => position.description)
		.join(" ");

	const profileSummary = { skills, positions };

	const completion = await openai.chat.completions.create({
		messages: [
			{
				role: "system",
				content:
					"You are to take in this person's LinkedIn profile data and generate a JSON object with three fields: 'tech', 'features', and 'isEngineer'. The 'tech' field should contain a JSON array of strings representing the hard tech skills they are most familiar with. The 'features' field should contain a JSON array of strings representing the top hard features they have worked on the most. The 'isEngineer' field should be a boolean value indicating whether this person is likely an engineer based on their profile.",
			},
			{
				role: "user",
				content: JSON.stringify(profileSummary),
			},
		],
		response_format: { type: "json_object" },
		model: "gpt-4o-mini",
		max_tokens: 2048,
	});

	const result = JSON.parse(completion.choices[0]!.message.content ?? "") as {
		tech: string[];
		features: string[];
		isEngineer: boolean;
	};

	console.log("Top skills gathered.");
	return result;
}

async function askCondition(condition: string) {
	const completion = await openai.chat.completions.create({
		messages: [
			{
				role: "system",
				content:
					'You are to return a valid parseable JSON object with one attribute "condition" which can either be true or false. All questions users ask will always be able to be answered in a yes or no. An example response would be { "condition": true }',
			},
			{
				role: "user",
				content: condition,
			},
		],
		response_format: { type: "json_object" },
		model: "gpt-4o-mini",
		temperature: 0,
		max_tokens: 256,
	});

	const result = JSON.parse(completion.choices[0]!.message.content ?? '{ "condition": false }')
		.condition as boolean;

	return result;
}

async function generateSummary(profileData: any) {
	console.log("Generating summary for profile data...");
	const completion = await openai.chat.completions.create({
		messages: [
			{
				role: "system",
				content:
					"You are to take in this person's LinkedIn profile data, and generate a list of their hard skills amount of experience and specification",
			},
			{
				role: "user",
				content: JSON.stringify(profileData),
			},
		],
		response_format: { type: "text" },
		model: "gpt-4o-mini",
		temperature: 0,
		max_tokens: 2048,
	});
	console.log("Summary generated.");
	return completion.choices[0]!.message.content;
}

async function upsertToVectorDB(
	id: string,
	namespace: string,
	items: string[],
	candidateId: string,
	name: string
) {
	for (const item of items) {
		if (/^[\x00-\x7F]*$/.test(item)) {
			const embedding = await getEmbedding(item);
			await index.namespace(namespace).upsert([
				{
					id: id,
					values: embedding,
					metadata: {
						candidateId,
						[name]: item,
					},
				},
			]);
		} else {
			console.log(`Skipping non-ASCII item: ${item}`);
		}
	}
}

async function computeAndStoreAverage(
	id: string,
	namespace: string,
	items: string[],
	candidateId: string,
	name: string
) {
	if (items.length === 0) return;

	const embeddings = await Promise.all(items.map(getEmbedding));
	const averageEmbedding = embeddings.reduce(
		(acc, embedding) => acc.map((val, i) => val + embedding[i]! / embeddings.length),
		new Array(embeddings[0]!.length).fill(0)
	);

	await index.namespace(namespace).upsert([
		{
			id: id,
			values: averageEmbedding,
			metadata: {
				userId: candidateId,
				[name]: items,
			},
		},
	]);
}

async function insertCandidate(profileData: any) {
	console.log("Inserting candidate into the database...");
	const miniSummary = await generateMiniSummary(profileData);
	const { tech, features, isEngineer } = await gatherTopSkills(profileData);

	// Extract job titles
	const jobTitles = profileData.positions.positionHistory.map((position: any) => position.title);

	console.log("Checking additional conditions for candidate...");
	const workedInBigTech = await askCondition(
		`Has this person worked in big tech? ${JSON.stringify(
			profileData.positions.positionHistory.map((experience: any) => experience.companyName),
			null,
			2
		)} ${profileData.summary} ${profileData.headline}`
	);

	const livesNearBrooklyn = await askCondition(
		`Does this person live within 50 miles of Brooklyn, New York, USA? Their location: ${profileData.location ?? "unknown location"} ${
			profileData.positions.positionHistory.length > 0
				? `or ${JSON.stringify(profileData.positions.positionHistory[0], null, 2)}`
				: ""
		}`
	);

	const summary = await generateSummary(profileData);
	const candidateId = uuid();

	// Insert into database
	try {
		await db.insert(schema.candidates).values({
			id: candidateId,
			url: profileData.linkedInUrl.replace(/\/$/, "") as string,
			linkedinData: profileData,
			miniSummary,
			summary,
			topTechnologies: tech,
			topFeatures: features,
			jobTitles,
			isEngineer,
			workedInBigTech,
			livesNearBrooklyn,
			createdAt: new Date(),
		});

		console.log(
			`Candidate ${profileData.firstName} ${profileData.lastName} inserted into the database. Candidate ID: ${candidateId}`
		);
	} catch {}

	// Upsert individual items to vector DB

	if (tech.length > 0) {
		await upsertToVectorDB(candidateId, "technologies", tech, candidateId, "technology");
	}

	if (jobTitles.length > 0) {
		await upsertToVectorDB(candidateId, "job-titles", jobTitles, candidateId, "jobTitle");
	}

	// Compute and store averages
	if (tech.length > 0) {
		await computeAndStoreAverage(
			candidateId,
			"candidate-skill-average",
			tech,
			candidateId,
			"skills"
		);
	}

	if (features.length > 0) {
		await computeAndStoreAverage(
			candidateId,
			"candidate-feature-average",
			features,
			candidateId,
			"features"
		);
	}

	if (jobTitles.length > 0) {
		await computeAndStoreAverage(
			candidateId,
			"candidate-job-title-average",
			jobTitles,
			candidateId,
			"jobTitles"
		);
	}

	// Update flags in the database
	await db
		.update(schema.candidates)
		.set({
			isSkillAvgInVectorDB: true,
			isFeatureAvgInVectorDB: true,
			isJobTitleAvgInVectorDB: true,
		})
		.where(eq(schema.candidates.id, candidateId));

	return candidateId;
}

function validateAndNormalizeLinkedInUrl(url: string): string | null {
	try {
		// Simple regex to extract hostname and pathname
		const match = url.match(/^(https?:\/\/)?([^\/]+)(\/.*)?$/i);
		if (!match) return null;

		let [, protocol, hostname, pathname] = match;

		if (!hostname?.endsWith("linkedin.com")) {
			return null;
		}

		protocol = "https://";

		if (hostname === "linkedin.com") {
			hostname = "www.linkedin.com";
		}

		pathname = pathname || "";
		if (!pathname.startsWith("/in/")) {
			return null;
		}

		pathname = pathname.replace(/\/$/, "");

		return `${protocol}${hostname}${pathname}`;
	} catch (error) {
		console.error(`Invalid URL: ${url}`);
		return null;
	}
}

async function main() {
	try {
		const input = await db
			.select()
			.from(schema.githubUsers)
			.where(
				and(
					isNotNull(schema.githubUsers.linkedinUrl),
					ne(schema.githubUsers.linkedinUrl, "")
				)
			);

		console.log("Total input URLs:", input.length);

		const urlUpdatePromises = input.map(async (user) => {
			const normalizedUrl = validateAndNormalizeLinkedInUrl(user.linkedinUrl!);
			if (normalizedUrl !== null && normalizedUrl !== user.linkedinUrl) {
				// Update the database with the normalized URL
				await db
					.update(schema.githubUsers)
					.set({ linkedinUrl: normalizedUrl })
					.where(eq(schema.githubUsers.id, user.id));
				console.log(
					`Updated URL for user ${user.id}: ${user.linkedinUrl} -> ${normalizedUrl}`
				);
				return normalizedUrl;
			} else if (normalizedUrl !== null) {
				return normalizedUrl;
			}
			return null;
		});

		const validProfileUrls = (await Promise.all(urlUpdatePromises)).filter(
			(url): url is string => url !== null
		);

		console.log("Valid and normalized URLs:", validProfileUrls.length);

		const existingUrls = await db
			.select({ url: schema.candidates.url })
			.from(schema.candidates)
			.where(inArray(schema.candidates.url, validProfileUrls));

		const existingUrlSet = new Set(existingUrls.map((row) => row.url));

		const newProfileUrls = validProfileUrls.filter((url) => !existingUrlSet.has(url));

		console.log("New URLs to process:", newProfileUrls.length);

		const batchSize = 10;
		const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

		for (let i = 0; i < newProfileUrls.length; i += batchSize) {
			const batch = newProfileUrls.slice(i, i + batchSize);
			await Promise.all(
				batch.map(async (profileUrl) => {
					console.log(`Processing URL: ${profileUrl}`);
					const scrapedData = await scrapeLinkedInProfile(profileUrl);
					if (scrapedData && scrapedData.success) {
						await insertCandidate(scrapedData.person);
					} else {
						console.error(
							`Failed to scrape or insert candidate for URL: ${profileUrl}`
						);
					}
				})
			);

			if (i + batchSize < newProfileUrls.length) {
				console.log("Waiting 2.5 seconds before processing next batch...");
				await delay(2500);
			}
		}
	} catch (error) {
		console.error("Error:", error);
	}
}

main().then(() => console.log("Process Completed"));
