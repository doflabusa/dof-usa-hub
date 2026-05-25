import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import {
  CalendarDays, CheckSquare, Clock, LogOut, MapPin, Plane,
  Settings, ShieldCheck, Users, UserPlus, BarChart3, Package,
  Plus, ChevronLeft, ChevronRight, Download, ClipboardCheck
} from 'lucide-react';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'smyoo@doflab.com';

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const nav = [
  ['Dashboard', Clock],
  ['Attendance', Clock],
  ['Calendar', CalendarDays],
  ['Tasks', CheckSquare],
  ['Field Work', MapPin],
  ['Employees', Users],
  ['Admin', ShieldCheck],
];

const pageSubtitles = {
  Dashboard: 'Mission control for attendance, tasks, schedules, and field work.',
  Attendance: 'Employee time records, timezone logs, and Excel-compatible export.',
  Calendar: 'Company and personal calendar with monthly navigation.',
  Tasks: 'Create, assign, track, and complete team tasks.',
  'Field Work': 'Record customer visits, installations, trainings, and business trips.',
  Employees: 'Employee directory and status overview.',
  Admin: 'Admin-only tools and system controls.'
};

function localTZ() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
}
function fmt(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString();
}
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function csvDownload(rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dof_usa_attendance_export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('Dashboard');
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState(null);
  const [month, setMonth] = useState(new Date());

  const [attendance, setAttendance] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [fieldwork, setFieldwork] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [taskForm, setTaskForm] = useState({ title:'', assignee_name:'Justin Yoo', priority:'Medium', due_date:'', description:'' });
  const [eventForm, setEventForm] = useState({ title:'', event_date:'', event_time:'', type:'Company', visibility:'Public', notes:'' });
  const [fieldForm, setFieldForm] = useState({ customer_name:'', location_text:'', purpose:'' });

  const isAdmin = profile?.role === 'admin';
  const openRecord = attendance.find(r => r.user_id === session?.user?.id && r.status === 'checked_in');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadAll();
  }, [session]);

  async function signIn(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }
  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }
  async function ensureProfile() {
    const user = session.user;
    let { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!data) {
      const role = user.email === ADMIN_EMAIL ? 'admin' : 'employee';
      const full_name = user.email === ADMIN_EMAIL ? 'Justin Yoo' : user.email;
      const insert = { id: user.id, email: user.email, full_name, role, status:'active' };
      const res = await supabase.from('profiles').insert(insert).select().single();
      if (res.error) console.warn(res.error);
      data = res.data || insert;
    }
    setProfile(data);
    return data;
  }
  async function loadAll() {
    const p = await ensureProfile();
    const [a, t, c, f, ps] = await Promise.all([
      supabase.from('attendance_records').select('*').order('created_at', { ascending:false }),
      supabase.from('tasks').select('*').order('created_at', { ascending:false }),
      supabase.from('calendar_events').select('*').order('event_date', { ascending:true }),
      supabase.from('field_work_records').select('*').order('created_at', { ascending:false }),
      supabase.from('profiles').select('*').order('created_at', { ascending:true })
    ]);
    setAttendance(a.data || []);
    setTasks(t.data || []);
    setEvents(c.data || []);
    setFieldwork(f.data || []);
    setProfiles(ps.data?.length ? ps.data : [p]);
  }
  async function clockIn() {
    if (openRecord) return alert('You are already clocked in.');
    const p = profile || await ensureProfile();
    const locationText = window.prompt('Enter current location, for example Anaheim, CA:', 'Anaheim, CA') || 'Location pending';
    const { error } = await supabase.from('attendance_records').insert({
      user_id: session.user.id,
      employee_name: p.full_name || session.user.email,
      clock_in_at: new Date().toISOString(),
      local_timezone: localTZ(),
      hq_timezone: 'America/Los_Angeles',
      location_text: locationText,
      status: 'checked_in'
    });
    if (error) alert(error.message);
    await loadAll();
  }
  async function clockOut() {
    if (!openRecord) return alert('No active clock-in record found.');
    const { error } = await supabase.from('attendance_records').update({
      clock_out_at: new Date().toISOString(),
      status: 'completed'
    }).eq('id', openRecord.id);
    if (error) alert(error.message);
    await loadAll();
  }
  async function createTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    const { error } = await supabase.from('tasks').insert({
      ...taskForm,
      created_by: session.user.id,
      assignee_name: taskForm.assignee_name || profile?.full_name || 'Justin Yoo'
    });
    if (error) alert(error.message);
    setTaskForm({ title:'', assignee_name:profile?.full_name || 'Justin Yoo', priority:'Medium', due_date:'', description:'' });
    await loadAll();
  }
  async function createEvent(e) {
    e.preventDefault();
    if (!eventForm.title.trim() || !eventForm.event_date) return;
    const { error } = await supabase.from('calendar_events').insert({ ...eventForm, created_by: session.user.id });
    if (error) alert(error.message);
    setEventForm({ title:'', event_date:'', event_time:'', type:'Company', visibility:'Public', notes:'' });
    await loadAll();
  }
  async function createFieldWork(e) {
    e.preventDefault();
    const p = profile || await ensureProfile();
    const { error } = await supabase.from('field_work_records').insert({
      ...fieldForm,
      user_id: session.user.id,
      employee_name: p.full_name,
      local_timezone: localTZ()
    });
    if (error) alert(error.message);
    setFieldForm({ customer_name:'', location_text:'', purpose:'' });
    await loadAll();
  }
  function exportAttendance() {
    if (!isAdmin) return alert('Admin only.');
    const rows = [
      ['Employee','Clock In','Clock Out','Local Timezone','HQ Timezone','Location','Status'],
      ...attendance.map(r => [r.employee_name, fmt(r.clock_in_at), fmt(r.clock_out_at), r.local_timezone, r.hq_timezone, r.location_text, r.status])
    ];
    csvDownload(rows);
  }

  const monthName = month.toLocaleString('en-US', { month:'long', year:'numeric' });

  if (!supabase) return <SetupNotice />;
  if (!session) return (
    <div className="login">
      <div className="loginHero">
        <div className="loginBrand">DOF USA HUB</div>
        <p>Internal operations portal for attendance, tasks, calendar, field work, and admin export.</p>
      </div>
      <form className="loginCard" onSubmit={signIn}>
        <h2>Sign in</h2>
        <label>Email</label>
        <input value={email} onChange={e=>setEmail(e.target.value)} />
        <label>Password</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button>Login</button>
      </form>
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">DOF USA HUB</div>
        <div className="sideSub">Internal operations portal for DOF LAB USA, Inc.</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button key={name} className={page===name?'active':''} onClick={()=>setPage(name)}>
              <Icon size={18}/> {name}
            </button>
          ))}
        </nav>
        <div className="sideCard">
          <strong>HQ Timezone</strong>
          <span>Anaheim, CA · America/Los_Angeles<br/>PST/PDT switches automatically.</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{page}</h1>
            <p>{pageSubtitles[page]}</p>
          </div>
          <div className="profilePill">
            <div className="avatar">J</div>
            <div><strong>{profile?.full_name || session.user.email}</strong><small>{profile?.role}</small></div>
            <button className="logout" onClick={signOut}><LogOut size={16}/> Logout</button>
          </div>
        </header>

        {page === 'Dashboard' && (
          <>
            <section className="kpis">
              <KPI label="Attendance" value={openRecord?'In':'Not In'} icon={<Clock/>} type="blue" sub={localTZ()} />
              <KPI label="Tasks" value={tasks.length} icon={<CheckSquare/>} type="green" sub="Assigned and created tasks" />
              <KPI label="Events" value={events.length} icon={<CalendarDays/>} type="orange" sub="Company and personal events" />
              <KPI label="Field Work" value={fieldwork.length} icon={<MapPin/>} type="purple" sub="Customer visits and trips" />
            </section>

            <section className="dashboardGrid">
              <Card title="Attendance & Location" action={<button onClick={openRecord ? clockOut : clockIn}>{openRecord ? 'Clock Out' : 'Clock In'}</button>}>
                <div className="clockPanel">
                  <div className="clockBox">
                    <div className="clockTime">{openRecord ? new Date(openRecord.clock_in_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</div>
                    <div className="clockMeta">
                      {openRecord ? 'Checked in' : 'Not clocked in'}<br/>
                      Local Timezone: {openRecord?.local_timezone || localTZ()}<br/>
                      Location: {openRecord?.location_text || 'Not recorded yet'}
                    </div>
                  </div>
                  <div className="infoList">
                    <div><span>HQ Timezone</span><strong>America/Los_Angeles</strong></div>
                    <div><span>Status</span><strong>{openRecord ? 'Checked In' : 'Not In'}</strong></div>
                    <div><span>Admin Export</span><strong>{isAdmin ? 'Enabled' : 'Hidden'}</strong></div>
                  </div>
                </div>
              </Card>

              <Card title="Task Assignment" action={<button onClick={()=>setPage('Tasks')}>+ Task</button>}>
                {tasks.length ? tasks.slice(0,4).map(t => <TaskItem key={t.id} task={t}/>) : <Empty text="No tasks yet."/>}
              </Card>
            </section>

            <Card title={`${monthName} Calendar`} action={<MonthControls month={month} setMonth={setMonth}/>}>
              <CalendarGrid month={month} events={events}/>
            </Card>
          </>
        )}

        {page === 'Attendance' && (
          <Card title="Attendance Records" action={<div className="actions"><button onClick={clockIn}>Clock In</button><button className="dark" onClick={clockOut}>Clock Out</button>{isAdmin && <button className="light" onClick={exportAttendance}><Download size={16}/> Export CSV</button>}</div>}>
            {!isAdmin && <div className="notice">Export is available to Admin users only.</div>}
            <DataTable headers={['Employee','Clock In','Clock Out','Timezone','Location','Status']} rows={attendance.map(r=>[r.employee_name, fmt(r.clock_in_at), fmt(r.clock_out_at), r.local_timezone, r.location_text, r.status])}/>
          </Card>
        )}

        {page === 'Calendar' && (
          <>
            <Card title={`${monthName} Calendar`} action={<div className="actions"><MonthControls month={month} setMonth={setMonth}/><button onClick={()=>document.getElementById('eventFormTitle')?.focus()}>+ New Event</button></div>}>
              <CalendarGrid month={month} events={events}/>
            </Card>
            <Card title="Create Event">
              <form className="formGrid" onSubmit={createEvent}>
                <input id="eventFormTitle" placeholder="Event title" value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})}/>
                <input type="date" value={eventForm.event_date} onChange={e=>setEventForm({...eventForm,event_date:e.target.value})}/>
                <input type="time" value={eventForm.event_time} onChange={e=>setEventForm({...eventForm,event_time:e.target.value})}/>
                <select value={eventForm.type} onChange={e=>setEventForm({...eventForm,type:e.target.value})}><option>Company</option><option>Personal</option><option>Field Work</option><option>Installation</option></select>
                <button>Create Event</button>
              </form>
            </Card>
          </>
        )}

        {page === 'Tasks' && (
          <section className="twoCol">
            <Card title="Create / Assign Task">
              <form onSubmit={createTask} className="formStack">
                <label>Task Title</label>
                <input placeholder="Example: Follow up with customer" value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})}/>
                <label>Assign To</label>
                <input placeholder="Justin Yoo" value={taskForm.assignee_name} onChange={e=>setTaskForm({...taskForm,assignee_name:e.target.value})}/>
                <label>Due Date</label>
                <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})}/>
                <label>Priority</label>
                <select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select>
                <label>Description</label>
                <textarea value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})}/>
                <button>Create Task</button>
              </form>
            </Card>
            <Card title="Task List">
              {tasks.length ? tasks.map(t => <TaskItem key={t.id} task={t}/>) : <Empty text="No tasks yet."/>}
            </Card>
          </section>
        )}

        {page === 'Field Work' && (
          <section className="twoCol">
            <Card title="Field Work Check-In">
              <form onSubmit={createFieldWork} className="formStack">
                <label>Customer / Company</label>
                <input value={fieldForm.customer_name} onChange={e=>setFieldForm({...fieldForm,customer_name:e.target.value})}/>
                <label>Location</label>
                <input value={fieldForm.location_text} onChange={e=>setFieldForm({...fieldForm,location_text:e.target.value})}/>
                <label>Purpose</label>
                <textarea value={fieldForm.purpose} onChange={e=>setFieldForm({...fieldForm,purpose:e.target.value})}/>
                <button>Submit Field Work</button>
              </form>
            </Card>
            <Card title="Field Work Records">
              {fieldwork.length ? fieldwork.map(f => <div className="listItem" key={f.id}><strong>{f.customer_name || 'Field Work'}</strong><span>{f.location_text || '-'} · {f.local_timezone}</span></div>) : <Empty text="No field work records yet."/>}
            </Card>
          </section>
        )}

        {page === 'Employees' && (
          <Card title="Employees">
            <DataTable headers={['Name','Email','Role','Status']} rows={profiles.map(p=>[p.full_name, p.email, p.role, p.status])}/>
          </Card>
        )}

        {page === 'Admin' && (
          <section className="twoCol">
            <Card title="Admin Tools">
              <div className="adminActions">
                <button onClick={exportAttendance}><Download size={16}/> Export Attendance CSV</button>
                <button className="light" onClick={loadAll}><ClipboardCheck size={16}/> Refresh Data</button>
              </div>
              {!isAdmin && <div className="notice">Admin-only tools are hidden for employee users.</div>}
            </Card>
            <Card title="System Status">
              <div className="infoList">
                <div><span>Current User</span><strong>{profile?.email}</strong></div>
                <div><span>Role</span><strong>{profile?.role}</strong></div>
                <div><span>Local Timezone</span><strong>{localTZ()}</strong></div>
              </div>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}

function SetupNotice() {
  return <div className="setup"><h1>DOF USA HUB</h1><p>Supabase is not configured yet.</p></div>;
}
function KPI({label,value,icon,type,sub}) {
  return <div className="kpi"><div className="kpiTop"><div><div className="kpiLabel">{label}</div><div className="kpiValue">{value}</div></div><div className={`kpiIcon ${type}`}>{icon}</div></div><div className="kpiSub">{sub}</div></div>;
}
function Card({title,action,children}) {
  return <section className="card"><div className="cardHead"><h2>{title}</h2>{action}</div>{children}</section>;
}
function Empty({text}) { return <div className="empty">{text}</div>; }
function TaskItem({task}) {
  const cls = task.priority === 'High' ? 'red' : task.priority === 'Low' ? 'green' : 'orange';
  return <div className="taskItem"><div className="fakeCheck"></div><div><strong>{task.title}</strong><span>{task.assignee_name || '-'} · {task.due_date ? fmtDate(task.due_date) : 'No due date'} · {task.status}</span></div><em className={cls}>{task.priority}</em></div>;
}
function MonthControls({month,setMonth}) {
  return <div className="monthControls"><button className="light" onClick={()=>setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}><ChevronLeft size={16}/> Previous</button><button className="light" onClick={()=>setMonth(new Date())}>Today</button><button className="light" onClick={()=>setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}>Next <ChevronRight size={16}/></button></div>;
}
function CalendarGrid({month, events}) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y,m,1).getDay();
  const last = new Date(y,m+1,0).getDate();
  const cells = [];
  for(let i=0;i<first;i++) cells.push(null);
  for(let d=1; d<=last; d++) cells.push(d);
  while(cells.length < 42) cells.push(null);
  return <div className="calendarGrid">
    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div className="dayName" key={d}>{d}</div>)}
    {cells.map((d,i)=>{
      if(!d) return <div className="day emptyDay" key={i}></div>;
      const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayEvents = events.filter(e => e.event_date === key);
      return <div className="day" key={i}><strong>{d}</strong>{dayEvents.map(e=><span className={`event ${e.type}`} key={e.id}>{e.title}</span>)}</div>
    })}
  </div>
}
function DataTable({headers, rows}) {
  return <table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>) : <tr><td colSpan={headers.length} className="emptyCell">No records yet.</td></tr>}</tbody></table>;
}

createRoot(document.getElementById('root')).render(<App />);
