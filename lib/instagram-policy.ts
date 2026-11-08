const reserved = new Set(['accounts','explore','reels','reel','p','stories','direct','about','legal','privacy','developer','developers','challenge','checkpoint','web','api','share','search','directory','terms','emails','oauth','qr']);
export function instagramProfileUrl(raw: string) {
  const u = new URL(raw);
  const username = u.pathname.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
  if (u.protocol !== 'https:' || !['www.instagram.com','instagram.com'].includes(u.hostname) || u.port || u.username || u.password || u.search || u.hash || !/^[a-z0-9._]{1,30}$/.test(username) || reserved.has(username)) throw new Error('Canonical public Instagram profile URL required: https://www.instagram.com/username/');
  return `https://www.instagram.com/${username}/`;
}
export function instagramSeeds(content: string) {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 100) throw new Error('Provide 1–100 profile URLs, one per line');
  return [...new Set(lines.map(instagramProfileUrl))];
}
export type ResearchLimits = { maxPages: number; dailyPages: number|null; intervalMs: number; waitMinMs:number; waitMaxMs:number };
export function researchLimits(env: Record<string,string | undefined> = process.env): ResearchLimits {
  const read = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}: expected integer ${min}–${max}`);
    return value;
  };
  const legacy=env.INSTAGRAM_INTERVAL_SECONDS===undefined?undefined:read('INSTAGRAM_INTERVAL_SECONDS',30,15,3600);
  const min=read('INSTAGRAM_WAIT_MIN_SECONDS',legacy??10,1,3600),max=read('INSTAGRAM_WAIT_MAX_SECONDS',legacy??30,1,3600);
  if(min>max)throw new Error('Instagram minimum wait cannot exceed maximum wait');
  return { waitMinMs:min*1000,waitMaxMs:max*1000,maxPages: read('INSTAGRAM_MAX_PAGES', 10, 1, 100), dailyPages: read('INSTAGRAM_DAILY_PAGES', 30, 0, 500)||null, intervalMs:(min+max)*500 };
}

// A bounded pause before each Instagram visit, independent of page load duration.
export function instagramWaitMs(limits:Pick<ResearchLimits,"waitMinMs"|"waitMaxMs">,random:()=>number=Math.random){
 const min=Math.ceil(limits.waitMinMs/1000),max=Math.floor(limits.waitMaxMs/1000);
 return (min+Math.floor(Math.max(0,Math.min(0.999999999,random()))*(max-min+1)))*1000;
}
