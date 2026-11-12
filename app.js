'use strict';
const $ = id => document.getElementById(id);
const cfg = window.START28_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(cfg.supabaseUrl||'') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('YOUR_') && window.supabase;
let db, user, profile, workouts=[], logs=[], members=[], allLogs=[], selectedWeek=1, editExercises=[];
const weekNames=['일','월','화','수','목','금','토'];
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const email = no => {
  const id = no.trim().toLowerCase();
  return `${id}@members.ablegym.${id === 'manager01' ? 'invalid' : 'com'}`;
};
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

async function changeAdminPassword() {
  if (!user || profile?.role !== 'admin') {
    alert('관리자만 변경할 수 있습니다.');
    return;
  }

  const current = prompt('현재 비밀번호를 입력하세요.');
  if (current === null) return;
  if (!current) {
    alert('현재 비밀번호를 입력해주세요.');
    return;
  }

  const next = prompt('새 비밀번호를 입력하세요. (8자 이상)');
  if (next === null) return;
  if (next.length < 8) {
    alert('새 비밀번호는 8자 이상이어야 합니다.');
    return;
  }

  const confirmPassword = prompt('새 비밀번호를 다시 입력하세요.');
  if (confirmPassword !== next) {
    alert('새 비밀번호가 일치하지 않습니다.');
    return;
  }

  const { error: verifyError } =
    await db.auth.signInWithPassword({
      email: user.email,
      password: current
    });

  if (verifyError) {
    alert('현재 비밀번호가 올바르지 않습니다.');
    return;
  }

  const { error } = await db.auth.updateUser({
    password: next
  });

  if (error) {
    alert('비밀번호 변경 실패: ' + error.message);
    return;
  }

  alert('비밀번호가 변경되었습니다.');
}

async function login(ev){ev.preventDefault();const no=$('memberNo').value.trim().toLowerCase();if(!validNo(no)){msg('회원번호 형식이 올바르지 않습니다.',true);return;}msg('로그인 중...');const {error}=await db.auth.signInWithPassword({email:email(no),password:$('password').value});if(error){msg('회원번호 또는 비밀번호를 확인해주세요.',true);return;}await enter();}
async function enter(){const {data:{user:u}}=await db.auth.getUser();if(!u){show('auth');return;}user=u;try{await loadData();
show('app');
if (user && profile) {
  $('workoutRecord').classList.remove('hidden');
  wrInit();
  wrRefreshWorkouts();
  await wrLoad();
}$('logout').classList.remove('hidden');}catch(e){show('auth');msg('계정 또는 데이터 설정 오류: '+e.message,true);}}
async function init(){if(!configured){show('setup');return;}db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);$('loginForm').onsubmit=login;$('logout').onclick=async()=>{await db.auth.signOut();user=null;profile=null;$('logout').classList.add('hidden');$('identity').textContent='';show('auth');};
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='admin'&&profile?.role!=='admin')return;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('memberView').classList.toggle('hidden',b.dataset.tab!=='member');$('adminView').classList.toggle('hidden',b.dataset.tab!=='admin');});
 $('editFrequency').onchange=renderEditor;$('editWeek').onchange=renderEditor;$('editDay').onchange=fillEditor;
 $('addExercise').onclick=()=>{readExercises();editExercises.push({name:'',sets:2,reps:'12회'});renderExercises();};$('saveWorkout').onclick=saveWorkout;$('createMember').onsubmit=createMember;$('refreshMembers').onclick=loadMembers;
 const {data:{session}}=await db.auth.getSession();if(session)await enter();else show('auth');}

const wrToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const wrEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;',
  '"':'&quot;', "'":'&#39;'
}[c]));

function wrRefreshWorkouts() {
  if (!profile) return;
  const own = workouts.filter(w => w.frequency === profile.frequency);
  $('wrWorkout').innerHTML = own.map(w =>
    `<option value="${w.id}">${wrEsc(w.week)}주차 ${wrEsc(w.day)}일차 · ${wrEsc(w.day_name)}</option>`
  ).join('');
  wrRefreshExercises();
}

function wrRefreshExercises() {
  const w = workouts.find(x => String(x.id) === $('wrWorkout').value);
  $('wrExercise').innerHTML = (w?.exercises || []).map((x,i) =>
    `<option value="${i}">${wrEsc(x.name)}</option>`
  ).join('');
}

async function wrLoad() {
  if (!user) return;
  const {data,error} = await db.from('exercise_set_logs')
    .select('performed_on,exercise_name,set_number,weight_kg,reps')
    .eq('member_id',user.id)
    .order('performed_on',{ascending:false})
    .order('set_number',{ascending:true})
    .limit(100);

  if (error) {
    $('wrStatus').textContent = '기록 조회 오류: ' + error.message;
    return;
  }

  $('wrHistory').innerHTML = (data || []).map(r =>
    `<div style="padding:8px 0;border-bottom:1px solid #eee">
      ${wrEsc(r.performed_on)} · ${wrEsc(r.exercise_name)} ·
      ${r.set_number}세트 · ${r.weight_kg}kg × ${r.reps}회
    </div>`
  ).join('') || '<p>아직 저장한 운동 기록이 없습니다.</p>';
}

async function wrSave(e) {
  e.preventDefault();

  const w = workouts.find(x => String(x.id) === $('wrWorkout').value);
  const idx = Number($('wrExercise').value);
  const ex = w?.exercises?.[idx];

  const date = $('wrDate').value;
  const set = Number($('wrSet').value);
  const kg = Number($('wrKg').value);
  const reps = Number($('wrReps').value);

  if (!user || !w || !ex ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) ||
      !Number.isInteger(set) || set < 1 || set > 30 ||
      $('wrKg').value.trim() === '' ||
      !Number.isFinite(kg) || kg < 0 || kg > 2000 ||
      $('wrReps').value.trim() === '' ||
      !Number.isInteger(reps) || reps < 0 || reps > 1000) {
    $('wrStatus').textContent = '운동, 날짜, 세트, 무게, 횟수를 확인해주세요.';
    return;
  }

  const row = {
    member_id:user.id,
    workout_id:w.id,
    performed_on:date,
    exercise_index:idx,
    exercise_name:ex.name,
    set_number:set,
    weight_kg:kg,
    reps
  };

  const {error} = await db.from('exercise_set_logs')
    .upsert(row,{
      onConflict:'member_id,workout_id,performed_on,exercise_index,set_number'
    });

  if (error) {
    $('wrStatus').textContent = '저장 실패: ' + error.message;
    return;
  }

  $('wrStatus').textContent = '저장 완료! 같은 날짜·운동·세트 번호로 저장하면 수정됩니다.';
  await wrLoad();
}

function wrInit() {
  $('wrDate').value = wrToday();
  $('wrWorkout').onchange = wrRefreshExercises;
  $('wrForm').onsubmit = wrSave;
}


init().catch(e=>{show('setup');$('setup').append(document.createTextNode(' 오류: '+e.message));});

let calCurrent = new Date();
let calRecords = [];

async function calLoad() {
  if (!user) return;

  const { data, error } = await db
    .from('exercise_set_logs')
    .select('performed_on')
    .eq('member_id', user.id)
    .order('performed_on', { ascending: false })
    .limit(10000);

  if (error) {
    $('calStatus').textContent = '달력 조회 실패: ' + error.message;
    return;
  }

  calRecords = [...new Set((data || []).map(r => r.performed_on))];
  calRender();
}

function calRender() {
  alert('달력 실행 확인');
  const year = calCurrent.getFullYear();
  const month = calCurrent.getMonth();

  $('calMonth').textContent = `${year}년 ${month + 1}월`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const recorded = new Set(calRecords);
  const today = new Date();
  const lastDay = (year === today.getFullYear() &&
                   month === today.getMonth())
    ? today.getDate()
    : (new Date(year, month + 1, 1) > today ? 0 : daysInMonth);

  const monthlyDates = Array.from(
    { length: daysInMonth },
    (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  );

  const count = monthlyDates.filter(d => recorded.has(d)).length;
  const target = profile?.frequency ? Number(profile.frequency) * 4 : 12;
  const rate = target > 0 ? Math.round(count / target * 100) : 0;

  $('calSummary').textContent =
    `이번 달 운동 ${count}일 / 목표 ${target}일 · 목표 달성률 ${rate}%`;

  const grid = $('calGrid');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
  grid.style.gap = '5px';

  grid.innerHTML = '';

  ['일','월','화','수','목','금','토'].forEach(d => {
    const el = document.createElement('div');
    el.textContent = d;
    el.style.textAlign = 'center';
    el.style.fontWeight = 'bold';
    grid.appendChild(el);
  });

  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(document.createElement('div'));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = monthlyDates[day - 1];
    const done = recorded.has(date);
    const el = document.createElement('div');

    el.textContent = done ? `${day} ✓` : String(day);
    el.style.padding = '10px 2px';
    el.style.textAlign = 'center';
    el.style.borderRadius = '8px';
    el.style.background = done ? '#d5f5e8' : '#f2f4f6';
    el.style.color = done ? '#12634b' : '#333';

    grid.appendChild(el);
  }

  $('calStatus').textContent =
    '운동 세트 기록이 있는 날짜에 체크 표시됩니다.';
}

function calInit() {
  $('calPrev').onclick = () => {
    calCurrent.setMonth(calCurrent.getMonth() - 1, 1);
    calRender();
  };

  $('calNext').onclick = () => {
    calCurrent.setMonth(calCurrent.getMonth() + 1, 1);
    calRender();
  };

  const originalEnterForCalendar = enter;

  enter = async function() {
    await originalEnterForCalendar();

    if (user && profile) {
      $('workoutCalendar').classList.remove('hidden');
      await calLoad();
    }
  };

  const originalWrSaveForCalendar = wrSave;

  wrSave = async function(ev) {
    await originalWrSaveForCalendar(ev);
    await calLoad();
  };
}

calInit();

(async () => {
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    await calLoad();
  }
})();
