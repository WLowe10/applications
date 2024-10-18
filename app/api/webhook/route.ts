import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import * as schema from "../../../server/db/schema";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	try {
		console.log("Received POST request");
		const bodyText = await req.text();
		console.log(`bodyText: ${bodyText}`);

		let id: string;
		let cookdData: { score: any; result: string; resumeScreenerId: string };
		let cookdScore: number;

		try {
			const bodyJson = JSON.parse(bodyText);

			id = bodyJson.candidateJson.id;
			cookdData = {
				score: bodyJson.score,
				result: bodyJson.result,
				resumeScreenerId: bodyJson.resumeScreenerId,
			};
			cookdScore = Number(bodyJson.score.numericScore.score);

			await db
				.update(schema.candidates)
				.set({ cookdData, cookdScore, cookdReviewed: true })
				.where(eq(schema.candidates.id, id));

			console.log(`Updated Cookd data for ${id}`);
		} catch (parseError) {
			console.log("Body is not valid JSON");
		}

		return NextResponse.json(
			{ message: "POST request processed successfully" },
			{ status: 200 }
		);
	} catch (error) {
		console.error("Error processing POST request:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
