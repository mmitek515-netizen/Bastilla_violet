#!/usr/bin/env node
/** Bastilla OS Git sync for an existing checkout; AI Studio without .git uses Settings > GitHub. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const REPO='mmitek515-netizen/SVL_System';
const originPattern=/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(mmitek515-netizen\/SVL_System)(?:\.git)?\/?$/i;
export const isAllowedOrigin=value=>originPattern.test(String(value).trim());
export const safePath=value=>{
 const p=String(value).replace(/\\/g,'/');
 if(!p||p.startsWith('/')||p.includes('..')||/(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|dist|data|secrets?)(?:\/|$)/i.test(p)||/\.(?:pem|key|p12|pfx|sqlite|db)$/i.test(p))return false;
 return /^(?:src|scripts|linux|docs|tests|public|\.github)\//.test(p)||/^(?:server\.ts|package\.json|package-lock\.json|index\.html|vite\.config\.ts|tsconfig\.json|README\.md|\.gitignore)$/.test(p);
};
const git=async(...args)=>(await exec('git',args,{timeout:20000,maxBuffer:1024*1024})).stdout.trim();
const result=(status,extras={})=>({status,repository:REPO,branch:'main',...extras});
async function inspect(){
 let root;try{root=await git('rev-parse','--show-toplevel')}catch{throw new Error('Brak .git: użyj AI Studio Settings > GitHub > Push/Pull.')}
 const [branch,origin]=await Promise.all([git('-C',root,'branch','--show-current'),git('-C',root,'remote','get-url','origin')]);
 if(branch!=='main')throw new Error('Dozwolona jest wyłącznie gałąź main, aktualna: '+branch);
 if(!isAllowedOrigin(origin))throw new Error('Odmowa: origin nie wskazuje na mmitek515-netizen/SVL_System.');
 return root;
}
const run=async(root,...args)=>git('-C',root,...args);
export async function execute(action='status'){
 if(!['status','pull','push','commit-push'].includes(action))throw new Error('Tryby: status | pull | push | commit-push');
 const root=await inspect(), dirty=await run(root,'status','--porcelain','--untracked-files=all');
 if(action==='status'){
  const head=await run(root,'rev-parse','HEAD');let remote=null;
  try{const line=await run(root,'ls-remote','origin','refs/heads/main');remote=line.split(/\s+/)[0]||null}catch{}
  return result('inspected',{localCommit:head,remoteCommit:remote,clean:!dirty,inSync:Boolean(remote&&remote===head&&!dirty)});
 }
 if(action==='pull'){
  if(dirty)throw new Error('Niezapisane pliki: najpierw commit lub rozwiąż konflikt w AI Studio.');
  await run(root,'fetch','origin','main');
  const before=await run(root,'rev-parse','HEAD');
  await run(root,'merge','--ff-only','origin/main');
  const after=await run(root,'rev-parse','HEAD');
  return result('pulled',{before,commit:after,changed:before!==after});
 }
 await run(root,'fetch','origin','main');
 const behind=Number(await run(root,'rev-list','--count','HEAD..origin/main'));
 if(behind>0)throw new Error('origin/main zawiera '+behind+' nowszych commitów. Uzgodnij zmiany bez force push.');
 if(action==='push'&&dirty)throw new Error('Niezapisane zmiany: wykonaj commit-push lub commit ręcznie.');
 if(action==='commit-push'&&dirty){
  const paths=dirty.split('\n').map(line=>line.slice(3).split(' -> ').pop());
  const blocked=paths.filter(p=>!safePath(p));
  if(blocked.length)throw new Error('Niedozwolone pliki: '+blocked.slice(0,5).join(', '));
  await run(root,'add','-A','--',...paths);
  const staged=await run(root,'diff','--cached','--name-only');
  if(!staged)throw new Error('Brak nowych plików w commicie.');
  await run(root,'commit','-m','sync: Bastilla OS AI Studio changes on main');
 }
 const commit=await run(root,'rev-parse','HEAD');
 await run(root,'push','origin','HEAD:refs/heads/main');
 const remoteLine=await run(root,'ls-remote','origin','refs/heads/main');
 const remote=remoteLine.split(/\s+/)[0];
 if(remote!==commit)throw new Error('GitHub nie potwierdził commita po push.');
 return result('pushed',{commit,remoteCommit:remote,inSync:true});
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 execute(process.argv[2]||'status').then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(JSON.stringify(result('error',{message:e.message})));process.exitCode=1;});
}
