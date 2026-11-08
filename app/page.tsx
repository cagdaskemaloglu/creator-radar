'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Radar,Activity,Users,Settings2,X,AlertCircle,CheckCircle2 } from 'lucide-react';
import ResearchPanel from './research-panel';
import AccountsPanel from './accounts-panel';
import ConnectionPanel from './connection-panel';
import {type DashboardData} from './dashboard-types';
const empty:DashboardData={creators:[],jobs:[],nightRuns:[],researchLogs:[]};
export default function Home(){
 const [data,setData]=useState<DashboardData>(empty),[loaded,setLoaded]=useState(false),[view,setView]=useState<'research'|'accounts'>('research');
 const [filters,setFilters]=useState({pages:50,country:'',city:'',gender:'',enrichmentShare:0});
 const [topics,setTopics]=useState(['Cozy Room']),[logRun,setLogRun]=useState<number|null>(null),[connection,setConnection]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState('');
 const polling=useRef(false);
 const refresh=useCallback(async()=>{
  if(polling.current)return;polling.current=true;
  try{const r=await fetch('/api/radar'+(logRun?`?log_job_id=${logRun}`:''),{cache:'no-store'});const value=await r.json();if(!r.ok)throw new Error(value.error??'Panel verileri alınamadı.');setData(value);setLoaded(true);setLoadError('');}
  catch(e){setLoadError(e instanceof Error?e.message:'Panel bağlantısı kesildi.');}finally{polling.current=false;}
 },[logRun]);
 useEffect(()=>{void refresh();const timer=setInterval(refresh,2000);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(timer);},[notice]);
 async function action(body:unknown,success?:string):Promise<{id?:number;reused?:boolean;continued?:boolean;ok?:boolean}|undefined>{
  if(busy)return;setBusy(true);setError('');
  try{const r=await fetch('/api/radar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error(result.error??'İşlem tamamlanamadı.');if(success)setNotice(success);await refresh();return result;}
  catch(e){setError(e instanceof Error?e.message:'İşlem tamamlanamadı.');}finally{setBusy(false);}
 }
 async function start(){const result=await action({action:'start_research',topics,...filters,gender:filters.gender||undefined});if(result?.id){setLogRun(result.id);setView('research');setNotice(result.reused?'Devam eden araştırma gösteriliyor.':result.continued?'Bekleyen havuzdan araştırma başladı.':'Araştırma başladı. Havuz otomatik oluşturuluyor.');requestAnimationFrame(()=>document.getElementById('run-heading')?.scrollIntoView({behavior:'smooth',block:'start'}));}}
 const real=data.creators.filter(c=>!c.synthetic),active=data.jobs.find(j=>j.kind==='instagram_night'&&['queued','running'].includes(j.status));
 return <div className="app-shell"><header className="app-header"><div className="header-inner"><a className="brand" href="/" aria-label="Creator Radar ana sayfa"><span className="brand-mark"><Radar size={23}/></span><span>creator<span className="brand-light">radar</span></span></a><nav aria-label="Ana menü"><button className={view==='research'?'nav-active':''} onClick={()=>setView('research')}><Activity size={16}/>Araştırma</button><button className={view==='accounts'?'nav-active':''} onClick={()=>setView('accounts')}><Users size={16}/>Hesaplar<span className="nav-count">{loaded?real.length:'—'}</span></button></nav><button className="connection-button" onClick={()=>setConnection(true)}><span className={`status-dot ${data.researchBrowser?.session.status==='authenticated'?'green':''}`}/>Chromium<Settings2 size={15}/></button></div></header>
  <main className="workspace"><div className="page-heading"><div><p className="eyebrow">{view==='research'?'OTOMATİK CREATOR KEŞFİ':'CREATOR KÜTÜPHANESİ'}</p><h1>{view==='research'?'Araştırma merkezi':'Keşfedilen hesaplar'}</h1><p>{view==='research'?'Yeni hesapları keşfet. Kanıtlarıyla sınıflandır. Tek yerden takip et.':'Hesapları filtrele, kategori kanıtlarını incele ve araştırmanı düzenle.'}</p></div><span className="local-badge"><span className="status-dot green"/>Yerel çalışma alanı</span></div>
  {(error||loadError)&&<div className="alert error" role="alert"><AlertCircle size={18}/><span>{error||loadError}</span><button aria-label="Hata mesajını kapat" onClick={()=>{setError('');if(loadError)void refresh();}}><X size={16}/></button></div>}{notice&&<div className="toast" role="status"><CheckCircle2 size={17}/>{notice}</div>}
  {view==='research'?<ResearchPanel filters={filters} setFilters={setFilters} data={data} loaded={loaded} busy={busy} loadError={Boolean(loadError)} topics={topics} setTopics={setTopics} logRun={logRun} setLogRun={setLogRun} start={start} action={action} openAccounts={()=>setView('accounts')}/>:<AccountsPanel quality={data.evaluations} creators={real} busy={busy} action={action}/>}
  <footer className="app-footer"><span><Radar size={13}/>Creator Radar</span><span>Chromium arka planda · Oturum cihazında · Kaynaklarıyla kayıt</span></footer></main>
  {connection&&<ConnectionPanel data={data} busy={busy} active={Boolean(active)} action={action} close={()=>setConnection(false)}/>}
 </div>;
}
