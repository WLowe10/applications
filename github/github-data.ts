import { graphql } from "@octokit/graphql";
import { RateLimiter } from "./graphql";
import {
  gatherTopSkills,
  generateMiniSummary,
  scrapeLinkedInProfile,
  generateSummary,
} from "@/src/find-similar-profiles-linkedin-subscriber";
import {
  getNormalizedLocation,
  getNormalizedCountry,
} from "@/scripts/normalized-location-github";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const rateLimiter = new RateLimiter();

// Function to fetch Twitter data
async function getTwitterData(username: string): Promise<any | null> {
  try {
    const endpoint = `https://api.socialdata.tools/twitter/user/${encodeURIComponent(
      username
    )}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.SOCIAL_DATA_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      console.error(
        `Twitter user '${username}' not found (404). Marking as invalid.`
      );
      return null;
    }

    if (!response.ok) {
      console.error(
        `Failed to fetch Twitter data for ${username}: ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();

    if (data) {
      return data;
    } else {
      console.log(`No data found for Twitter username: ${username}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching Twitter data for ${username}:`, error);
    return null;
  }
}

async function fetchGitHubUserData(username: string): Promise<any | null> {
  console.log(`Fetching GitHub user data for username: ${username}`);

  const query = `
    query($login: String!) {
      user(login: $login) {
        login
        name
        bio
        location
        company
        websiteUrl
        twitterUsername
        email
        avatarUrl
        followers {
          totalCount
        }
        following {
          totalCount
        }
        repositories(first: 100, isFork: false, ownerAffiliations: OWNER) {
          totalCount
          nodes {
            name
            stargazerCount
            forkCount
            primaryLanguage {
              name
            }
            repositoryTopics(first: 10) {
              nodes {
                topic {
                  name
                }
              }
            }
          }
        }
        contributionsCollection {
          contributionYears
          totalCommitContributions
          restrictedContributionsCount
        }
        organizations(first: 100) {
          nodes {
            login
            name
            description
            membersWithRole {
              totalCount
            }
          }
        }
        sponsors(first: 100) {
          totalCount
          nodes {
            __typename
            ... on User {
              login
              name
            }
            ... on Organization {
              login
              name
            }
          }
        }
        socialAccounts(first: 10) {
          nodes {
            provider
            url
          }
        }
      }
    }
  `;

  try {
    const result: any = await rateLimiter.execute(async () => {
      return graphql<any>({
        query,
        login: username,
        headers: {
          authorization: `Bearer ${process.env.TOKEN_GITHUB}`,
        },
      });
    });

    const userData = result.user;

    // Extract LinkedIn URL if available
    let linkedinUrl: string | null = null;
    const linkedinAccount = userData.socialAccounts.nodes.find(
      (account: any) => account.provider.toLowerCase() === "linkedin"
    );
    if (linkedinAccount) {
      linkedinUrl = linkedinAccount.url;
    }

    // Calculate total commits
    const totalCommits =
      userData.contributionsCollection.totalCommitContributions +
      userData.contributionsCollection.restrictedContributionsCount;

    // Process GitHub languages
    const githubLanguages: Record<
      string,
      { repoCount: number; stars: number }
    > = {};
    userData.repositories.nodes.forEach((repo: any) => {
      if (repo.primaryLanguage) {
        const lang = repo.primaryLanguage.name;
        if (!githubLanguages[lang]) {
          githubLanguages[lang] = { repoCount: 0, stars: 0 };
        }
        githubLanguages[lang].repoCount++;
        githubLanguages[lang].stars += repo.stargazerCount;
      }
    });

    // Calculate total stars and forks
    const totalStars = userData.repositories.nodes.reduce(
      (sum: number, repo: any) => sum + repo.stargazerCount,
      0
    );
    const totalForks = userData.repositories.nodes.reduce(
      (sum: number, repo: any) => sum + repo.forkCount,
      0
    );

    // Process unique topics
    const uniqueTopics = new Set<string>();
    userData.repositories.nodes.forEach((repo: any) => {
      repo.repositoryTopics.nodes.forEach((topic: any) => {
        uniqueTopics.add(topic.topic.name);
      });
    });

    const normalizedLocation = await getNormalizedLocation(
      userData.location || ""
    );
    const normalizedCountry = await getNormalizedCountry(
      userData.location || ""
    );

    // Fetch LinkedIn data if LinkedIn URL is available
    let linkedinData = null;
    if (linkedinUrl) {
      const linkedinDataResult = await scrapeLinkedInProfile(linkedinUrl);
      linkedinData = linkedinDataResult.person;
    }

    // Fetch Twitter data if username is available
    let twitterData = null;
    if (userData.twitterUsername) {
      twitterData = await getTwitterData(userData.twitterUsername);
    }

    // Process Twitter data
    let twitterFollowerCount = null;
    let twitterFollowingCount = null;
    let twitterFollowerToFollowingRatio = null;
    let twitterBio = null;
    let twitterId = null;

    if (twitterData) {
      twitterFollowerCount = twitterData.followers_count || 0;
      twitterFollowingCount = twitterData.friends_count || 0;
      twitterFollowerToFollowingRatio =
        twitterFollowingCount > 0
          ? twitterFollowerCount / twitterFollowingCount
          : twitterFollowerCount;
      twitterBio = twitterData.description || null;
      twitterId = twitterData.id_str || null;
    }
    let isWhopUser = false;
    let isWhopCreator = false;
    if (userData.email) {
      const whopStatus = await checkWhopStatus(userData.email);
      console.log(`Whop status for ${userData.email}:`, whopStatus);
      if (whopStatus) {
        isWhopUser = whopStatus.is_user;
        isWhopCreator = whopStatus.is_creator;
      }
    }

    return {
      name: userData.name,
      email: userData.email,
      image: userData.avatarUrl,
      location: userData.location,
      normalizedLocation,
      normalizedCountry,
      linkedinUrl: linkedinUrl,
      linkedinData: linkedinData,
      githubLogin: userData.login,
      githubImage: userData.avatarUrl,
      githubId: userData.login,
      githubData: userData,
      githubBio: userData.bio,
      githubCompany: userData.company,
      twitterUsername: userData.twitterUsername,
      twitterId: twitterId,
      twitterData: twitterData,
      twitterFollowerCount: twitterFollowerCount,
      twitterFollowingCount: twitterFollowingCount,
      twitterFollowerToFollowingRatio: twitterFollowerToFollowingRatio,
      twitterBio: twitterBio,
      isWhopUser: isWhopUser,
      isWhopCreator: isWhopCreator,
      summary: linkedinData ? await generateSummary(linkedinData) : null,
      miniSummary: linkedinData
        ? await generateMiniSummary(linkedinData)
        : null,
      livesNearBrooklyn: normalizedLocation === "NEW YORK",
      topTechnologies: linkedinData
        ? (await gatherTopSkills(linkedinData)).tech
        : [],
      jobTitles: linkedinData
        ? linkedinData.positions?.positionHistory.map((p: any) => p.title) || []
        : [],
      topFeatures: linkedinData
        ? (await gatherTopSkills(linkedinData)).features
        : [],
      isEngineer: linkedinData
        ? (await gatherTopSkills(linkedinData)).isEngineer
        : false,
      createdAt: new Date(),

      // GitHub statistics
      followers: userData.followers.totalCount,
      following: userData.following.totalCount,
      followerToFollowingRatio: userData.following.totalCount
        ? userData.followers.totalCount / userData.following.totalCount
        : userData.followers.totalCount,
      contributionYears: userData.contributionsCollection.contributionYears,
      totalCommits,
      restrictedContributions:
        userData.contributionsCollection.restrictedContributionsCount,
      totalRepositories: userData.repositories.totalCount,
      totalStars,
      totalForks,
      githubLanguages,
      uniqueTopics: Array.from(uniqueTopics),
      sponsorsCount: userData.sponsors.totalCount,
      sponsoredProjects: userData.sponsors.nodes.map(
        (sponsor: any) => sponsor.login
      ),
      organizations: userData.organizations.nodes.map((org: any) => ({
        name: org.name,
        login: org.login,
        description: org.description,
        membersCount: org.membersWithRole.totalCount,
      })),
      websiteUrl: userData.websiteUrl,
      isNearNyc: normalizedLocation === "NEW YORK",
      sourceTables: ["githubUsers"],
    };
  } catch (error) {
    console.error(`Error fetching GitHub user data for ${username}:`, error);
    return null;
  }
}

// Function to check Whop status
interface WhopResponse {
  is_user: boolean;
  is_creator: boolean;
}

async function checkWhopStatus(email: string): Promise<WhopResponse> {
  try {
    const response = await axios.get<WhopResponse>(
      "https://api.whop.com/api/v3/sales/check_email",
      {
        params: { email },
        headers: {
          Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
          Cookie: process.env.WHOP_COOKIE,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error checking Whop status for ${email}:`, error);
    return { is_user: false, is_creator: false };
  }
}

// Function to write data to JSON file
async function writeToJsonFile(data: any, filename: string): Promise<void> {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(path.join(__dirname, filename), jsonData, "utf8");
    console.log(`Data written to ${filename}`);
  } catch (error) {
    console.error(`Error writing to ${filename}:`, error);
  }
}

// Example usage:
fetchGitHubUserData("noahgsolomon")
  .then(async (data) => {
    if (data) {
      await writeToJsonFile(data, "user.json");
    } else {
      console.log("No data returned from fetchGitHubUserData");
    }
  })
  .catch((error) => {
    console.error("Error in fetchGitHubUserData:", error);
  });
