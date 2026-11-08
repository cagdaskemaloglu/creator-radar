import { z } from 'zod';
import { store, type CreatorStore } from './db';
import { authorizedUrl } from './browser-policy';
import { buildDiscoveryPlan,discoveryKeyword,discoveryProviders,discoveryTopics } from './discovery-plan';
import { instagramSeeds, researchLimits } from './instagram-policy';
export const jobSchema = z.object({ continuousGeneration:z.number().int().positive().optional(), kind: z.enum(['fixture','browser_fixture','csv','page','browser_open','browser_close','browser_navigate','browser_check_session','instagram_browser','instagram_resume','instagram_night','google_discovery_resume','browser_manual_chrome','browser_use_manual_chrome']), content: z.string().max(1000000).default(''), target:z.object({country:z.string().max(2).optional(),city:z.string().max(80).optional(),gender:z.enum(['female','male']).optional()}).optional(), source: z.string().min(1).max(500), permission: z.string().min(8).max(500), discoveryScopeKey:z.string().regex(/^[a-f0-9]{64}$/).optional(),discoveryPriorityKeywords:z.array(discoveryKeyword).max(20).default([]),discoveryFairBudget:z.boolean().default(false),enrichmentUrls:z.array(z.string().url()).max(200).default([]),enrichmentMaxPages:z.number().int().min(0).max(200).default(0),selectiveReview:z.boolean().default(false),efficientResearch:z.boolean().default(false),poolSourceJob:z.number().int().positive().optional(),discoveryEnabled:z.boolean().default(false),discoveryTopics:z.array(z.string().refine(v=>Object.hasOwn(discoveryTopics,v),'Unknown topic')).max(5).default([]),discoveryKeywords:z.array(discoveryKeyword).max(20).default([]),discoveryProviders:z.array(z.enum(discoveryProviders)).min(1).max(2).default(['google']),discoveryMaxQueries:z.number().int().min(1).max(12).default(4),discoveryResultsPerQuery:z.number().int().min(1).max(20).default(10),nightMaxPages: z.number().int().min(1).max(200).default(30), nightMaxPosts: z.number().int().min(0).max(6).default(3), nightMaxDepth: z.number().int().min(0).max(2).default(1), nightHours: z.number().min(0.25).max(12).default(8), discoverMentions: z.boolean().default(false), limit: z.number().int().min(1).max(500).default(100) });
export async function enqueue(input: unknown, repository: CreatorStore = store) {
  const p = jobSchema.parse(input);
  if(p.kind==='browser_manual_chrome'||p.kind==='browser_use_manual_chrome')throw new Error('CHROME_DISABLED: only dedicated Chromium is supported');
  if (p.kind === 'instagram_night') {
    if (process.env.INSTAGRAM_BROWSER_ENABLED === 'false') throw new Error('Instagram browser research is disabled');
    p.enrichmentUrls=p.enrichmentUrls.map(url=>instagramSeeds(url)[0]);
    p.content = p.content.trim()?instagramSeeds(p.content).join('\n'):'';
    if(p.discoveryEnabled)buildDiscoveryPlan({enabled:true,topics:p.discoveryTopics,keywords:p.discoveryKeywords,providers:p.discoveryProviders,maxQueries:p.discoveryMaxQueries,resultsPerQuery:p.discoveryResultsPerQuery});
    else if(!p.content&&!p.poolSourceJob&&!p.enrichmentUrls.length)throw new Error('Choose discovery keywords/topics or provide a seed list');
    p.limit = Math.min(p.limit, p.efficientResearch?200:30);
  }
  if (p.kind === 'instagram_browser') {
    if (process.env.INSTAGRAM_BROWSER_ENABLED === 'false') throw new Error('Instagram browser research is disabled in configuration');
    p.content = instagramSeeds(p.content).join('\n');
    p.limit = Math.min(p.limit, researchLimits().maxPages);
  }
  if (p.kind === 'page') p.source = authorizedUrl(p.source);
  const cap = z.coerce.number().int().min(1).max(500).parse(process.env.MAX_RECORDS ?? 100);
  p.limit = Math.min(p.limit, cap);
  return p.kind==='instagram_night'&&p.source==='dashboard-autonomous'?repository.enqueueUniqueResearch(JSON.stringify(p)):repository.enqueue(p.kind, JSON.stringify(p));
}
