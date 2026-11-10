'use strict';
const $ = id => document.getElementById(id);
const cfg = window.START28_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(cfg.supabaseUrl||'') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('YOUR_') && window.supabase;
let db, user, profile, workouts=[], logs=[], members=[], allLogs=[], selectedWeek=1, editExercises=[];
const weekNames=['일','월','화','수','목','금','토'];
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const email = no => `${no.toLowerCase()}@members.ablegym.com`;
const msg = (s, error=false) => { const el=$('authMsg');el.textContent=s;el.style.color=error?'#b43d44':'#667788';};
const notify = (s)=>alert(s);
function show(id){['setup','auth','app'].forEach(k=>$(k).classList.toggle('hidden',k!==id));}
function validNo(v){return /^[a-zA-Z0-9_-]{3,32}$/.test(v);}
async function loadData(){
 const {data:p,error:pe}=await db.from('profiles').select('*').eq('id',user.id).single();if(pe)throw pe;profile=p;
 const {data:w,error:we}=await db.from('workouts').select('*').order('frequency').order('week').order('day');if(we)throw we;workouts=w||[];
 const {data:l,error:le}=await db.from('workout_logs').select('*').eq('member_id',user.id);if(le)throw le;logs=l||[];
 $('identity').textContent=profile.display_name+' ('+profile.member_no+')';$('welcome').textContent=profile.display_name+'님, 오늘도 화이팅!';
 $('assignment').textContent=`START ${profile.frequency} · 주 ${profile.frequency}회 / 4주`;
 $('rolePill').textContent=profile.role==='admin'?'관리자':'회원';
 document.querySelector('[data-tab="admin"]').classList.toggle('hidden',profile.role!=='admin');
 renderMember();if(profile.role==='admin'){renderEditor();await loadMembers();}
}
function renderMember(){
 const own=workouts.filter(w=>w.frequency===profile.frequency);
 const completed=own.filter(w=>logs.some(l=>l.workout_id===w.id&&l.completed)).length;
 $('count').textContent=`${completed}/${own.length}`;$('progressBar').style.width=(own.length?completed/own.length*100:0)+'%';
 $('weekTabs').innerHTML=[1,2,3,4].map(w=>`<button class="week ${w===selectedWeek?'':'secondary'}" data-week="${w}">${w}주차</button>`).join('');
 document.querySelectorAll('[data-week]').forEach(b=>b.onclick=()=>{selectedWeek=Number(b.dataset.week);renderMember();});
 $('memberDays').innerHTML=own.filter(w=>w.week===selectedWeek).map(w=>{
 const log=logs.find(l=>l.workout_id===w.id);
 return `<div class="dayitem"><div class="flex between"><h3>${esc(w.day_name)} <span class="pill">${weekNames[w.weekday]}요일 권장</span></h3><span class="muted">${w.day}일차</span></div>${(w.exercises||[]).map((x,i)=>`<div class="exercise">${i+1}. <b>${esc(x.name)}</b> · ${esc(x.sets)}세트 × ${esc(x.reps)}</div>`).join('')}<div class="flex"><label class="checkbox"><input type="checkbox" data-log="${w.id}" data-field="attended" ${log?.attended?'checked':''}> 출석 완료</label><label class="checkbox"><input type="checkbox" data-log="${w.id}" data-field="completed" ${log?.completed?'checked':''}> 운동 완료</label></div></div>`;
 }).join('')||'<p class="muted">등록된 운동이 없습니다.</p>';
 document.querySelectorAll('[data-log]').forEach(c=>c.onchange=()=>saveLog(Number(c.dataset.log),c.dataset.field,c.checked));
}
async function saveLog(id,field,value){
 const existing=logs.find(l=>l.workout_id===id);const row={member_id:user.id,workout_id:id,attended:existing?.attended||false,completed:existing?.completed||false,performed_on:new Date().toLocaleDateString('en-CA')};row[field]=value;
 const {error}=await db.from('workout_logs').upsert(row,{onConflict:'member_id,workout_id'});if(error){notify('기록 저장 실패: '+error.message);}await loadData();
}
function renderEditor(){
 const f=Number($('editFrequency').value),w=Number($('editWeek').value);
 const opts=workouts.filter(x=>x.frequency===f&&x.week===w);
 const old=$('editDay').value;$('editDay').innerHTML=opts.map(x=>`<option value="${x.day}">${x.day}일차</option>`).join('');
 if(opts.some(x=>String(x.day)===old))$('editDay').value=old;
 fillEditor();
}
function currentWorkout(){return workouts.find(x=>x.frequency===Number($('editFrequency').value)&&x.week===Number($('editWeek').value)&&x.day===Number($('editDay').value));}
function fillEditor(){const w=currentWorkout();if(!w){$('editor').innerHTML='운동 없음';return;}editExercises=structuredClone(w.exercises||[]);
 $('editor').innerHTML=`<div class="grid"><div><label>운동일 이름</label><input id="dayName" maxlength="60" value="${esc(w.day_name)}"></div><div><label>권장 요일</label><select id="weekday">${weekNames.map((n,i)=>`<option value="${i}" ${i===w.weekday?'selected':''}>${n}요일</option>`).join('')}</select></div></div><h3 style="margin-top:20px">운동 종목</h3><div id="exerciseEditor"></div>`;renderExercises();}
function readExercises(){document.querySelectorAll('[data-exercise]').forEach(el=>{const i=Number(el.dataset.exercise),key=el.dataset.key;if(editExercises[i])editExercises[i][key]=key==='sets'?Number(el.value):el.value;});}
function renderExercises(){
 $('exerciseEditor').innerHTML=editExercises.map((x,i)=>`<div class="exercise"><div class="grid"><div><label>운동명</label><input data-exercise="${i}" data-key="name" maxlength="80" value="${esc(x.name)}"></div><div><label>세트</label><input type="number" min="1" max="20" data-exercise="${i}" data-key="sets" value="${esc(x.sets)}"></div><div><label>횟수/시간</label><input data-exercise="${i}" data-key="reps" maxlength="30" value="${esc(x.reps)}"></div><button class="danger" data-delete="${i}">삭제</button></div></div>`).join('');
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{readExercises();editExercises.splice(Number(b.dataset.delete),1);renderExercises();});
}
async function saveWorkout(){
 const w=currentWorkout();if(!w)return;readExercises();const name=$('dayName').value.trim();if(!name||editExercises.some(x=>!x.name?.trim()||!x.reps?.trim()||!Number.isInteger(x.sets)||x.sets<1||x.sets>20)){notify('운동명, 세트(1~20), 횟수/시간을 확인해주세요.');return;}
 const {error}=await db.from('workouts').update({day_name:name,weekday:Number($('weekday').value),exercises:editExercises}).eq('id',w.id);if(error){notify('저장 실패: '+error.message);return;}
 notify('공통 운동 프로그램이 저장되었습니다.');await loadData();
}
async function loadMembers(){
 if(profile.role!=='admin')return;
 const [p,l]=await Promise.all([db.from('profiles').select('*').order('created_at',{ascending:false}),db.from('workout_logs').select('member_id,workout_id,attended,completed')]);
 if(p.error||l.error){$('memberList').textContent='회원 정보를 불러오지 못했습니다.';return;}members=p.data||[];allLogs=l.data||[];renderMembers();
}
function renderMembers(){
 $('memberList').innerHTML=members.map(m=>{const own=workouts.filter(w=>w.frequency===m.frequency);const ownIds=new Set(own.map(w=>w.id));const rec=allLogs.filter(l=>l.member_id===m.id&&ownIds.has(l.workout_id));const attended=rec.filter(l=>l.attended).length;const completed=rec.filter(l=>l.completed).length;
 return `<div class="dayitem"><div class="flex between"><div><b>${esc(m.display_name)}</b> <span class="muted">${esc(m.member_no)} ${m.role==='admin'?'· 관리자':''}</span><div class="muted">출석 ${attended}회 · 운동 완료 ${completed}/${own.length}회</div></div><div class="flex"><select style="width:110px" data-member-frequency="${m.id}" ${m.role==='admin'?'disabled':''}><option value="2" ${m.frequency===2?'selected':''}>주 2회</option><option value="3" ${m.frequency===3?'selected':''}>주 3회</option><option value="4" ${m.frequency===4?'selected':''}>주 4회</option></select></div></div></div>`;
 }).join('');
 document.querySelectorAll('[data-member-frequency]').forEach(s=>s.onchange=async()=>{const {error}=await db.from('profiles').update({frequency:Number(s.value)}).eq('id',s.dataset.memberFrequency);if(error)notify(error.message);await loadMembers();});
}
async function createMember(ev){
 ev.preventDefault();const no=$('newNo').value.trim().toLowerCase(),name=$('newName').value.trim(),password=$('newPassword').value,frequency=Number($('newFrequency').value);
 if(!validNo(no)||!name||password.length<8){$('createMsg').textContent='입력값을 확인해주세요.';return;}
 const temp=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 $('createMsg').textContent='회원 생성 중...';
 const {data,error}=await temp.auth.signUp({email:email(no),password,options:{data:{display_name:name}}});
 if(error){$('createMsg').textContent='회원 생성 실패: '+error.message;return;}
 if(!data.user||!data.session){$('createMsg').textContent='이메일 확인 설정 때문에 생성이 완료되지 않았습니다. Supabase Auth에서 이메일 확인을 꺼주세요.';return;}
 const {error:upErr}=await db.from('profiles').update({frequency}).eq('id',data.user.id);
 $('createMsg').textContent=upErr?'회원 계정은 생성되었지만 프로그램 배정 실패: '+upErr.message:`회원 ${no} 생성 완료. 초기 비밀번호를 안전하게 전달하세요.`;
 $('createMember').reset();await loadMembers();
}
async function login(ev){ev.preventDefault();const no=$('memberNo').value.trim().toLowerCase();if(!validNo(no)){msg('회원번호 형식이 올바르지 않습니다.',true);return;}msg('로그인 중...');const {error}=await db.auth.signInWithPassword({email:email(no),password:$('password').value});if(error){msg('회원번호 또는 비밀번호를 확인해주세요.',true);return;}await enter();}
async function enter(){const {data:{user:u}}=await db.auth.getUser();if(!u){show('auth');return;}user=u;try{await loadData();show('app');$('logout').classList.remove('hidden');}catch(e){show('auth');msg('계정 또는 데이터 설정 오류: '+e.message,true);}}
async function init(){if(!configured){show('setup');return;}db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);$('loginForm').onsubmit=login;$('logout').onclick=async()=>{await db.auth.signOut();user=null;profile=null;$('logout').classList.add('hidden');$('identity').textContent='';show('auth');};
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='admin'&&profile?.role!=='admin')return;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('memberView').classList.toggle('hidden',b.dataset.tab!=='member');$('adminView').classList.toggle('hidden',b.dataset.tab!=='admin');});
 $('editFrequency').onchange=renderEditor;$('editWeek').onchange=renderEditor;$('editDay').onchange=fillEditor;
 $('addExercise').onclick=()=>{readExercises();editExercises.push({name:'',sets:2,reps:'12회'});renderExercises();};$('saveWorkout').onclick=saveWorkout;$('createMember').onsubmit=createMember;$('refreshMembers').onclick=loadMembers;
 const {data:{session}}=await db.auth.getSession();if(session)await enter();else show('auth');}
init().catch(e=>{show('setup');$('setup').append(document.createTextNode(' 오류: '+e.message));});
