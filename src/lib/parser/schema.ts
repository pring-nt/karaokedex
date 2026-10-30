import { z } from 'zod';
import { Songbook } from '../songbooks';

const SongCode = z.string().regex(/^\d{4,5}$/);

export const ReviewReason = z.enum([
	'unbalanced-brackets',
	'dangling-credit',
	'empty-credit',
	'short-continuation',
	'accent-mojibake'
]);
export type ReviewReason = z.infer<typeof ReviewReason>;

export const ParsedRow = z.object({
	code: SongCode,
	title: z.string().min(1),
	versionNote: z.string().min(1).nullable(),
	altTitles: z.array(z.string().min(1)),
	creditRaw: z.string(),
	needsReview: z.boolean(),
	reviewReasons: z.array(ReviewReason)
});
export type ParsedRow = z.infer<typeof ParsedRow>;

const ReleaseKind = z.enum(['monthly', 'volume', 'full']);
const ParserProfile = z.enum(['monthly-new-songs', 'full-list', 'ks-volume']);

export const ParsedRelease = z.object({
	songbook: Songbook,
	label: z.string().min(1),
	kind: ReleaseKind,
	profile: ParserProfile,
	fileHash: z.string().regex(/^[0-9a-f]{64}$/),
	codeMin: SongCode,
	codeMax: SongCode,
	rows: z.array(ParsedRow).min(1)
});
export type ParsedRelease = z.infer<typeof ParsedRelease>;
