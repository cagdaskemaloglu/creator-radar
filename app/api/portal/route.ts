import {NextRequest,NextResponse} from 'next/server';
import {store} from '../../../lib/db';
import {searchPortal} from '../../../lib/portal-search';
import {ZodError} from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.get('host')??''))return NextResponse.json({error:'Access denied'},{status:403});
 try{return NextResponse.json(await searchPortal(store.database,Object.fromEntries(req.nextUrl.searchParams)),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return NextResponse.json({error:e instanceof ZodError?'Arama filtreleri geçersiz.':'Hesaplar yüklenemedi. Lütfen tekrar dene.'},{status:e instanceof ZodError?400:503});}
}
