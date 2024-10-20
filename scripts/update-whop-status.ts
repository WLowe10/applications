import "dotenv/config";
import axios from "axios";
import { eq, and, isNotNull, ne, isNull } from "drizzle-orm";
import { db } from "../src/server/db";
import * as schema from "../src/server/db/schema";

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

async function updateWhopStatus() {
	try {
		const usersToUpdate = await db
			.select()
			.from(schema.githubUsers)
			.where(
				and(
					isNotNull(schema.githubUsers.email),
					ne(schema.githubUsers.email, ""),
					isNull(schema.githubUsers.isWhopUser),
					isNull(schema.githubUsers.isWhopCreator)
				)
			);

		console.log(`Found ${usersToUpdate.length} users to update.`);

		for (const user of usersToUpdate) {
			if (!user.email) continue;

			console.log(`Checking Whop status for user: ${user.login}`);
			const whopStatus = await checkWhopStatus(user.email);

			await db
				.update(schema.githubUsers)
				.set({
					isWhopUser: whopStatus.is_user,
					isWhopCreator: whopStatus.is_creator,
				})
				.where(eq(schema.githubUsers.id, user.id));

			console.log(`Updated Whop status for user: ${user.login}`);

			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log("Finished updating Whop statuses.");
	} catch (error) {
		console.error("Error updating Whop statuses:", error);
	}
}

updateWhopStatus().then(() => console.log("Script completed."));
