import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { CalendarDays, CheckSquare, Clock, LogOut, MapPin, Plus, User, Users } from 'lucide-react';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'smyoo@doflab.com';

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function localTZ() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
}

function fmt(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString();
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

  const [attendance, setAttendance] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [fieldwork, setFieldwork] = useState([]);

  const [taskForm, setTaskForm] = useState({ title:'', assignee_name:'Justin Yoo', priority:'Medium', due_date:'', description:'' });
  const [eventForm, setEventForm] = useState({ title:'', event_date:'', event_time:'', type:'Company', visibility:'Public', notes:'' });
  const [fieldForm, setFieldForm] = useState({ customer_name:'', location_text:'', purpose:'' });

  const isAdmin = profile?.role === 'admin';

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
    if (!supabase) {
      alert('Supabase is not configured yet. Add .env values first.');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  async function ensureProfile() {
    const user = session.user;
    let { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!data) {
      const role = user.email === ADMIN_EMAIL ? 'admin' : 'employee';
      const full_name = user.email === ADMIN_EMAIL ? 'Justin Yoo' : user.email;
      const insert = { id: user.id, email: user.email, full_name, role, status:'active' };
      await supabase.from('profiles').insert(insert);
      data = insert;
    }
    setProfile(data);
    return data;
  }

  async function loadAll() {
    const p = await ensureProfile();
    const [a, t, c, f] = await Promise.all([
      supabase.from('attendance_records').select('*').order('created_at', { ascending:false }),
      supabase.from('tasks').select('*').order('created_at', { ascending:false }),
      supabase.from('calendar_events').select('*').order('event_date', { ascending:true }),
      supabase.from('field_work_records').select('*').order('created_at', { ascending:false })
    ]);
    setAttendance(a.data || []);
    setTasks(t.data || []);
    setEvents(c.data || []);
    setFieldwork(f.data || []);
  }

  async function clockIn() {
    const p = profile || await ensureProfile();
    const { error } = await supabase.from('attendance_records').insert({
      user_id: session.user.id,
      employee_name: p.full_name || session.user.email,
      clock_in_at: new Date().toISOString(),
      local_timezone: localTZ(),
      hq_timezone: 'America/Los_Angeles',
      location_text: 'Location pending',
      status: 'checked_in'
    });
    if (error) alert(error.message);
    await loadAll();
  }

  async function clockOut() {
    const open = attendance.find(r => r.user_id === session.user.id && r.status === 'checked_in');
    if (!open) return alert('No active clock-in record found.');
    const { error } = await supabase.from('attendance_records').update({
      clock_out_at: new Date().toISOString(),
      status: 'completed'
    }).eq('id', open.id);
    if (error) alert(error.message);
    await loadAll();
  }

  async function createTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    const { error } = await supabase.from('tasks').insert({
      ...taskForm,
      created_by: session.user.id,
      assignee_name: taskForm.assignee_name || 'Justin Yoo'
    });
    if (error) alert(error.message);
    setTaskForm({ title:'', assignee_name:'Justin Yoo', priority:'Medium', due_date:'', description:'' });
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

  if (!supabase) {
    return <SetupNotice />;
  }

  if (!session) {
    return (
      <div className="login">
        <div className="loginHero">
          <h1>DOF USA HUB</h1>
          <p>Internal operations portal for attendance, tasks, calendar, field work, and admin export.</p>
        </div>
        <form className="loginCard" onSubmit={signIn}>
          <h2>Sign in</h2>
          <label>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button>Login</button>
          <p className="hint">Create the Justin Yoo account in Supabase Auth first: {ADMIN_EMAIL}</p>
        </form>
      </div>
    );
  }

  const openRecord = attendance.find(r => r.user_id === session.user.id && r.status === 'checked_in');

  return (
    <div className="app">
      <aside>
        <div className="brand">DOF USA HUB</div>
        {['Dashboard','Attendance','Tasks','Calendar','Field Work','Employees','Admin'].map(x => (
          <button key={x} className={page===x?'active':''} onClick={()=>setPage(x)}>{x}</button>
        ))}
      </aside>

      <main>
        <header>
          <div>
            <h1>{page}</h1>
            <p>{profile?.full_name || session.user.email} · {profile?.role}</p>
          </div>
          <button className="ghost" onClick={signOut}><LogOut size={16}/> Logout</button>
        </header>

        {page === 'Dashboard' && (
          <>
            <section className="stats">
              <Stat icon={<Clock/>} label="Attendance" value={openRecord?'Clocked In':'Not In'} />
              <Stat icon={<CheckSquare/>} label="Tasks" value={tasks.length} />
              <Stat icon={<CalendarDays/>} label="Events" value={events.length} />
              <Stat icon={<MapPin/>} label="Field Work" value={fieldwork.length} />
            </section>
            <section className="grid2">
              <Card title="Quick Clock">
                <p>Status: {openRecord ? 'Currently clocked in' : 'Not clocked in'}</p>
                <p>Timezone: {localTZ()}</p>
                <div className="row">
                  <button onClick={clockIn}>Clock In</button>
                  <button className="secondary" onClick={clockOut}>Clock Out</button>
                </div>
              </Card>
              <Card title="Latest Tasks">
                {tasks.length ? tasks.slice(0,5).map(t=><Item key={t.id} title={t.title} meta={`${t.assignee_name || '-'} · ${t.priority} · ${t.status}`} />) : <Empty text="No tasks yet."/>}
              </Card>
            </section>
          </>
        )}

        {page === 'Attendance' && (
          <Card title="Attendance Records" action={isAdmin && <button onClick={exportAttendance}>Export CSV / Excel</button>}>
            <div className="row">
              <button onClick={clockIn}>Clock In</button>
              <button className="secondary" onClick={clockOut}>Clock Out</button>
            </div>
            <Table headers={['Employee','Clock In','Clock Out','Timezone','Location','Status']} rows={attendance.map(r=>[
              r.employee_name, fmt(r.clock_in_at), fmt(r.clock_out_at), r.local_timezone, r.location_text, r.status
            ])}/>
          </Card>
        )}

        {page === 'Tasks' && (
          <section className="grid2">
            <Card title="Create Task">
              <form onSubmit={createTask} className="form">
                <input placeholder="Task title" value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})}/>
                <input placeholder="Assign to" value={taskForm.assignee_name} onChange={e=>setTaskForm({...taskForm,assignee_name:e.target.value})}/>
                <select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select>
                <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})}/>
                <textarea placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})}/>
                <button>Create Task</button>
              </form>
            </Card>
            <Card title="Task List">
              {tasks.length ? tasks.map(t=><Item key={t.id} title={t.title} meta={`${t.assignee_name || '-'} · ${t.priority} · ${t.due_date || 'No due date'} · ${t.status}`} />) : <Empty text="No tasks yet."/>}
            </Card>
          </section>
        )}

        {page === 'Calendar' && (
          <section className="grid2">
            <Card title="Create Event">
              <form onSubmit={createEvent} className="form">
                <input placeholder="Event title" value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})}/>
                <input type="date" value={eventForm.event_date} onChange={e=>setEventForm({...eventForm,event_date:e.target.value})}/>
                <input type="time" value={eventForm.event_time} onChange={e=>setEventForm({...eventForm,event_time:e.target.value})}/>
                <select value={eventForm.type} onChange={e=>setEventForm({...eventForm,type:e.target.value})}><option>Company</option><option>Personal</option><option>Field Work</option><option>Installation</option></select>
                <textarea placeholder="Notes" value={eventForm.notes} onChange={e=>setEventForm({...eventForm,notes:e.target.value})}/>
                <button>Create Event</button>
              </form>
            </Card>
            <Card title="Events">
              {events.length ? events.map(e=><Item key={e.id} title={e.title} meta={`${e.event_date} ${e.event_time || ''} · ${e.type}`} />) : <Empty text="No events yet."/>}
            </Card>
          </section>
        )}

        {page === 'Field Work' && (
          <section className="grid2">
            <Card title="Field Work Check-In">
              <form onSubmit={createFieldWork} className="form">
                <input placeholder="Customer / Company" value={fieldForm.customer_name} onChange={e=>setFieldForm({...fieldForm,customer_name:e.target.value})}/>
                <input placeholder="Location" value={fieldForm.location_text} onChange={e=>setFieldForm({...fieldForm,location_text:e.target.value})}/>
                <textarea placeholder="Purpose" value={fieldForm.purpose} onChange={e=>setFieldForm({...fieldForm,purpose:e.target.value})}/>
                <button>Submit Field Work</button>
              </form>
            </Card>
            <Card title="Field Work Records">
              {fieldwork.length ? fieldwork.map(f=><Item key={f.id} title={f.customer_name || 'Field Work'} meta={`${f.location_text || '-'} · ${f.local_timezone || ''}`} />) : <Empty text="No field work records yet."/>}
            </Card>
          </section>
        )}

        {page === 'Employees' && (
          <Card title="Employees">
            <Table headers={['Name','Email','Role','Status']} rows={profile ? [[profile.full_name, profile.email, profile.role, profile.status]] : []}/>
          </Card>
        )}

        {page === 'Admin' && (
          <Card title="Admin Tools">
            <p>Admin Email: {ADMIN_EMAIL}</p>
            <p>Current Role: {profile?.role}</p>
            {isAdmin ? <button onClick={exportAttendance}>Export Attendance CSV</button> : <p>Admin-only tools are hidden for employees.</p>}
          </Card>
        )}
      </main>
    </div>
  );
}

function SetupNotice() {
  return <div className="setup"><h1>DOF USA HUB</h1><p>Supabase is not configured yet.</p><p>Create a <code>.env</code> file from <code>.env.example</code>, then add your Supabase URL and anon key.</p></div>;
}
function Stat({icon,label,value}) { return <div className="stat"><div className="statIcon">{icon}</div><span>{label}</span><strong>{value}</strong></div>; }
function Card({title,action,children}) { return <section className="card"><div className="cardHead"><h2>{title}</h2>{action}</div>{children}</section>; }
function Item({title,meta}) { return <div className="item"><strong>{title}</strong><span>{meta}</span></div>; }
function Empty({text}) { return <div className="empty">{text}</div>; }
function Table({headers,rows}) {
  return <table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>) : <tr><td colSpan={headers.length} className="emptyCell">No records yet.</td></tr>}</tbody></table>;
}

createRoot(document.getElementById('root')).render(<App />);
