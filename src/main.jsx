
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const LOGO = '/dof-logo.png';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'smyoo@doflab.com';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const baseMenu = [
  ['🏠','Dashboard'], ['⏱','Attendance'], ['📅','Calendar'], ['✅','Tasks'], ['🌴','Leave']
];

const adminMenu = [
  ['👥','Employees'], ['🔐','Admin']
];

const monthlyQuotes = [
  'Great systems make great teams feel effortless.',
  'Small daily wins become big company momentum.',
  'Clarity, consistency, and follow-up win the game.',
  'Build the workflow once. Benefit from it every day.',
  'Progress feels better when the whole team can see it.',
  'Better operations create better customer experiences.',
  'A calm system makes a fast team.',
  'Execution is easier when the next step is obvious.',
  'Strong teams do not rely on memory. They rely on systems.',
  'Make today a little more organized than yesterday.',
  'Good work compounds when nothing falls through the cracks.',
  'The best internal tool is the one the team actually uses.'
];

function currentQuote() { return monthlyQuotes[new Date().getMonth()]; }
function localTz() { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'; }
function fmt(v) { return v ? new Date(v).toLocaleString() : '-'; }
function hoursBetween(start, end) {
  if(!start || !end) return '-';
  const h = (new Date(end) - new Date(start)) / 36e5;
  return `${Math.max(0, h).toFixed(2)} hrs`;
}
function daysInclusive(start, end) {
  if(!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}
function csv(rows) {
  const content = rows.map(r => r.map(c => `"${String(c ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([content], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'attendance_export.csv'; a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [session,setSession] = useState(null);
  const [page,setPage] = useState('Dashboard');
  const [email,setEmail] = useState(ADMIN_EMAIL);
  const [password,setPassword] = useState('');
  const [profile,setProfile] = useState(null);
  const [profiles,setProfiles] = useState([]);
  const [attendance,setAttendance] = useState([]);
  const [tasks,setTasks] = useState([]);
  const [events,setEvents] = useState([]);
  const [leaves,setLeaves] = useState([]);
  const [balances,setBalances] = useState([]);
  const [month,setMonth] = useState(new Date());
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  const [task,setTask] = useState({ title:'', assignee_id:'', priority:'Medium', due_date:'', description:'' });
  const [event,setEvent] = useState({ title:'', event_date:'', end_date:'', event_time:'', all_day:true, type:'Exhibition', notes:'' });
  const [leave,setLeave] = useState({ leave_type:'Paid Time Off', start_date:'', end_date:'', hours:8, reason:'' });
  const [balanceForm,setBalanceForm] = useState({ user_id:'', paid_time_off_hours:0, paid_sick_leave_hours:0 });

  const isAdmin = profile?.role === 'admin';
  const open = attendance.find(r => r.user_id === session?.user?.id && r.status === 'checked_in');

  const visibleAttendance = useMemo(() => {
    if(isAdmin) return attendance;
    return attendance.filter(r => r.user_id === session?.user?.id);
  }, [attendance, isAdmin, session]);

  const visibleLeaves = useMemo(() => {
    if(isAdmin) return leaves;
    return leaves.filter(r => r.user_id === session?.user?.id);
  }, [leaves, isAdmin, session]);

  const visibleTasks = useMemo(() => {
    if(isAdmin) return tasks;
    return tasks.filter(t => t.assignee_id === session?.user?.id || t.created_by === session?.user?.id);
  }, [tasks, isAdmin, session]);

  useEffect(() => {
    if(!supabase) return;
    supabase.auth.getSession().then(x => setSession(x.data.session));
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => { if(session?.user) loadAll(); }, [session]);

  async function signIn(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) setError(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    location.reload();
  }

  async function ensureProfile() {
    const u = session.user;
    let { data, error } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if(error) setError('Profile load error: ' + error.message);
    if(!data) {
      const row = {
        id:u.id,
        email:u.email,
        full_name:u.email===ADMIN_EMAIL ? 'Justin Yoo' : u.email,
        role:u.email===ADMIN_EMAIL ? 'admin' : 'employee',
        status:'active'
      };
      const res = await supabase.from('profiles').insert(row).select().single();
      if(res.error) setError('Profile create error: ' + res.error.message);
      data = res.data || row;
    }
    setProfile(data);
    return data;
  }

  async function loadAll() {
    setError('');
    const p = await ensureProfile();
    const [a,t,e,ps,l,b] = await Promise.all([
      supabase.from('attendance_records').select('*').order('created_at', { ascending:false }),
      supabase.from('tasks').select('*').order('created_at', { ascending:false }),
      supabase.from('calendar_events').select('*').order('event_date', { ascending:true }),
      supabase.from('profiles').select('*').order('created_at', { ascending:true }),
      supabase.from('leave_requests').select('*').order('created_at', { ascending:false }),
      supabase.from('leave_balances').select('*').order('employee_name', { ascending:true })
    ]);
    if(a.error) setError('Attendance load error: ' + a.error.message);
    if(t.error) setError('Tasks load error: ' + t.error.message);
    if(e.error) setError('Calendar load error: ' + e.error.message);
    if(l.error) setError('Leave load error: ' + l.error.message);
    if(b.error) setError('Leave balance load error: ' + b.error.message);
    setAttendance(a.data||[]);
    setTasks(t.data||[]);
    setEvents(e.data||[]);
    setLeaves(l.data||[]);
    setBalances(b.data||[]);
    const profileRows = ps.data?.length ? ps.data : [p];
    setProfiles(profileRows);
    if(!task.assignee_id && profileRows.length) setTask(prev => ({...prev, assignee_id: profileRows[0].id}));
    if(!balanceForm.user_id && profileRows.length) setBalanceForm(prev => ({...prev, user_id: profileRows[0].id}));
  }

  async function startShift() {
    setError(''); setNotice('');
    if(open) return setError('Your shift is already started.');
    if(!window.confirm('Would you like to start your shift now?')) return;
    const p = profile || await ensureProfile();
    const res = await supabase.from('attendance_records').insert({
      user_id:session.user.id,
      employee_name:p.full_name,
      clock_in_at:new Date().toISOString(),
      local_timezone:localTz(),
      hq_timezone:'America/Los_Angeles',
      location_text:null,
      status:'checked_in'
    });
    if(res.error) return setError('Shift Start error: ' + res.error.message);
    setNotice('Shift Started.');
    await loadAll();
  }

  async function endShift() {
    setError(''); setNotice('');
    if(!open) return setError('No active shift found.');
    if(!window.confirm('Would you like to end your shift now?')) return;
    const endedAt = new Date().toISOString();
    const res = await supabase.from('attendance_records').update({ clock_out_at:endedAt, status:'completed' }).eq('id', open.id);
    if(res.error) return setError('Shift End error: ' + res.error.message);
    setNotice(`Shift Ended. Today's work time: ${hoursBetween(open.clock_in_at, endedAt)}`);
    await loadAll();
  }

  async function createTask(e) {
    e.preventDefault(); setError('');
    const assignee = profiles.find(p => p.id === task.assignee_id);
    if(!task.title.trim()) return setError('Task title is required.');
    if(!assignee) return setError('Please select an assignee.');
    const res = await supabase.from('tasks').insert({
      title: task.title,
      description: task.description,
      assignee_id: assignee.id,
      assignee_name: assignee.full_name || assignee.email,
      priority: task.priority,
      due_date: task.due_date || null,
      status: 'To Do',
      created_by: session.user.id
    });
    if(res.error) return setError('Task create error: ' + res.error.message);
    setTask({ title:'', assignee_id:assignee.id, priority:'Medium', due_date:'', description:'' });
    setNotice('Task assigned.');
    await loadAll();
  }

  async function updateTaskStatus(id, status) {
    const res = await supabase.from('tasks').update({ status }).eq('id', id);
    if(res.error) return setError('Task update error: ' + res.error.message);
    await loadAll();
  }

  async function deleteTask(id) {
    if(!window.confirm('Delete this task?')) return;
    const res = await supabase.from('tasks').delete().eq('id', id);
    if(res.error) return setError('Task delete error: ' + res.error.message);
    await loadAll();
  }

  async function createEvent(e) {
    e.preventDefault(); setError('');
    if(!event.title.trim() || !event.event_date) return setError('Event title and start date are required.');
    const row = {
      ...event,
      end_date: event.end_date || event.event_date,
      event_time:event.all_day ? null : event.event_time,
      created_by:session.user.id,
      created_by_name: profile?.full_name
    };
    const res = await supabase.from('calendar_events').insert(row);
    if(res.error) return setError('Event create error: ' + res.error.message);
    setEvent({ title:'', event_date:'', end_date:'', event_time:'', all_day:true, type:'Exhibition', notes:'' });
    setNotice('Event created.');
    await loadAll();
  }

  async function deleteEvent(id) {
    if(!window.confirm('Delete this event?')) return;
    const res = await supabase.from('calendar_events').delete().eq('id', id);
    if(res.error) return setError('Event delete error: ' + res.error.message);
    await loadAll();
  }

  async function createLeave(e) {
    e.preventDefault(); setError('');
    if(!leave.start_date || !leave.end_date) return setError('Leave start and end date are required.');
    const totalHours = Number(leave.hours || 8) * daysInclusive(leave.start_date, leave.end_date);
    const res = await supabase.from('leave_requests').insert({
      user_id: session.user.id,
      employee_name: profile?.full_name,
      leave_type: leave.leave_type,
      start_date: leave.start_date,
      end_date: leave.end_date,
      hours: totalHours,
      reason: leave.reason,
      status: 'Pending'
    });
    if(res.error) return setError('Leave request error: ' + res.error.message);
    setLeave({ leave_type:'Paid Time Off', start_date:'', end_date:'', hours:8, reason:'' });
    setNotice('Leave request submitted.');
    await loadAll();
  }

  async function updateLeaveStatus(row, status) {
    const res = await supabase.from('leave_requests').update({ status }).eq('id', row.id);
    if(res.error) return setError('Leave update error: ' + res.error.message);

    if(status === 'Approved') {
      const current = balances.find(b => b.user_id === row.user_id);
      if(current) {
        const field = row.leave_type === 'Paid Sick Leave' ? 'paid_sick_leave_hours' : 'paid_time_off_hours';
        const nextValue = Math.max(0, Number(current[field] || 0) - Number(row.hours || 0));
        await supabase.from('leave_balances').update({ [field]: nextValue, updated_at: new Date().toISOString() }).eq('id', current.id);
      }
    }
    await loadAll();
  }

  async function saveLeaveBalance(e) {
    e.preventDefault(); setError('');
    const employee = profiles.find(p => p.id === balanceForm.user_id);
    if(!employee) return setError('Please select an employee.');
    const existing = balances.find(b => b.user_id === employee.id);
    const row = {
      user_id: employee.id,
      employee_name: employee.full_name || employee.email,
      paid_time_off_hours: Number(balanceForm.paid_time_off_hours || 0),
      paid_sick_leave_hours: Number(balanceForm.paid_sick_leave_hours || 0),
      updated_at: new Date().toISOString()
    };
    const res = existing
      ? await supabase.from('leave_balances').update(row).eq('id', existing.id)
      : await supabase.from('leave_balances').insert(row);
    if(res.error) return setError('Leave balance save error: ' + res.error.message);
    setNotice('Leave balance saved.');
    await loadAll();
  }

  function exportCSV() {
    if(!isAdmin) return setError('Admin only.');
    csv([
      ['Employee','Shift Started','Shift Ended','Total Hours','Timezone','HQ Timezone','Status'],
      ...attendance.map(r=>[r.employee_name,fmt(r.clock_in_at),fmt(r.clock_out_at),hoursBetween(r.clock_in_at,r.clock_out_at),r.local_timezone,r.hq_timezone,r.status])
    ]);
  }

  if(!supabase) return <div className="setup"><h1>DOF USA HUB</h1><p>Supabase is not configured yet.</p></div>;

  if(!session) {
    return (
      <div className="login">
        <div className="hero">
          <h1>DOF USA HUB</h1>
          <p>Internal operations portal for attendance, tasks, calendar, and leave management.</p>
        </div>
        <form onSubmit={signIn} className="loginCard">
          <h2>Sign in</h2>
          <label>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button>Login</button>
          {error && <div className="err">{error}</div>}
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <aside>
        <div className="logo">{LOGO ? <img src={LOGO} /> : <b>DOF USA HUB</b>}</div>
        <p>Internal operations portal</p>
        <nav>{[...baseMenu, ...(isAdmin ? adminMenu : [])].map(([ico,name])=><button key={name} className={page===name?'active':''} onClick={()=>setPage(name)}><span>{ico}</span>{name}</button>)}</nav>
        <div className="tz"><b>HQ Timezone</b><br/>America/Los_Angeles<br/>PST/PDT automatic</div>
      </aside>

      <main>
        <header><div><h1>{page}</h1><p>{profile?.full_name} · {profile?.role}</p></div><button className="light" onClick={logout}>↪ Logout</button></header>
        {error && <div className="err">{error}</div>}
        {notice && <div className="ok">{notice}</div>}

        {page==='Dashboard' && <Dashboard quote={currentQuote()} open={open} tasks={visibleTasks} events={events} leaves={visibleLeaves} startShift={startShift} endShift={endShift} setPage={setPage} month={month} setMonth={setMonth} />}

        {page==='Attendance' && <Card title="Attendance Records" action={<div className="actions"><button onClick={startShift}>Shift Started</button><button className="dark" onClick={endShift}>Shift Ended</button></div>}>
          <p className="hint">{isAdmin ? 'Admin view: all employee attendance records are visible here. Export is available only in Admin.' : 'Employee view: only your own attendance records are visible.'}</p>
          <Table headers={['Employee','Shift Started','Shift Ended','Total Hours','Timezone','Status']} rows={visibleAttendance.map(r=>[r.employee_name,fmt(r.clock_in_at),fmt(r.clock_out_at),hoursBetween(r.clock_in_at,r.clock_out_at),r.local_timezone,r.status])} />
        </Card>}

        {page==='Calendar' && <>
          <Card title="Create Event">
            <form onSubmit={createEvent} className="eventForm">
              <input placeholder="Event title" value={event.title} onChange={e=>setEvent({...event,title:e.target.value})}/>
              <input type="date" value={event.event_date} onChange={e=>setEvent({...event,event_date:e.target.value})}/>
              <input type="date" value={event.end_date} onChange={e=>setEvent({...event,end_date:e.target.value})}/>
              <label className="check"><input type="checkbox" checked={event.all_day} onChange={e=>setEvent({...event,all_day:e.target.checked})}/> All Day</label>
              <input type="time" disabled={event.all_day} value={event.event_time} onChange={e=>setEvent({...event,event_time:e.target.value})}/>
              <select value={event.type} onChange={e=>setEvent({...event,type:e.target.value})}>
                <option>Business Trip</option><option>Installation</option><option>Exhibition</option><option>Office Visit</option><option>Day Off</option>
              </select>
              <button>Create Event</button>
            </form>
            <div className="legend"><span className="trip">Business Trip</span><span className="install">Installation</span><span className="exhibition">Exhibition</span><span className="office">Office Visit</span><span className="dayoff">Day Off</span></div>
          </Card>
          <Card title={month.toLocaleString('en-US',{month:'long',year:'numeric'})+' Calendar'} action={<MonthControls month={month} setMonth={setMonth} />}>
            <Calendar month={month} events={events} deleteEvent={deleteEvent} />
          </Card>
        </>}

        {page==='Tasks' && <div className="two">
          <Card title="Create / Assign Task"><form onSubmit={createTask} className="form">
            <input placeholder="Task title" value={task.title} onChange={e=>setTask({...task,title:e.target.value})}/>
            <select value={task.assignee_id} onChange={e=>setTask({...task,assignee_id:e.target.value})}><option value="">Select assignee</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select>
            <input type="date" value={task.due_date} onChange={e=>setTask({...task,due_date:e.target.value})}/>
            <select value={task.priority} onChange={e=>setTask({...task,priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select>
            <textarea placeholder="Description" value={task.description} onChange={e=>setTask({...task,description:e.target.value})}/>
            <button>Assign Task</button>
          </form></Card>
          <Card title="Task List">{visibleTasks.length ? visibleTasks.map(t=><Task key={t.id} t={t} updateTaskStatus={updateTaskStatus} deleteTask={deleteTask}/>) : <Empty text="No tasks yet."/>}</Card>
        </div>}

        {page==='Leave' && <>
          <div className="two">
            <Card title="Request Leave"><form onSubmit={createLeave} className="form">
              <select value={leave.leave_type} onChange={e=>setLeave({...leave,leave_type:e.target.value})}><option>Paid Time Off</option><option>Paid Sick Leave</option><option>Unpaid Leave</option></select>
              <input type="date" value={leave.start_date} onChange={e=>setLeave({...leave,start_date:e.target.value})}/>
              <input type="date" value={leave.end_date} onChange={e=>setLeave({...leave,end_date:e.target.value})}/>
              <input type="number" min="1" step="0.5" value={leave.hours} onChange={e=>setLeave({...leave,hours:e.target.value})} placeholder="Hours per day"/>
              <textarea placeholder="Reason / notes" value={leave.reason} onChange={e=>setLeave({...leave,reason:e.target.value})}/>
              <button>Submit Request</button>
            </form></Card>
            <Card title="Leave Requests">
              <Table headers={isAdmin?['Employee','Type','Start','End','Hours','Status','Action']:['Type','Start','End','Hours','Status']}
                rows={visibleLeaves.map(r=> isAdmin ? [r.employee_name,r.leave_type,r.start_date,r.end_date,r.hours,r.status,
                  r.status==='Pending' ? <LeaveActions key={r.id} row={r} updateLeaveStatus={updateLeaveStatus}/> : '-'
                ] : [r.leave_type,r.start_date,r.end_date,r.hours,r.status])} />
            </Card>
          </div>
          {isAdmin && <Card title="Set Initial Leave Balance">
            <form onSubmit={saveLeaveBalance} className="eventForm">
              <select value={balanceForm.user_id} onChange={e=>setBalanceForm({...balanceForm,user_id:e.target.value})}>
                {profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
              <input type="number" step="0.5" placeholder="Paid Time Off hours" value={balanceForm.paid_time_off_hours} onChange={e=>setBalanceForm({...balanceForm,paid_time_off_hours:e.target.value})}/>
              <input type="number" step="0.5" placeholder="Paid Sick Leave hours" value={balanceForm.paid_sick_leave_hours} onChange={e=>setBalanceForm({...balanceForm,paid_sick_leave_hours:e.target.value})}/>
              <button>Save Balance</button>
            </form>
          </Card>}
          <Card title="Leave Balances">
            <Table headers={['Employee','Paid Time Off','Paid Sick Leave']} rows={(isAdmin?balances:balances.filter(b=>b.user_id===session.user.id)).map(b=>[b.employee_name,`${b.paid_time_off_hours || 0} hrs`,`${b.paid_sick_leave_hours || 0} hrs`])}/>
          </Card>
        </>}

        {page==='Employees' && isAdmin && <Card title="Employees"><Table headers={['Name','Email','Role','Status']} rows={profiles.map(p=>[p.full_name,p.email,p.role,p.status])} /></Card>}

        {page==='Admin' && isAdmin && <Card title="Admin Tools"><div className="actions"><button onClick={exportCSV}>Export Attendance CSV</button><button className="light" onClick={loadAll}>Refresh Data</button></div></Card>}
      </main>
    </div>
  );
}

function LeaveActions({row, updateLeaveStatus}) {
  return <div className="actions"><button onClick={()=>updateLeaveStatus(row,'Approved')}>Approve</button><button className="dark" onClick={()=>updateLeaveStatus(row,'Rejected')}>Reject</button></div>
}

function Dashboard({quote,open,tasks,events,leaves,startShift,endShift,setPage,month,setMonth}) {
  return (
    <>
      <div className="quoteCard">“{quote}”</div>
      <section className="kpis">
        <KPI title="Attendance" value={open?'In':'Not In'} icon="⏱"/>
        <KPI title="Tasks" value={tasks.length} icon="✅"/>
        <KPI title="Events" value={events.length} icon="📅"/>
        <KPI title="Pending Leave" value={leaves.filter(l=>l.status==='Pending').length} icon="🌴"/>
      </section>
      <div className="two">
        <Card title="Attendance & Location" action={<button onClick={open?endShift:startShift}>{open?'Shift Ended':'Shift Started'}</button>}>
          <div className="clock"><strong>{open?new Date(open.clock_in_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'--:--'}</strong><span>{open?'Shift started':'Shift not started'}<br/>Timezone: {open?.local_timezone||localTz()}</span></div>
        </Card>
        <Card title="Task Assignment" action={<button onClick={()=>setPage('Tasks')}>+ Task</button>}>{tasks.length ? tasks.slice(0,4).map(t=><Task key={t.id} t={t} updateTaskStatus={()=>{}} deleteTask={()=>{}}/>) : <Empty text="No tasks yet."/>}</Card>
      </div>
      <Card title={month.toLocaleString('en-US',{month:'long',year:'numeric'})+' Calendar'} action={<MonthControls month={month} setMonth={setMonth} />}>
        <Calendar month={month} events={events} deleteEvent={()=>{}} />
      </Card>
    </>
  );
}

function KPI({title,value,icon}) { return <div className="kpi"><div><span>{title}</span><strong>{value}</strong></div><em>{icon}</em></div> }
function Card({title,action,children}) { return <section className="card"><div className="head"><h2>{title}</h2>{action}</div>{children}</section> }
function Empty({text}) { return <div className="empty">{text}</div> }
function Task({t, updateTaskStatus, deleteTask}) {
  return <div className="task"><i></i><div><b>{t.title}</b><span>{t.assignee_name} · {t.priority} · {t.due_date||'No due date'}</span></div><div className="taskActions"><select value={t.status || 'To Do'} onChange={e=>updateTaskStatus(t.id, e.target.value)}><option>To Do</option><option>In Progress</option><option>Completed</option></select><button className="miniDelete" onClick={()=>deleteTask(t.id)}>×</button></div></div>
}
function MonthControls({month,setMonth}) { return <div className="actions"><button className="light" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>← Previous</button><button className="light" onClick={()=>setMonth(new Date())}>Today</button><button className="light" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>Next →</button></div> }
function eventClass(type) {
  if(type === 'Business Trip') return 'trip';
  if(type === 'Installation') return 'install';
  if(type === 'Exhibition') return 'exhibition';
  if(type === 'Office Visit') return 'office';
  if(type === 'Day Off') return 'dayoff';
  return 'office';
}
function isWithin(dayKey, start, end) {
  const d = new Date(dayKey + 'T00:00:00');
  const s = new Date((start || dayKey) + 'T00:00:00');
  const e = new Date((end || start || dayKey) + 'T00:00:00');
  return d >= s && d <= e;
}
function Calendar({month,events,deleteEvent}) {
  const y=month.getFullYear(), m=month.getMonth(), first=new Date(y,m,1).getDay(), last=new Date(y,m+1,0).getDate();
  const cells=[]; for(let i=0;i<first;i++) cells.push(null); for(let d=1;d<=last;d++) cells.push(d); while(cells.length<42) cells.push(null);
  return <div className="cal">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=><div className="dow" key={x}>{x}</div>)}{cells.map((d,i)=>!d?<div className="day emptyDay" key={i}/>:<div className="day" key={i}><b>{d}</b>{events.filter(e=>isWithin(`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, e.event_date, e.end_date)).map(e=><span className={eventClass(e.type)} key={e.id} title={`Created by ${e.created_by_name || 'Unknown'}`}>{e.title}{e.all_day?'':' · '+(e.event_time||'')}<small>by {e.created_by_name || 'Unknown'}</small><button className="miniDelete" onClick={()=>deleteEvent(e.id)}>×</button></span>)}</div>)}</div>
}
function Table({headers,rows}) { return <table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>):<tr><td colSpan={headers.length} className="emptyCell">No records yet.</td></tr>}</tbody></table> }

createRoot(document.getElementById('root')).render(<App/>);
