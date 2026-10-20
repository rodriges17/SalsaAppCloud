import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
// UI contract tests use a local API; real Supabase/CORS is verified separately.
// WebKit does not reliably intercept cross-origin preflights behind a service worker.
test.use({ serviceWorkers: 'block' });
const host='http://127.0.0.1:4173';
test.beforeEach(async ({page}) => {
 await page.route('**/pwa/cloud-config.js', route => route.fulfill({contentType:'application/javascript',body:`export const CLOUD_URL='${host}';export const CLOUD_KEY='test-publishable';export const CLOUD_FILE_LIMIT=50000000;`}));
});
const library={id:'lib-1',owner_id:'owner',title:'Cloud Kurs',description:'Geteilte Figuren',visibility:'public',collaborative:false,moderated:true,manage:false,contribute:false};
async function mock(page,admin=false, own=false, contribute=true){
 const clip=await readFile('web-tests/fixtures/clip.mp4');
 const rev={id:'rev-1',figure_id:'figure-1',title:'Cloud Drehung',description:'Aus der Cloud',tags:['Salsa'],videos:[{id:'video-1',name:'Führung',type:'video/mp4',size:clip.length}]},calls=[];
 await page.route(new RegExp('^'+host+'/(functions|storage)/'),async route=>{
  const req=route.request();
  if(req.url().includes('/storage/'))return route.fulfill({status:200,contentType:'video/mp4',body:clip,headers:{'Access-Control-Allow-Origin':'*'}});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, GET, OPTIONS'}});
  const {action,payload}=req.postDataJSON();calls.push({action,payload,authorization:req.headers().authorization});let result={ok:true};
  if(action==='state')result={me:admin&&req.headers().authorization?{id:'admin',email:'admin@example.test',is_admin:true,upload_enabled:true,used:0,quota:500000000}:null,settings:{used:0,total_limit:900000000},people:[],libraries:[{...library,contribute}],own_figures:own?[{id:'figure-1',public_allowed:true,revisions:[{...rev,created_at:'2026-10-19T00:00:00Z'}]}]:[]};
  if(action==='library')result={library,manage:false,contribute:false,members:[],entries:[{figure_id:'figure-1',owner_id:'owner',public_allowed:true,published:rev,pending:null}]};
  if(action==='library_save')result={id:'lib-1'};
  if(action==='media_url')result={url:host+'/storage/v1/object/sign/salsa-cloud/video-1?token=fake'};
  if(action==='admin_link')result={link:'https://rodriges17.github.io/SalsaAppCloud/?cloud=1&type=magiclink&token_hash=one-time-test'};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result),headers:{'Access-Control-Allow-Origin':'*'}});
 });return calls;
}
async function start(page){await page.goto('/pwa/');await expect(page.getByRole('heading',{name:'Salsa Cloud',exact:true})).toBeVisible();}
test('public cloud download requires confirmed previews and becomes an offline copy',async({page,context})=>{
 await mock(page);await start(page);await page.locator('#cloudButton').tap();await page.getByRole('button',{name:'Öffnen',exact:true}).tap();
 await expect(page.getByRole('heading',{name:'Cloud Kurs',exact:true})).toBeVisible();await page.getByRole('button',{name:'In meine Figuren übernehmen',exact:true}).tap();
 await expect(page.locator('#editor')).toBeVisible();await expect(page.locator('#figureTitle')).toHaveValue('Cloud Drehung');await expect(page.locator('#saveFigure')).toBeDisabled();
 await page.locator('#reviewAll').tap();await expect(page.locator('#acceptVideo')).toBeEnabled();await page.locator('#acceptVideo').tap();await page.locator('#saveFigure').tap();await expect(page.locator('#editor')).not.toBeVisible();
 await context.setOffline(true);await page.getByRole('button',{name:'Cloud Drehung lernen',exact:true}).tap();await expect(page.locator('#learningVideo')).toHaveJSProperty('videoWidth',320);
});
test('offline cloud failure stays closable and local editing works',async({page,context})=>{
 await start(page);await context.setOffline(true);await page.locator('#cloudButton').tap();await expect(page.locator('#cloudError')).toContainText('Internetverbindung');await page.locator('#cloudBack').tap();await page.locator('#addFigure').tap();await expect(page.locator('#editor')).toBeVisible();
});
test('admin sets explicit quota and creates a manual link without sending a message',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('salsa-cloud-session:/pwa/:v1',JSON.stringify({access_token:'test-user-jwt',refresh_token:'test-refresh',expires_at:Date.now()+3600000})));
 const calls=await mock(page,true);await start(page);await page.locator('#cloudButton').tap();await page.getByRole('button',{name:'Verwaltung',exact:true}).tap();
 await page.getByLabel('Person: E-Mail-Adresse',{exact:true}).fill('writer@example.test');await page.getByLabel('Speicherlimit dieser Person in MB',{exact:true}).fill('100');await page.getByLabel('Cloud-Bibliotheken und Uploads erlauben',{exact:true}).check();
 await page.getByRole('button',{name:'Person anlegen / Freigabe speichern',exact:true}).tap();await expect.poll(()=>calls.some(c=>c.action==='admin_user')).toBe(true);
 expect(calls.find(c=>c.action==='admin_user').payload).toEqual({email:'writer@example.test',enabled:true,quota:100000000});
 await page.getByLabel('Person: E-Mail-Adresse',{exact:true}).fill('writer@example.test');await page.getByRole('button',{name:'Anmeldelink erstellen',exact:true}).tap();await expect(page.getByLabel('Einmaliger persönlicher Anmeldelink',{exact:true})).toHaveValue(/token_hash=one-time-test/);expect(calls.every(c=>c.authorization==='Bearer test-user-jwt')).toBe(true);
});
test('backend not yet configured shows a useful error and leaves ZIP import usable',async({page})=>{
 await page.route(`${host}/functions/v1/cloud`,r=>r.fulfill(r.request().method()==='OPTIONS'?{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}}:{status:404,contentType:'application/json',body:JSON.stringify({error:'Cloud ist noch nicht eingerichtet.'}),headers:{'Access-Control-Allow-Origin':'*'}}));
 await start(page);await page.locator('#cloudButton').tap();await expect(page.locator('#cloudError')).toContainText('noch nicht eingerichtet');await page.locator('#cloudBack').tap();await page.locator('#importFigure').tap();await expect(page.locator('#importChoiceDialog')).toBeVisible();
});

test('manual sign-in link is redeemed inside the current app without navigating away',async({page})=>{
 await mock(page,true);
 await page.route(`${host}/auth/v1/verify`,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-new-user-jwt',refresh_token:'test-new-refresh',expires_in:3600})}));
 await start(page);await page.locator('#cloudButton').tap();
 await page.getByLabel('Anmeldelink einfügen',{exact:true}).fill('https://rodriges17.github.io/SalsaAppCloud/?cloud=1&type=magiclink&token_hash=test-once');
 await page.getByRole('button',{name:'Anmelden',exact:true}).tap();
 await expect(page.locator('#cloudBody')).toContainText('admin@example.test');
 expect(page.url()).not.toContain('token_hash');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('salsa-cloud-session:/pwa/:v1')).access_token)).toBe('test-new-user-jwt');
});

async function signIn(page) {
 await page.addInitScript(()=>localStorage.setItem('salsa-cloud-session:/pwa/:v1',JSON.stringify({access_token:'test-user-jwt',refresh_token:'test-refresh',expires_at:Date.now()+3600000})));
}
test('libraries and own cloud figures are separate; creation is explicit and cancellable',async({page})=>{
 await signIn(page);const calls=await mock(page,true,true);await start(page);await page.locator('#cloudButton').tap();
 await expect(page.getByLabel('Name',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Version zuordnen:/})).toHaveCount(0);
 await expect(page.getByLabel('Person: E-Mail-Adresse',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Bibliothek erstellen',exact:true}).tap();
 await expect(page.getByLabel('Name',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Abbrechen',exact:true}).tap();
 await expect(page.getByLabel('Name',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Bibliothek erstellen',exact:true}).tap();
 await page.getByLabel('Name',{exact:true}).fill('Mein Kurs');
 await page.getByRole('button',{name:'Bibliothek speichern',exact:true}).tap();
 await expect(page.getByRole('heading',{name:'Cloud Kurs',exact:true})).toBeVisible();
 expect(calls.find(c=>c.action==='library_save').payload).toMatchObject({title:'Mein Kurs',visibility:'private',collaborative:false,moderated:true});
 await page.getByRole('button',{name:'Meine Cloud-Figuren',exact:true}).tap();
 await expect(page.getByRole('button',{name:/Version zuordnen:/})).toBeVisible();
 await expect(page.getByRole('button',{name:'Öffnen',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Name',{exact:true})).toHaveCount(0);
});
test('assigning a cloud revision opens a visible focused view and attaches to the chosen library',async({page})=>{
 await signIn(page);const calls=await mock(page,true,true);await start(page);await page.locator('#cloudButton').tap();
 await page.getByRole('button',{name:'Meine Cloud-Figuren',exact:true}).tap();
 await page.getByRole('button',{name:/Version zuordnen:/}).tap();
 await expect(page.getByRole('combobox',{name:'Zielbibliothek',exact:true})).toBeInViewport();
 await expect(page.locator('#cloudBody .cloud-card')).toBeFocused();
 await page.getByRole('button',{name:'Zurück zu Meine Cloud-Figuren',exact:true}).tap();
 await page.getByRole('button',{name:/Version zuordnen:/}).tap();
 await page.getByRole('button',{name:'Figur zuordnen',exact:true}).tap();
 await expect(page.getByRole('heading',{name:'Cloud Kurs',exact:true})).toBeVisible();
 expect(calls.find(c=>c.action==='attach').payload).toEqual({library:'lib-1',revision:'rev-1'});
});
test('assignment without a permitted target explains how to proceed',async({page})=>{
 await signIn(page);await mock(page,true,true,false);await start(page);await page.locator('#cloudButton').tap();
 await page.getByRole('button',{name:'Meine Cloud-Figuren',exact:true}).tap();await page.getByRole('button',{name:/Version zuordnen:/}).tap();
 await expect(page.getByText('Keine Bibliothek mit Beitragsberechtigung.',{exact:false})).toBeInViewport();
 await expect(page.getByRole('button',{name:'Figur zuordnen',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Bibliothek erstellen',exact:true}).tap();await expect(page.getByLabel('Name',{exact:true})).toBeVisible();
});
