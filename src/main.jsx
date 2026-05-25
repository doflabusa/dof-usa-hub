
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const LOGO = "data:image/png;base64,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8Q+3q9u7ZN68lWbEeEaNmq2O65L27Wuvo31bh2QTrWU13333o3mGxdQMRXvx4i/VcX3FpWgLOVmojeMauarJZc13mfzxhBMeVMdyTVxPPz297ntix46jvK+60Ewo2oEUpWhXW7LGR1GbMSPZ5EGuCVW0hw6t/KAt9/3IHzMbFO30aK+FbbJWtOVqEu04XdKhw4ioX7/J3qPtyyWvvbbIPMv6tO1tE7do//zzztLa5Zde2k8dN05efnm+GT09SS+lLs/11z9d+mal1rJTUiRGPVd5hVTSLF26xuyhNl9zGkixl/XIXaxe/a23OUr6959sRq3kY+IpuRRV+91OGm1fLpFbHoqsGYq2GDJkujq2j7gWbTlxpo0TN3K1p5RTeZ+TE5Dz5v27tDKPTJgpJxdvu21k9OeES/u1TtzfCZel/047rUf05ZfFXv41FIp2IEUo2tUuPbuqnd03tTYef3ySuo8QCVG0x43TL921uWS8BUU7PdprYZsLzn88uueeManEhvwb047TJbt2uU08ZivpfW8us7lq29vmkr8/UbqEt17kferhh8aXPiDJWs3aWEmzfv335hmlZ/v2HYlmua0VmTxM/jvKh7m77no+uv66If+5LNF3rrnG/pLiV19dqI4RNzfeOLS0fKN8kP722x/+8zsll4TKZGVyaarceiUnIbTt4+ajj74s7Ucz6fUP1G1csmVLmG+wki7xGWoN96xolqIt2l89WB0/aVyLtuh4xyh1rDwkjji3b4aYELIZULQDyXvRlvs1tH2ccUZP7zN/ygcVbV++47toj31RX/P1gQdeMo+wQ9FOj/ZaZDE263MmWapIcsvNbvdCu6h2u4lLbO/71bbNW3yevHT15BNvqseUpyxc+Ll5NnaOPqqrOk5ecsbpPc0z0cnvtradbaQAhTL33RXqPl1is354XjVT0Q41MW6cor1u3ffR/v8b5qRjyMS5N/vjj9eoY9mkV6/6/77QFkU7kLwWbVnuoNaSICEW6JdvVc47N8y3RK3js2hXu+xJLkt0RdFOj/ZaZDH1fs82btiqbueSVxzuJXPl49JV23vdtG3zlkaufyrfvGrHlJfIt+WutNt98pRasxz/9NMv6jYukUteQ9L26RK5gqComqloixc8XJlVnjhFW4Q4lpCJ894nunQZq45nE7mf++cEk182I4p2IHks2nLPoTau5Kyz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";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'smyoo@doflab.com';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const baseMenu = [
  ['🏠','Dashboard'], ['⏱','Attendance'], ['📅','Calendar'],
  ['✅','Tasks'], ['🌴','Leave']
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

function currentQuote() {
  return monthlyQuotes[new Date().getMonth()];
}

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
    if(!balanceForm.user_id && profileRows.length) setBalanceForm(prev => ({...prev, user_id: profileRows[0].id}));
    if(!task.assignee_id && profileRows.length) {
      setTask(prev => ({...prev, assignee_id: profileRows[0].id}));
    }
  }

  async function startShift() {
    setError('');
    setNotice('');
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
    setError('');
    setNotice('');
    if(!open) return setError('No active shift found.');
    if(!window.confirm('Would you like to end your shift now?')) return;
    const endedAt = new Date().toISOString();
    const res = await supabase.from('attendance_records')
      .update({ clock_out_at:endedAt, status:'completed' })
      .eq('id', open.id);
    if(res.error) return setError('Shift End error: ' + res.error.message);
    setNotice(`Shift Ended. Today's work time: ${hoursBetween(open.clock_in_at, endedAt)}`);
    await loadAll();
  }

  async function createTask(e) {
    e.preventDefault();
    setError('');
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
    setError('');
    const res = await supabase.from('tasks').update({ status }).eq('id', id);
    if(res.error) return setError('Task update error: ' + res.error.message);
    await loadAll();
  }

  async function deleteTask(id) {
    setError('');
    if(!window.confirm('Delete this task?')) return;
    const res = await supabase.from('tasks').delete().eq('id', id);
    if(res.error) return setError('Task delete error: ' + res.error.message);
    await loadAll();
  }

  async function createEvent(e) {
    e.preventDefault();
    setError('');
    if(!event.title.trim() || !event.event_date) return setError('Event title and start date are required.');
    const row = {
      ...event,
      end_date: event.end_date || event.event_date,
      event_time:event.all_day ? null : event.event_time,
      created_by:session.user.id, created_by_name: profile?.full_name
    };
    const res = await supabase.from('calendar_events').insert(row);
    if(res.error) return setError('Event create error: ' + res.error.message);
    setEvent({ title:'', event_date:'', end_date:'', event_time:'', all_day:true, type:'Exhibition', notes:'' });
    setNotice('Event created.');
    await loadAll();
  }

  async function deleteEvent(id) {
    setError('');
    if(!window.confirm('Delete this event?')) return;
    const res = await supabase.from('calendar_events').delete().eq('id', id);
    if(res.error) return setError('Event delete error: ' + res.error.message);
    await loadAll();
  }

  async function createLeave(e) {
    e.preventDefault();
    setError('');
    if(!leave.start_date || !leave.end_date) return setError('Leave start and end date are required.');
    const res = await supabase.from('leave_requests').insert({
      user_id: session.user.id,
      employee_name: profile?.full_name,
      leave_type: leave.leave_type,
      start_date: leave.start_date,
      end_date: leave.end_date,
      hours: Number(leave.hours || 8) * daysInclusive(leave.start_date, leave.end_date),
      reason: leave.reason,
      status: 'Pending'
    });
    if(res.error) return setError('Leave request error: ' + res.error.message);
    setLeave({ leave_type:'Paid Time Off', start_date:'', end_date:'', reason:'' });
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
    e.preventDefault();
    setError('');
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
        <nav>
          {[...baseMenu, ...(isAdmin ? adminMenu : [])].map(([ico,name])=>
            <button key={name} className={page===name?'active':''} onClick={()=>setPage(name)}>
              <span>{ico}</span>{name}
            </button>
          )}
        </nav>
        <div className="tz"><b>HQ Timezone</b><br/>America/Los_Angeles<br/>PST/PDT automatic</div>
      </aside>

      <main>
        <header>
          <div><h1>{page}</h1><p>{profile?.full_name} · {profile?.role}</p></div>
          <button className="light" onClick={logout}>↪ Logout</button>
        </header>

        {error && <div className="err">{error}</div>}
        {notice && <div className="ok">{notice}</div>}

        {page==='Dashboard' &&
          <Dashboard open={open} tasks={tasks} events={events} leaves={leaves} quote={currentQuote()} startShift={startShift} endShift={endShift} setPage={setPage} month={month} setMonth={setMonth} />
        }

        {page==='Attendance' &&
          <Card title="Attendance Records" action={
            <div className="actions">
              <button onClick={startShift}>Shift Started</button>
              <button className="dark" onClick={endShift}>Shift Ended</button>
            </div>
          }>
            <p className="hint">{isAdmin ? 'Admin view: all employee attendance records are visible here. Export is available only in Admin.' : 'Employee view: only your own attendance records are visible.'}</p>
            <Table headers={['Employee','Shift Started','Shift Ended','Total Hours','Timezone','Status']}
              rows={visibleAttendance.map(r=>[r.employee_name,fmt(r.clock_in_at),fmt(r.clock_out_at),hoursBetween(r.clock_in_at,r.clock_out_at),r.local_timezone,r.status])} />
          </Card>
        }

        {page==='Calendar' &&
          <>
            <Card title="Create Event">
              <form onSubmit={createEvent} className="eventForm">
                <input placeholder="Event title" value={event.title} onChange={e=>setEvent({...event,title:e.target.value})}/>
                <input type="date" value={event.event_date} onChange={e=>setEvent({...event,event_date:e.target.value})}/>
                <input type="date" value={event.end_date} onChange={e=>setEvent({...event,end_date:e.target.value})} title="End date"/>
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
          </>
        }

        {page==='Tasks' &&
          <div className="two">
            <Card title="Create / Assign Task">
              <form onSubmit={createTask} className="form">
                <input placeholder="Task title" value={task.title} onChange={e=>setTask({...task,title:e.target.value})}/>
                <select value={task.assignee_id} onChange={e=>setTask({...task,assignee_id:e.target.value})}>
                  <option value="">Select assignee</option>
                  {profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
                <input type="date" value={task.due_date} onChange={e=>setTask({...task,due_date:e.target.value})}/>
                <select value={task.priority} onChange={e=>setTask({...task,priority:e.target.value})}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
                <textarea placeholder="Description" value={task.description} onChange={e=>setTask({...task,description:e.target.value})}/>
                <button>Assign Task</button>
              </form>
            </Card>
            <Card title="Task List">
              {visibleTasks.length ? visibleTasks.map(t=><Task key={t.id} t={t} updateTaskStatus={updateTaskStatus} deleteTask={deleteTask}/>) : <Empty text="No tasks yet."/>}
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
          </>
        }

        {page==='Leave' &&
          <>
          <div className="two">
            <Card title="Request Leave">
              <form onSubmit={createLeave} className="form">
                <select value={leave.leave_type} onChange={e=>setLeave({...leave,leave_type:e.target.value})}>
                  <option>Paid Time Off</option><option>Paid Sick Leave</option><option>Unpaid Leave</option>
                </select>
                <input type="date" value={leave.start_date} onChange={e=>setLeave({...leave,start_date:e.target.value})}/>
                <input type="date" value={leave.end_date} onChange={e=>setLeave({...leave,end_date:e.target.value})}/>
                <input type="number" min="1" step="0.5" value={leave.hours} onChange={e=>setLeave({...leave,hours:e.target.value})} placeholder="Hours per day"/>
                <textarea placeholder="Reason / notes" value={leave.reason} onChange={e=>setLeave({...leave,reason:e.target.value})}/>
                <button>Submit Request</button>
              </form>
            </Card>
            <Card title="Leave Requests">
              <Table headers={isAdmin?['Employee','Type','Start','End','Status','Action']:['Type','Start','End','Status']}
                rows={visibleLeaves.map(r=> isAdmin ? [r.employee_name,r.leave_type,r.start_date,r.end_date,r.status,
                  r.status==='Pending' ? <LeaveActions key={r.id} row={r} updateLeaveStatus={updateLeaveStatus}/> : '-'
                ] : [r.leave_type,r.start_date,r.end_date,r.status])} />
            </Card>
          </div>
        }

        {page==='Employees' &&
          <Card title="Employees">
            <Table headers={['Name','Email','Role','Status']} rows={profiles.map(p=>[p.full_name,p.email,p.role,p.status])} />
          </Card>
        }

        {page==='Admin' &&
          <Card title="Admin Tools">
            <div className="actions">
              <button onClick={exportCSV}>Export Attendance CSV</button>
              <button className="light" onClick={loadAll}>Refresh Data</button>
            </div>
          </Card>
        }
      </main>
    </div>
  );
}

function LeaveActions({row, updateLeaveStatus}) {
  return <div className="actions"><button onClick={()=>updateLeaveStatus(row,'Approved')}>Approve</button><button className="dark" onClick={()=>updateLeaveStatus(row,'Rejected')}>Reject</button></div>
}

function Dashboard({open,tasks,events,leaves,quote,startShift,endShift,setPage,month,setMonth}) {
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
          <div className="clock">
            <strong>{open?new Date(open.clock_in_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'--:--'}</strong>
            <span>{open?'Shift started':'Shift not started'}<br/>Timezone: {open?.local_timezone||localTz()}</span>
          </div>
        </Card>
        <Card title="Task Assignment" action={<button onClick={()=>setPage('Tasks')}>+ Task</button>}>
          {tasks.length ? tasks.slice(0,4).map(t=><Task key={t.id} t={t}/>) : <Empty text="No tasks yet."/>}
        </Card>
      </div>
      <Card title={month.toLocaleString('en-US',{month:'long',year:'numeric'})+' Calendar'} action={<MonthControls month={month} setMonth={setMonth} />}>
        <Calendar month={month} events={events} deleteEvent={deleteEvent} />
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
