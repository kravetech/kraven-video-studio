import { readFileSync } from 'node:fs';

const settings = process.env.STUDIO_CONFIG ? JSON.parse(readFileSync(process.env.STUDIO_CONFIG, 'utf8').replace(/^\uFEFF/, '')) : {};
export const primaryHashtag = settings.post?.primaryHashtag ?? '#VideoStudio';
export const communityLine = settings.post?.communityLine?.trim() || null;
