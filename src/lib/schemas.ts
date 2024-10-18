import { z } from "zod";

export const getAbsoluteFilteredTopCandidatesInputSchema = z.object({
	allIdsResponse: z.any(), // todo this shouldn't be any
	showTwitter: z.boolean().optional(),
	showWhop: z.boolean().optional(),
	showLinkedin: z.boolean().optional(),
	showGithub: z.boolean().optional(),
	showActiveGithub: z.boolean().optional(),
	showMatchingLocation: z.boolean().optional(),
});

export type GetAbsoluteFilteredTopCandidatesInput = z.infer<
	typeof getAbsoluteFilteredTopCandidatesInputSchema
>;

export const findFilteredCandidatesInputSchema = z.object({
	query: z.string(), // consider adding min/max length constraints
	job: z.string(),
	relevantRoleId: z.string().optional(),
	nearBrooklyn: z.boolean(),
	searchInternet: z.boolean(),
	skills: z.array(z.string()),
	booleanSearch: z.string().optional(),
	companyIds: z.array(z.string()),
	location: z.string().optional(),
	activeGithub: z.boolean().optional(),
	whopUser: z.boolean().optional(),
});

export type FindFilteredCandidatesInput = z.infer<typeof findFilteredCandidatesInputSchema>;
