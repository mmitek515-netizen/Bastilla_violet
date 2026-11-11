import test from 'node:test';
import assert from 'node:assert/strict';
import {isAllowedOrigin,safePath,execute} from '../scripts/github-main-sync.mjs';
test('requires exact Bastilla repo',()=>{
 assert.equal(isAllowedOrigin('https://github.com/mmitek515-netizen/SVL_System.git'),true);
 assert.equal(isAllowedOrigin('git@github.com:mmitek515-netizen/SVL_System.git'),true);
 assert.equal(isAllowedOrigin('https://github.com/elsewhere/SVL_System'),false);
});
test('allows source, rejects secrets and data',()=>{
 for(const p of ['server.ts','src/App.tsx','scripts/worker.mjs','scripts/linux-observer.mjs','docs/GLOBAL_SYNC.md','package.json'])assert.equal(safePath(p),true,p);
 for(const p of ['.env','data/bastilla-state.json','scripts/.env','linux/key.pem','../etc/passwd','node_modules/module.js'])assert.equal(safePath(p),false,p);
});
test('invalid action fails closed',async()=>{await assert.rejects(execute('reset-hard'),/Tryby/);});
