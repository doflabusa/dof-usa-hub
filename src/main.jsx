
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import './styles.css';

const LOGO = '/dof-logo.png';
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'smyoo@doflab.com';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const PRODUCT_MODELS = ['CRAFT 5X','CRAFT DRY','CRAFT 2','CRAFT PLUS','CRAFT PRO','FREEDOM Air'];
const PRODUCT_COLORS = {
  'CRAFT 5X': '#2563eb',
  'CRAFT DRY': '#16a34a',
  'CRAFT 2': '#f59e0b',
  'CRAFT PLUS': '#dc2626',
  'CRAFT PRO': '#7c3aed',
  'FREEDOM Air': '#db2777'
};

const US_STATES = [
  ['AL','Alabama'], ['AK','Alaska'], ['AZ','Arizona'], ['AR','Arkansas'], ['CA','California'],
  ['CO','Colorado'], ['CT','Connecticut'], ['DE','Delaware'], ['FL','Florida'], ['GA','Georgia'],
  ['HI','Hawaii'], ['ID','Idaho'], ['IL','Illinois'], ['IN','Indiana'], ['IA','Iowa'],
  ['KS','Kansas'], ['KY','Kentucky'], ['LA','Louisiana'], ['ME','Maine'], ['MD','Maryland'],
  ['MA','Massachusetts'], ['MI','Michigan'], ['MN','Minnesota'], ['MS','Mississippi'], ['MO','Missouri'],
  ['MT','Montana'], ['NE','Nebraska'], ['NV','Nevada'], ['NH','New Hampshire'], ['NJ','New Jersey'],
  ['NM','New Mexico'], ['NY','New York'], ['NC','North Carolina'], ['ND','North Dakota'], ['OH','Ohio'],
  ['OK','Oklahoma'], ['OR','Oregon'], ['PA','Pennsylvania'], ['RI','Rhode Island'], ['SC','South Carolina'],
  ['SD','South Dakota'], ['TN','Tennessee'], ['TX','Texas'], ['UT','Utah'], ['VT','Vermont'],
  ['VA','Virginia'], ['WA','Washington'], ['WV','West Virginia'], ['WI','Wisconsin'], ['WY','Wyoming'], ['DC','District of Columbia']
];
const STATE_NAME_TO_CODE = Object.fromEntries(US_STATES.map(([code,name]) => [name, code]));

const baseMenu = [
  ['🏠','Dashboard'], ['⏱','Attendance'], ['📅','Calendar'], ['✅','Tasks'], ['🌴','Leave'],
  ['🗺️','Map Preview'], ['📦','Installed Products'], ['🚚','Shipments'], ['🏭','Inventory']
];
const adminMenu = [['👥','Employees'], ['🔐','Admin']];

const quotes = [
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

function randomQuote() {
  return quotes[Math.floor(Math.random() * quotes.length)];
}
function localTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
}
function fmt(v) {
  return v ? new Date(v).toLocaleString() : '-';
}
function hoursBetween(start, end) {
  if (!start || !end) return '-';
  const totalMinutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}
function daysInclusive(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}
function leaveDaysTotal(start, end, dayUnit) {
  return daysInclusive(start, end) * Number(dayUnit || 1);
}
function csv(rows) {
  const content = rows.map(r => r.map(c => `"${String(c ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([content], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'attendance_export.csv';
  a.click();
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
  const [installedProducts,setInstalledProducts] = useState([]);
  const [shipments,setShipments] = useState([]);
  const [inventory,setInventory] = useState([]);
  const [supportHistory,setSupportHistory] = useState([]);
  const [editingInstalledId,setEditingInstalledId] = useState(null);
  const [installedProductFilter,setInstalledProductFilter] = useState('All');
  const [installedYearFilter,setInstalledYearFilter] = useState('All');
  const [mapProductFilter,setMapProductFilter] = useState('All');
  const [mapYearFilter,setMapYearFilter] = useState('All');
  const [installedSearch,setInstalledSearch] = useState('');
  const [selectedInstalledProductId,setSelectedInstalledProductId] = useState('');
  const [selectedMapState,setSelectedMapState] = useState('');
  const [supportProductSearch,setSupportProductSearch] = useState('');
  const [month,setMonth] = useState(new Date());
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [dashboardQuote] = useState(() => randomQuote());

  const [task,setTask] = useState({ title:'', assignee_id:'', priority:'Medium', due_date:'', description:'' });
  const [event,setEvent] = useState({ title:'', event_date:'', end_date:'', event_time:'', all_day:true, type:'Exhibition', notes:'' });
  const [leave,setLeave] = useState({ leave_type:'Paid Time Off', start_date:'', end_date:'', day_unit:'1', reason:'' });
  const [balanceForm,setBalanceForm] = useState({ user_id:'', paid_time_off_days:0, paid_sick_leave_days:0 });
  const [installedForm,setInstalledForm] = useState({
    product_category:'Milling Machine', product_model:'CRAFT 2', serial_number:'', customer_name:'',
    po_number:'', invoice_number:'', teamviewer_id:'', teamviewer_password:'', teamviewer_notes:'',
    customer_type:'Lab', dealer_name:'', address:'', city:'', state:'CA', zip_code:'',
    ship_date:'', install_date:'', warranty_start:'', warranty_end:'', status:'Installed', notes:''
  });
  const [shipmentForm,setShipmentForm] = useState({
    po_number:'', invoice_number:'', customer_name:'', product_model:'', serial_number:'',
    shipment_status:'PO Received', payment_status:'Pending', carrier:'', tracking_number:'',
    bol_number:'', ltl_scheduled_date:'', ship_date:'', delivery_date:'', state:'CA', city:'', notes:''
  });
  const [inventoryForm,setInventoryForm] = useState({
    product_category:'Milling Machine', product_model:'CRAFT 2', serial_number:'',
    location:'Anaheim Warehouse', condition:'New', status:'Available', received_date:'', notes:''
  });
  const [supportForm,setSupportForm] = useState({
    installed_product_id:'', support_date:'', support_type:'Remote', support_summary:'', support_notes:''
  });

  const isAdmin = profile?.role === 'admin';
  const open = attendance.find(r => r.user_id === session?.user?.id && r.status === 'checked_in');

  const visibleAttendance = useMemo(() => {
    if (isAdmin) return attendance;
    return attendance.filter(r => r.user_id === session?.user?.id);
  }, [attendance, isAdmin, session]);

  const visibleLeaves = useMemo(() => {
    if (isAdmin) return leaves;
    return leaves.filter(r => r.user_id === session?.user?.id);
  }, [leaves, isAdmin, session]);

  const visibleTasks = useMemo(() => {
    if (isAdmin) return tasks;
    return tasks.filter(t => t.assignee_id === session?.user?.id || t.created_by === session?.user?.id);
  }, [tasks, isAdmin, session]);

  const activeTasks = useMemo(() => {
    return [...visibleTasks]
      .filter(t => (t.status || 'To Do') !== 'Completed')
      .sort((a,b) => {
        if (!a.due_date && !b.due_date) return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date + 'T00:00:00') - new Date(b.due_date + 'T00:00:00');
      });
  }, [visibleTasks]);

  const completedTasks = useMemo(() => {
    return [...visibleTasks]
      .filter(t => (t.status || 'To Do') === 'Completed')
      .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [visibleTasks]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(x => setSession(x.data.session));
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadAll();
  }, [session]);

  async function signIn(e) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    location.reload();
  }

  async function ensureProfile() {
    const u = session.user;
    let { data, error } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) setError('Profile load error: ' + error.message);
    if (!data) {
      const row = {
        id: u.id,
        email: u.email,
        full_name: u.email === ADMIN_EMAIL ? 'Justin Yoo' : u.email,
        role: u.email === ADMIN_EMAIL ? 'admin' : 'employee',
        status: 'active'
      };
      const res = await supabase.from('profiles').insert(row).select().single();
      if (res.error) setError('Profile create error: ' + res.error.message);
      data = res.data || row;
    }
    setProfile(data);
    return data;
  }

  async function loadAll() {
    setError('');
    const p = await ensureProfile();
    const [a,t,e,ps,l,b,ip,sh,inv,sup] = await Promise.all([
      supabase.from('attendance_records').select('*').order('created_at', { ascending:false }),
      supabase.from('tasks').select('*').order('created_at', { ascending:false }),
      supabase.from('calendar_events').select('*').order('event_date', { ascending:true }),
      supabase.from('profiles').select('*').order('created_at', { ascending:true }),
      supabase.from('leave_requests').select('*').order('created_at', { ascending:false }),
      supabase.from('leave_balances').select('*').order('employee_name', { ascending:true }),
      supabase.from('installed_products').select('*').order('created_at', { ascending:false }),
      supabase.from('product_shipments').select('*').order('created_at', { ascending:false }),
      supabase.from('inventory_items').select('*').order('created_at', { ascending:false }),
      supabase.from('support_history').select('*').order('created_at', { ascending:false })
    ]);
    if (a.error) setError('Attendance load error: ' + a.error.message);
    if (t.error) setError('Tasks load error: ' + t.error.message);
    if (e.error) setError('Calendar load error: ' + e.error.message);
    if (l.error) setError('Leave load error: ' + l.error.message);
    if (b.error) setError('Leave balance load error: ' + b.error.message);
    if (ip.error) setError('Installed products load error: ' + ip.error.message);
    if (sh.error) setError('Shipments load error: ' + sh.error.message);
    if (inv.error) setError('Inventory load error: ' + inv.error.message);
    if (sup.error) setError('Support history load error: ' + sup.error.message);

    setAttendance(a.data || []);
    setTasks(t.data || []);
    setEvents(e.data || []);
    setLeaves(l.data || []);
    setBalances(b.data || []);
    setInstalledProducts(ip.data || []);
    setShipments(sh.data || []);
    setInventory(inv.data || []);
    setSupportHistory(sup.data || []);

    const profileRows = ps.data?.length ? ps.data : [p];
    setProfiles(profileRows);
    if (!task.assignee_id && profileRows.length) setTask(prev => ({...prev, assignee_id: profileRows[0].id}));
    if (!balanceForm.user_id && profileRows.length) setBalanceForm(prev => ({...prev, user_id: profileRows[0].id}));
  }

  async function getClientInfo() {
    try {
      const res = await fetch('/api/client-info');
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  function getBrowserLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  async function startShift() {
    setError('');
    setNotice('');
    if (open) return setError('Your shift is already started.');
    if (!window.confirm('Would you like to start your shift now?')) return;

    const p = profile || await ensureProfile();
    const clientInfo = await getClientInfo();
    const gps = await getBrowserLocation();

    const res = await supabase.from('attendance_records').insert({
      user_id: session.user.id,
      employee_name: p.full_name,
      clock_in_at: new Date().toISOString(),
      local_timezone: localTz(),
      hq_timezone: 'America/Los_Angeles',
      location_text: clientInfo.city || null,
      status: 'checked_in',
      start_ip_address: clientInfo.ip || null,
      start_user_agent: clientInfo.userAgent || navigator.userAgent || null,
      start_latitude: gps?.latitude || null,
      start_longitude: gps?.longitude || null,
      start_location_accuracy: gps?.accuracy || null
    });

    if (res.error) return setError('Shift Start error: ' + res.error.message);
    setNotice('Shift Started.');
    await loadAll();
  }

  async function endShift() {
    setError('');
    setNotice('');
    if (!open) return setError('No active shift found.');
    if (!window.confirm('Would you like to end your shift now?')) return;

    const endedAt = new Date().toISOString();
    const clientInfo = await getClientInfo();
    const gps = await getBrowserLocation();

    const res = await supabase.from('attendance_records').update({
      clock_out_at: endedAt,
      status: 'completed',
      end_ip_address: clientInfo.ip || null,
      end_user_agent: clientInfo.userAgent || navigator.userAgent || null,
      end_latitude: gps?.latitude || null,
      end_longitude: gps?.longitude || null,
      end_location_accuracy: gps?.accuracy || null
    }).eq('id', open.id);

    if (res.error) return setError('Shift End error: ' + res.error.message);
    setNotice(`Shift Ended. Today's work time: ${hoursBetween(open.clock_in_at, endedAt)}`);
    await loadAll();
  }

  async function createTask(e) {
    e.preventDefault();
    setError('');
    const assignee = profiles.find(p => p.id === task.assignee_id);
    if (!task.title.trim()) return setError('Task title is required.');
    if (!assignee) return setError('Please select an assignee.');
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
    if (res.error) return setError('Task create error: ' + res.error.message);
    setTask({ title:'', assignee_id: assignee.id, priority:'Medium', due_date:'', description:'' });
    setNotice('Task assigned.');
    await loadAll();
  }

  async function updateTaskStatus(taskRow, status) {
    setError('');
    if (!taskRow?.id) return setError('Invalid task.');
    if (!isAdmin && taskRow.assignee_id !== session?.user?.id) {
      return setError('Only the assigned person can change this task status.');
    }
    const res = await supabase.from('tasks').update({ status }).eq('id', taskRow.id);
    if (res.error) return setError('Task update error: ' + res.error.message);
    await loadAll();
  }

  async function deleteTask(taskRow) {
    setError('');
    if (!taskRow?.id) return setError('Invalid task.');
    if (!isAdmin && taskRow.created_by !== session?.user?.id) {
      return setError('Only the creator or an admin can delete this task.');
    }
    if (!window.confirm('Delete this task?')) return;
    const res = await supabase.from('tasks').delete().eq('id', taskRow.id);
    if (res.error) return setError('Task delete error: ' + res.error.message);
    await loadAll();
  }

  async function createEvent(e) {
    e.preventDefault();
    setError('');
    if (!event.title.trim() || !event.event_date) return setError('Event title and start date are required.');
    const row = {
      ...event,
      end_date: event.end_date || event.event_date,
      event_time: event.all_day ? null : event.event_time,
      created_by: session.user.id,
      created_by_name: profile?.full_name
    };
    const res = await supabase.from('calendar_events').insert(row);
    if (res.error) return setError('Event create error: ' + res.error.message);
    setEvent({ title:'', event_date:'', end_date:'', event_time:'', all_day:true, type:'Exhibition', notes:'' });
    setNotice('Event created.');
    await loadAll();
  }

  async function deleteEvent(id) {
    if (!window.confirm('Delete this event?')) return;
    const res = await supabase.from('calendar_events').delete().eq('id', id);
    if (res.error) return setError('Event delete error: ' + res.error.message);
    await loadAll();
  }

  async function createLeave(e) {
    e.preventDefault();
    setError('');
    if (!leave.start_date || !leave.end_date) return setError('Leave start and end date are required.');
    const totalDays = leaveDaysTotal(leave.start_date, leave.end_date, leave.day_unit);
    const res = await supabase.from('leave_requests').insert({
      user_id: session.user.id,
      employee_name: profile?.full_name,
      leave_type: leave.leave_type,
      start_date: leave.start_date,
      end_date: leave.end_date,
      days: totalDays,
      reason: leave.reason,
      status: 'Pending'
    });
    if (res.error) return setError('Leave request error: ' + res.error.message);
    setLeave({ leave_type:'Paid Time Off', start_date:'', end_date:'', day_unit:'1', reason:'' });
    setNotice('Leave request submitted.');
    await loadAll();
  }

  async function updateLeaveStatus(row, status) {
    const previousStatus = row.status;
    const res = await supabase.from('leave_requests').update({ status }).eq('id', row.id);
    if (res.error) return setError('Leave update error: ' + res.error.message);

    if (status === 'Approved' && previousStatus !== 'Approved') {
      const current = balances.find(b => b.user_id === row.user_id);
      if (current) {
        const field = row.leave_type === 'Paid Sick Leave' ? 'paid_sick_leave_days' : row.leave_type === 'Paid Time Off' ? 'paid_time_off_days' : null;
        if (field) {
          const nextValue = Math.max(0, Number(current[field] || 0) - Number(row.days || 0));
          await supabase.from('leave_balances').update({
            [field]: nextValue,
            updated_at: new Date().toISOString()
          }).eq('id', current.id);
        }
      }
    }
    await loadAll();
  }

  async function saveLeaveBalance(e) {
    e.preventDefault();
    setError('');
    const employee = profiles.find(p => p.id === balanceForm.user_id);
    if (!employee) return setError('Please select an employee.');
    const existing = balances.find(b => b.user_id === employee.id);
    const row = {
      user_id: employee.id,
      employee_name: employee.full_name || employee.email,
      paid_time_off_days: Number(balanceForm.paid_time_off_days || 0),
      paid_sick_leave_days: Number(balanceForm.paid_sick_leave_days || 0),
      updated_at: new Date().toISOString()
    };
    const res = existing
      ? await supabase.from('leave_balances').update(row).eq('id', existing.id)
      : await supabase.from('leave_balances').insert(row);
    if (res.error) return setError('Leave balance save error: ' + res.error.message);
    setNotice('Leave balance saved.');
    await loadAll();
  }


  async function createInstalledProduct(e) {
    e.preventDefault();
    setError('');
    if (!installedForm.serial_number || !installedForm.customer_name) return setError('Serial Number and Customer Name are required.');
    const row = { ...installedForm, created_by: session.user.id, created_by_name: profile?.full_name };

    const res = editingInstalledId
      ? await supabase.from('installed_products').update(row).eq('id', editingInstalledId)
      : await supabase.from('installed_products').insert(row);

    if (res.error) return setError('Installed Product save error: ' + res.error.message);

    setInstalledForm({
      product_category:'Milling Machine', product_model:'CRAFT 2', serial_number:'', customer_name:'',
      po_number:'', invoice_number:'', teamviewer_id:'', teamviewer_password:'', teamviewer_notes:'',
      customer_type:'Lab', dealer_name:'', address:'', city:'', state:'CA', zip_code:'',
      ship_date:'', install_date:'', warranty_start:'', warranty_end:'', status:'Installed', notes:''
    });
    setEditingInstalledId(null);
    setNotice(editingInstalledId ? 'Installed product updated.' : 'Installed product added.');
    await loadAll();
  }

  function editInstalledProduct(row) {
    setEditingInstalledId(row.id);
    setInstalledForm({
      product_category: row.product_category || 'Milling Machine',
      product_model: row.product_model || '',
      serial_number: row.serial_number || '',
      customer_name: row.customer_name || '',
      po_number: row.po_number || '',
      invoice_number: row.invoice_number || '',
      teamviewer_id: row.teamviewer_id || '',
      teamviewer_password: row.teamviewer_password || '',
      teamviewer_notes: row.teamviewer_notes || '',
      customer_type: row.customer_type || 'Lab',
      dealer_name: row.dealer_name || '',
      address: row.address || '',
      city: row.city || '',
      state: row.state || 'CA',
      zip_code: row.zip_code || '',
      ship_date: row.ship_date || '',
      install_date: row.install_date || '',
      warranty_start: row.warranty_start || '',
      warranty_end: row.warranty_end || '',
      status: row.status || 'Installed',
      notes: row.notes || ''
    });
    setPage('Installed Products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelInstalledEdit() {
    setEditingInstalledId(null);
    setInstalledForm({
      product_category:'Milling Machine', product_model:'CRAFT 2', serial_number:'', customer_name:'',
      po_number:'', invoice_number:'', teamviewer_id:'', teamviewer_password:'', teamviewer_notes:'',
      customer_type:'Lab', dealer_name:'', address:'', city:'', state:'CA', zip_code:'',
      ship_date:'', install_date:'', warranty_start:'', warranty_end:'', status:'Installed', notes:''
    });
  }

  async function deleteInstalledProduct(id) {
    if (!isAdmin) return setError('Only an admin can delete installed product records.');
    if (!window.confirm('Delete this installed product record?')) return;
    const res = await supabase.from('installed_products').delete().eq('id', id);
    if (res.error) return setError('Installed Product delete error: ' + res.error.message);
    await loadAll();
  }

  async function createShipment(e) {
    e.preventDefault();
    setError('');
    if (!shipmentForm.customer_name) return setError('Customer Name is required.');
    const row = { ...shipmentForm, created_by: session.user.id, created_by_name: profile?.full_name };
    const res = await supabase.from('product_shipments').insert(row);
    if (res.error) return setError('Shipment create error: ' + res.error.message);
    setShipmentForm({
      po_number:'', invoice_number:'', customer_name:'', product_model:'', serial_number:'',
      shipment_status:'PO Received', payment_status:'Pending', carrier:'', tracking_number:'',
      bol_number:'', ltl_scheduled_date:'', ship_date:'', delivery_date:'', state:'CA', city:'', notes:''
    });
    setNotice('Shipment record added.');
    await loadAll();
  }

  async function createInventoryItem(e) {
    e.preventDefault();
    setError('');
    if (!inventoryForm.serial_number) return setError('Serial Number is required.');
    const res = await supabase.from('inventory_items').insert(inventoryForm);
    if (res.error) return setError('Inventory create error: ' + res.error.message);
    setInventoryForm({
      product_category:'Milling Machine', product_model:'CRAFT 2', serial_number:'',
      location:'Anaheim Warehouse', condition:'New', status:'Available', received_date:'', notes:''
    });
    setNotice('Inventory item added.');
    await loadAll();
  }

  function stateSummary() {
    const counts = {};
    installedProducts.forEach(p => {
      const st = (p.state || 'Unknown').toUpperCase();
      counts[st] = (counts[st] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  }

  const stateCoordinates = {
    CA:[-119.5,37.2], OR:[-120.5,44.0], WA:[-120.7,47.4], NV:[-116.8,39.4], AZ:[-111.8,34.2],
    UT:[-111.7,39.3], CO:[-105.5,39.0], NM:[-106.1,34.4], TX:[-99.9,31.0], OK:[-97.5,35.5],
    KS:[-98.2,38.5], NE:[-99.8,41.5], SD:[-100.0,44.5], ND:[-100.3,47.5], MT:[-110.0,47.0],
    WY:[-107.5,43.1], ID:[-114.5,44.2], MN:[-94.5,46.0], IA:[-93.5,42.1], MO:[-92.5,38.5],
    AR:[-92.4,34.8], LA:[-91.9,31.1], WI:[-89.8,44.6], IL:[-89.2,40.0], MI:[-84.6,44.4],
    IN:[-86.2,39.9], OH:[-82.8,40.3], KY:[-84.8,37.8], TN:[-86.4,35.8], MS:[-89.7,32.8],
    AL:[-86.8,32.7], GA:[-83.4,32.6], FL:[-82.5,28.2], SC:[-80.9,33.8], NC:[-79.4,35.5],
    VA:[-78.6,37.5], WV:[-80.6,38.6], PA:[-77.8,41.0], NY:[-75.0,42.9], VT:[-72.7,44.0],
    NH:[-71.6,43.7], ME:[-69.0,45.2], MA:[-71.8,42.3], CT:[-72.7,41.6], RI:[-71.5,41.7],
    NJ:[-74.5,40.1], DE:[-75.5,39.0], MD:[-76.7,39.0], DC:[-77.0,38.9], AK:[-150,64], HI:[-157.5,20.8]
  };

  function mapMarkers() {
    return stateSummary()
      .map(([state,count]) => ({ state, count, coords: stateCoordinates[state] }))
      .filter(x => x.coords);
  }


  function installYear(row) {
    const date = row.install_date || row.ship_date || row.warranty_start || row.created_at;
    return date ? String(new Date(date).getFullYear()) : 'Unknown';
  }

  function installedYearOptions() {
    return [...new Set(installedProducts.map(installYear).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  }

  function filterInstalledRows(productFilter, yearFilter) {
    return installedProducts.filter(row => {
      const productOk = productFilter === 'All' || row.product_model === productFilter;
      const yearOk = yearFilter === 'All' || installYear(row) === yearFilter;
      return productOk && yearOk;
    });
  }

  function filteredInstalledProducts() {
    return filterInstalledRows(installedProductFilter, installedYearFilter);
  }

  function filteredMapProducts() {
    return filterInstalledRows(mapProductFilter, mapYearFilter);
  }

  function productSummary(rows) {
    const counts = {};
    rows.forEach(row => {
      const model = row.product_model || 'Unknown';
      counts[model] = (counts[model] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  }

  function yearlyProductSummary(rows) {
    const map = {};
    rows.forEach(row => {
      const year = installYear(row);
      const model = row.product_model || 'Unknown';
      if (!map[year]) map[year] = {};
      map[year][model] = (map[year][model] || 0) + 1;
    });
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0]));
  }

  function getApproxCoordinates(row) {
    const state = (row.state || '').toUpperCase();
    const base = stateCoordinates[state];
    if (!base) return null;

    const zip = String(row.zip_code || row.serial_number || row.customer_name || '');
    let hash = 0;
    for (let i = 0; i < zip.length; i++) hash = (hash * 31 + zip.charCodeAt(i)) % 10000;

    const offsetLng = ((hash % 100) - 50) / 70;
    const offsetLat = (((Math.floor(hash / 100)) % 100) - 50) / 90;
    return [base[0] + offsetLng, base[1] + offsetLat];
  }

  function mapMarkersByZip() {
    return filteredMapProducts()
      .map(row => ({ row, coords: getApproxCoordinates(row) }))
      .filter(x => x.coords);
  }


  function installedSearchRows(rows) {
    const q = installedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(p => [
      p.serial_number, p.customer_name, p.product_model, p.po_number, p.invoice_number, p.city, p.state, p.zip_code,
      p.teamviewer_id
    ].some(v => String(v || '').toLowerCase().includes(q)));
  }

  function installedRowsForList() {
    return installedSearchRows(filteredInstalledProducts());
  }

  function supportProductSearchResults() {
    const q = supportProductSearch.trim().toLowerCase();
    if (!q) return installedProducts.slice(0, 10);
    return installedProducts
      .filter(p => [
        p.serial_number, p.customer_name, p.product_model, p.po_number, p.invoice_number, p.city, p.state, p.zip_code, p.teamviewer_id
      ].some(v => String(v || '').toLowerCase().includes(q)))
      .slice(0, 20);
  }

  function supportRowsForProduct(productId) {
    return supportHistory.filter(s => s.installed_product_id === productId);
  }

  async function createSupportHistory(e) {
    e.preventDefault();
    setError('');
    const product = installedProducts.find(p => p.id === supportForm.installed_product_id);
    if (!product) return setError('Please select an installed product.');
    if (!supportForm.support_summary.trim()) return setError('Support summary is required.');

    const row = {
      installed_product_id: product.id,
      serial_number: product.serial_number,
      customer_name: product.customer_name,
      product_model: product.product_model,
      support_date: supportForm.support_date || new Date().toISOString().slice(0,10),
      support_type: supportForm.support_type,
      support_summary: supportForm.support_summary,
      support_notes: supportForm.support_notes,
      handled_by: session.user.id,
      handled_by_name: profile?.full_name
    };

    const res = await supabase.from('support_history').insert(row);
    if (res.error) return setError('Support History create error: ' + res.error.message);
    setSupportForm({ installed_product_id:'', support_date:'', support_type:'Remote', support_summary:'', support_notes:'' });
    setNotice('Support history added.');
    await loadAll();
  }


  function todayKey() {
    return new Date().toISOString().slice(0,10);
  }

  function upcomingEvents() {
    const today = todayKey();
    return events
      .filter(e => String(e.end_date || e.event_date || '') >= today)
      .sort((a,b) => String(a.event_date || '').localeCompare(String(b.event_date || '')));
  }

  function selectedInstalledProduct() {
    return installedProducts.find(p => p.id === selectedInstalledProductId) || null;
  }

  function selectedSupportRows() {
    if (!selectedInstalledProductId) return [];
    return supportHistory.filter(s => s.installed_product_id === selectedInstalledProductId);
  }

  function productsByState(stateCode) {
    return installedProducts.filter(p => String(p.state || '').toUpperCase() === String(stateCode || '').toUpperCase());
  }

  function selectedMapStateSummary() {
    if (!selectedMapState) return [];
    return productSummary(productsByState(selectedMapState));
  }


  function leaveBalanceRowsForView() {
    if (isAdmin) return balances;
    return balances.filter(b => b.user_id === session?.user?.id);
  }

  function leaveRequestRowsForView() {
    if (isAdmin) return leaves;
    return leaves.filter(l => l.user_id === session?.user?.id);
  }

  function employeeNameById(id) {
    const p = profiles.find(x => x.id === id);
    return p?.full_name || p?.email || '';
  }

  function selectedBalanceEmployeeName() {
    return employeeNameById(balanceForm.user_id);
  }

  function applyBalanceEmployee(userId) {
    const existing = balances.find(b => b.user_id === userId);
    setBalanceForm({
      user_id: userId,
      paid_time_off_days: existing?.paid_time_off_days ?? 0,
      paid_sick_leave_days: existing?.paid_sick_leave_days ?? 0
    });
  }

  function exportCSV() {
    if (!isAdmin) return setError('Admin only.');
    csv([
      ['Employee','Shift Started','Shift Ended','Total Time','Timezone','HQ Timezone','Status'],
      ...attendance.map(r=>[r.employee_name,fmt(r.clock_in_at),fmt(r.clock_out_at),hoursBetween(r.clock_in_at,r.clock_out_at),r.local_timezone,r.hq_timezone,r.status])
    ]);
  }

  if (!supabase) return <div className="setup"><h1>DOF USA HUB</h1><p>Supabase is not configured yet.</p></div>;

  if (!session) {
    return (
      <div className="login">
        <div className="hero loginHero">
          <img src={LOGO} className="loginLogo" />
          <h1>DOF LAB USA Operations Hub</h1>
          <p>Internal operations portal for products, shipments, calendar, tasks, attendance, and leave management.</p>
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
        <button className="logo logoButton" onClick={()=>setPage('Dashboard')}>{LOGO ? <img src={LOGO} /> : <b>DOF USA HUB</b>}</button>
        <p>Internal operations portal</p>
        <nav>{[...baseMenu, ...(isAdmin ? adminMenu : [])].map(([ico,name])=>
          <button key={name} className={page===name?'active':''} onClick={()=>setPage(name)}>
            <span>{ico}</span>{name}
          </button>
        )}</nav>
        <div className="tz"><b>HQ Timezone</b><br/>America/Los_Angeles<br/>PST/PDT automatic</div>
      </aside>

      <main>
        <header><div><h1>{page}</h1><p>{profile?.full_name} · {profile?.role}</p></div><button className="light" onClick={logout}>↪ Logout</button></header>
        {error && <div className="err">{error}</div>}
        {notice && <div className="ok">{notice}</div>}

        {page==='Dashboard' &&
          <Dashboard quote={dashboardQuote} open={open} tasks={activeTasks} events={upcomingEvents()} leaves={visibleLeaves} installedProducts={installedProducts} shipments={shipments} startShift={startShift} endShift={endShift} setPage={setPage} month={month} setMonth={setMonth} />
        }

        {page==='Attendance' &&
          <Card title="Attendance Records" action={<div className="actions"><button onClick={startShift}>Shift Started</button><button className="dark" onClick={endShift}>Shift Ended</button></div>}>
            <p className="hint">{isAdmin ? 'Admin view: all employee attendance records are visible here. IP/GPS details are shown only to administrators.' : 'Employee view: only your own attendance records are visible.'}</p>
            <Table
              headers={isAdmin
                ? ['Employee','Shift Started','Shift Ended','Total Time','Timezone','Start IP','Start GPS','End IP','End GPS','Status']
                : ['Employee','Shift Started','Shift Ended','Total Time','Timezone','Status']
              }
              rows={visibleAttendance.map(r=> isAdmin
                ? [
                    r.employee_name,
                    fmt(r.clock_in_at),
                    fmt(r.clock_out_at),
                    hoursBetween(r.clock_in_at,r.clock_out_at),
                    r.local_timezone,
                    r.start_ip_address || '-',
                    r.start_latitude && r.start_longitude ? `${Number(r.start_latitude).toFixed(5)}, ${Number(r.start_longitude).toFixed(5)}` : '-',
                    r.end_ip_address || '-',
                    r.end_latitude && r.end_longitude ? `${Number(r.end_latitude).toFixed(5)}, ${Number(r.end_longitude).toFixed(5)}` : '-',
                    r.status
                  ]
                : [
                    r.employee_name,
                    fmt(r.clock_in_at),
                    fmt(r.clock_out_at),
                    hoursBetween(r.clock_in_at,r.clock_out_at),
                    r.local_timezone,
                    r.status
                  ]
              )}
            />
          </Card>
        }

        {page==='Calendar' &&
          <>
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
          </>
        }

        {page==='Tasks' &&
          <>
            <div className="two">
              <Card title="Create / Assign Task">
                <form onSubmit={createTask} className="form">
                  <input placeholder="Task title" value={task.title} onChange={e=>setTask({...task,title:e.target.value})}/>
                  <select value={task.assignee_id} onChange={e=>setTask({...task,assignee_id:e.target.value})}>
                    <option value="">Select assignee</option>
                    {profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                  </select>
                  <label className="inlineField">Due Date
                    <input type="date" value={task.due_date} onChange={e=>setTask({...task,due_date:e.target.value})}/>
                  </label>
                  <select value={task.priority} onChange={e=>setTask({...task,priority:e.target.value})}>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <textarea placeholder="Description" value={task.description} onChange={e=>setTask({...task,description:e.target.value})}/>
                  <button>Assign Task</button>
                </form>
              </Card>

              <Card title="Active / Assigned Tasks">
                {activeTasks.length ? activeTasks.map(t=>(
                  <TaskCard
                    key={t.id}
                    task={t}
                    currentUserId={session.user.id}
                    isAdmin={isAdmin}
                    onStatusChange={updateTaskStatus}
                    onDelete={deleteTask}
                  />
                )) : <Empty text="No active tasks."/>}
              </Card>
            </div>

            <Card title="Completed / Previous Tasks">
              {completedTasks.length ? completedTasks.map(t=>(
                <TaskCard
                  key={t.id}
                  task={t}
                  currentUserId={session.user.id}
                  isAdmin={isAdmin}
                  onStatusChange={updateTaskStatus}
                  onDelete={deleteTask}
                />
              )) : <Empty text="No completed tasks yet."/>}
            </Card>
          </>
        }

        {page==='Leave' &&
          <>
            <div className="leaveOverview">
              <Card title={isAdmin ? "Employee Leave Balances" : "My Leave Balance"}>
                <Table
                  headers={['Employee','Paid Time Off Remaining','Paid Sick Leave Remaining','Last Updated']}
                  rows={leaveBalanceRowsForView().map(b=>[
                    b.employee_name || employeeNameById(b.user_id),
                    `${b.paid_time_off_days || 0} days`,
                    `${b.paid_sick_leave_days || 0} days`,
                    b.updated_at ? new Date(b.updated_at).toLocaleDateString() : '-'
                  ])}
                />
              </Card>

              {isAdmin && <Card title="Grant / Edit Leave Balance">
                <p className="hint">Admin can assign or edit remaining leave balance by employee. Use days, not hours. Example: 10 = 10 full days, 0.5 = half day.</p>
                <form onSubmit={saveLeaveBalance} className="leaveBalanceForm">
                  <label>Employee
                    <select value={balanceForm.user_id} onChange={e=>applyBalanceEmployee(e.target.value)}>
                      {profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                    </select>
                  </label>
                  <label>Paid Time Off Remaining (days)
                    <input type="number" step="0.5" placeholder="Example: 10" value={balanceForm.paid_time_off_days} onChange={e=>setBalanceForm({...balanceForm,paid_time_off_days:e.target.value})}/>
                  </label>
                  <label>Paid Sick Leave Remaining (days)
                    <input type="number" step="0.5" placeholder="Example: 5" value={balanceForm.paid_sick_leave_days} onChange={e=>setBalanceForm({...balanceForm,paid_sick_leave_days:e.target.value})}/>
                  </label>
                  <button>Save / Update Balance</button>
                </form>
                {selectedBalanceEmployeeName() && <p className="hint">Editing balance for: {selectedBalanceEmployeeName()}</p>}
              </Card>}
            </div>

            <div className="two">
              <Card title="Request Leave">
                <form onSubmit={createLeave} className="form">
                  <select value={leave.leave_type} onChange={e=>setLeave({...leave,leave_type:e.target.value})}><option>Paid Time Off</option><option>Paid Sick Leave</option><option>Unpaid Leave</option></select>
                  <input type="date" value={leave.start_date} onChange={e=>setLeave({...leave,start_date:e.target.value})}/>
                  <input type="date" value={leave.end_date} onChange={e=>setLeave({...leave,end_date:e.target.value})}/>
                  <select value={leave.day_unit} onChange={e=>setLeave({...leave,day_unit:e.target.value})}><option value="1">Full Day (1 day)</option><option value="0.5">Half Day (0.5 day)</option></select>
                  <textarea placeholder="Reason / notes" value={leave.reason} onChange={e=>setLeave({...leave,reason:e.target.value})}/>
                  <button>Submit Request</button>
                </form>
              </Card>

              <Card title={isAdmin ? "Leave Requests / Usage History" : "My Leave Usage History"}>
                <Table
                  headers={isAdmin
                    ? ['Employee','Type','Start','End','Days','Status','Reason','Action']
                    : ['Type','Start','End','Days','Status','Reason']
                  }
                  rows={leaveRequestRowsForView().map(r=> isAdmin
                    ? [
                        r.employee_name,
                        r.leave_type,
                        r.start_date,
                        r.end_date,
                        r.days,
                        r.status,
                        r.reason || '-',
                        r.status==='Pending' ? <LeaveActions key={r.id} row={r} updateLeaveStatus={updateLeaveStatus}/> : '-'
                      ]
                    : [
                        r.leave_type,
                        r.start_date,
                        r.end_date,
                        r.days,
                        r.status,
                        r.reason || '-'
                      ]
                  )}
                />
              </Card>
            </div>

            <Card title="Leave Policy Note">
              <p className="hint">Leave balances are managed in days. Requests are limited to 0.5-day or 1-day units. Approved Paid Time Off and Paid Sick Leave requests automatically reduce the employee's remaining balance.</p>
            </Card>
          </>
        }

        {page==='Map Preview' &&
          <>
            <div className="mapFilters">
              <label>Product
                <select value={mapProductFilter} onChange={e=>setMapProductFilter(e.target.value)}>
                  <option value="All">All Products</option>
                  {PRODUCT_MODELS.map(m=><option key={m}>{m}</option>)}
                </select>
              </label>
              <label>Year
                <select value={mapYearFilter} onChange={e=>setMapYearFilter(e.target.value)}>
                  <option value="All">All Years</option>
                  {installedYearOptions().map(y=><option key={y}>{y}</option>)}
                </select>
              </label>
            </div>

            <div className="productLegend">
              {PRODUCT_MODELS.map(m=>
                <span key={m}><i className="legendDot" style={{background:PRODUCT_COLORS[m]}}></i>{m}</span>
              )}
            </div>

            <div className="mapPreview">
              <Card title="Installed Products Map">
                <div className="realMapBox">
                  <ComposableMap projection="geoAlbersUsa" className="usaMap">
                    <Geographies geography={GEO_URL}>
                      {({ geographies }) => geographies.map(geo => {
                        const code = STATE_NAME_TO_CODE[geo.properties.name];
                        const selected = !!code && code === selectedMapState;
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            className={"geoState" + (selected ? " selectedGeo" : "")}
                            onClick={() => code && setSelectedMapState(selected ? '' : code)}
                          />
                        );
                      })}
                    </Geographies>
                    {mapMarkersByZip().map(({ row, coords }) =>
                      <Marker key={row.id} coordinates={coords}>
                        <circle className="mapDot" r={5} fill={PRODUCT_COLORS[row.product_model] || '#2563eb'} />
                      </Marker>
                    )}
                  </ComposableMap>
                </div>
                <p className="hint">Click a state to see its installed product breakdown below.</p>
              </Card>

              <Card title="Installs by State">
                <div className="mapStats">
                  {stateSummary().length
                    ? stateSummary().map(([st,count])=>
                        <div className="stateRow" key={st} style={{cursor:'pointer'}} onClick={()=>setSelectedMapState(st===selectedMapState?'':st)}>
                          <span>{st}</span><b>{count}</b>
                        </div>
                      )
                    : <Empty text="No installed products yet."/>
                  }
                </div>
              </Card>
            </div>

            <Card title={selectedMapState ? `${selectedMapState} — Product Breakdown` : 'Select a state to see product breakdown'}>
              {selectedMapState
                ? (selectedMapStateSummary().length
                    ? <div className="summaryCards">
                        {selectedMapStateSummary().map(([model,count])=>
                          <div className="kpi" key={model}><div><span>{model}</span><strong>{count}</strong></div></div>
                        )}
                      </div>
                    : <Empty text="No installed products in this state yet."/>
                  )
                : <Empty text="Click a state on the map or in the list to see its product breakdown."/>
              }
            </Card>
          </>
        }

        {page==='Installed Products' &&
          <>
            <Card title={editingInstalledId ? 'Edit Installed Product' : 'Add Installed Product'}>
              <form onSubmit={createInstalledProduct} className="labeledOpsForm opsForm">
                <label>Product Category
                  <select value={installedForm.product_category} onChange={e=>setInstalledForm({...installedForm,product_category:e.target.value})}>
                    <option>Milling Machine</option>
                    <option>Scanner</option>
                    <option>Furnace</option>
                    <option>Accessory</option>
                  </select>
                </label>
                <label>Product Model
                  <select value={installedForm.product_model} onChange={e=>setInstalledForm({...installedForm,product_model:e.target.value})}>
                    {PRODUCT_MODELS.map(m=><option key={m}>{m}</option>)}
                  </select>
                </label>
                <label>Serial Number
                  <input value={installedForm.serial_number} onChange={e=>setInstalledForm({...installedForm,serial_number:e.target.value})}/>
                </label>
                <label>Customer Name
                  <input value={installedForm.customer_name} onChange={e=>setInstalledForm({...installedForm,customer_name:e.target.value})}/>
                </label>
                <label>Customer Type
                  <select value={installedForm.customer_type} onChange={e=>setInstalledForm({...installedForm,customer_type:e.target.value})}>
                    <option>Lab</option><option>Dental Office</option><option>Dealer</option><option>Other</option>
                  </select>
                </label>
                <label>Dealer Name
                  <input value={installedForm.dealer_name} onChange={e=>setInstalledForm({...installedForm,dealer_name:e.target.value})}/>
                </label>
                <label>PO Number
                  <input value={installedForm.po_number} onChange={e=>setInstalledForm({...installedForm,po_number:e.target.value})}/>
                </label>
                <label>Invoice Number
                  <input value={installedForm.invoice_number} onChange={e=>setInstalledForm({...installedForm,invoice_number:e.target.value})}/>
                </label>
                <label>Address
                  <input value={installedForm.address} onChange={e=>setInstalledForm({...installedForm,address:e.target.value})}/>
                </label>
                <label>City
                  <input value={installedForm.city} onChange={e=>setInstalledForm({...installedForm,city:e.target.value})}/>
                </label>
                <label>State
                  <select value={installedForm.state} onChange={e=>setInstalledForm({...installedForm,state:e.target.value})}>
                    {US_STATES.map(([code,name])=><option key={code} value={code}>{code} - {name}</option>)}
                  </select>
                </label>
                <label>Zip Code
                  <input value={installedForm.zip_code} onChange={e=>setInstalledForm({...installedForm,zip_code:e.target.value})}/>
                </label>
                <label>Ship Date
                  <input type="date" value={installedForm.ship_date} onChange={e=>setInstalledForm({...installedForm,ship_date:e.target.value})}/>
                </label>
                <label>Install Date
                  <input type="date" value={installedForm.install_date} onChange={e=>setInstalledForm({...installedForm,install_date:e.target.value})}/>
                </label>
                <label>Warranty Start
                  <input type="date" value={installedForm.warranty_start} onChange={e=>setInstalledForm({...installedForm,warranty_start:e.target.value})}/>
                </label>
                <label>Warranty End
                  <input type="date" value={installedForm.warranty_end} onChange={e=>setInstalledForm({...installedForm,warranty_end:e.target.value})}/>
                </label>
                <label>Status
                  <select value={installedForm.status} onChange={e=>setInstalledForm({...installedForm,status:e.target.value})}>
                    <option>Installed</option><option>Pending Install</option><option>Under Service</option><option>Removed</option>
                  </select>
                </label>
                <label>TeamViewer ID
                  <input value={installedForm.teamviewer_id} onChange={e=>setInstalledForm({...installedForm,teamviewer_id:e.target.value})}/>
                </label>
                <label>TeamViewer Password
                  <input value={installedForm.teamviewer_password} onChange={e=>setInstalledForm({...installedForm,teamviewer_password:e.target.value})}/>
                </label>
                <label>TeamViewer Notes
                  <input value={installedForm.teamviewer_notes} onChange={e=>setInstalledForm({...installedForm,teamviewer_notes:e.target.value})}/>
                </label>
                <label>Notes
                  <input value={installedForm.notes} onChange={e=>setInstalledForm({...installedForm,notes:e.target.value})}/>
                </label>
                <div className="formButtonGroup">
                  <button>{editingInstalledId ? 'Update Product' : 'Add Product'}</button>
                  {editingInstalledId && <button type="button" className="light" onClick={cancelInstalledEdit}>Cancel</button>}
                </div>
              </form>
            </Card>

            <Card title="Installed Products" action={
              <div className="mapFilters">
                <label>Product
                  <select value={installedProductFilter} onChange={e=>setInstalledProductFilter(e.target.value)}>
                    <option value="All">All Products</option>
                    {PRODUCT_MODELS.map(m=><option key={m}>{m}</option>)}
                  </select>
                </label>
                <label>Year
                  <select value={installedYearFilter} onChange={e=>setInstalledYearFilter(e.target.value)}>
                    <option value="All">All Years</option>
                    {installedYearOptions().map(y=><option key={y}>{y}</option>)}
                  </select>
                </label>
                <label>Search
                  <input placeholder="Serial, customer, city..." value={installedSearch} onChange={e=>setInstalledSearch(e.target.value)}/>
                </label>
              </div>
            }>
              <Table
                headers={['Serial Number','Customer','Model','Dealer','City / State','Status','Install Date','Warranty End','Action']}
                rows={installedRowsForList().map(row=>[
                  row.serial_number,
                  row.customer_name,
                  row.product_model,
                  row.dealer_name || '-',
                  `${row.city || '-'}, ${row.state || '-'}`,
                  row.status,
                  row.install_date || '-',
                  row.warranty_end || '-',
                  <div className="actions" key={row.id}>
                    <button className="light" onClick={()=>editInstalledProduct(row)}>Edit</button>
                    {isAdmin && <button className="miniDelete" onClick={()=>deleteInstalledProduct(row.id)}>Delete</button>}
                  </div>
                ])}
              />
            </Card>

            <Card title="Support History">
              <div className="mapFilters">
                <label>Find Product
                  <input placeholder="Search by serial, customer, model..." value={supportProductSearch} onChange={e=>setSupportProductSearch(e.target.value)}/>
                </label>
              </div>
              <div className="two">
                <Table
                  headers={['Serial Number','Customer','Model','']}
                  rows={supportProductSearchResults().map(p=>[
                    p.serial_number,
                    p.customer_name,
                    p.product_model,
                    <button
                      key={p.id}
                      className={selectedInstalledProductId===p.id ? '' : 'light'}
                      onClick={()=>{ setSelectedInstalledProductId(p.id); setSupportForm(prev=>({...prev, installed_product_id:p.id})); }}
                    >
                      {selectedInstalledProductId===p.id ? 'Selected' : 'Select'}
                    </button>
                  ])}
                />
                <div>
                  {selectedInstalledProduct()
                    ? <>
                        <p className="hint">Adding support history for <b>{selectedInstalledProduct().serial_number}</b> — {selectedInstalledProduct().customer_name}</p>
                        <form onSubmit={createSupportHistory} className="form">
                          <input type="date" value={supportForm.support_date} onChange={e=>setSupportForm({...supportForm,support_date:e.target.value})}/>
                          <select value={supportForm.support_type} onChange={e=>setSupportForm({...supportForm,support_type:e.target.value})}>
                            <option>Remote</option><option>Onsite</option><option>Phone</option><option>Email</option>
                          </select>
                          <input placeholder="Support summary" value={supportForm.support_summary} onChange={e=>setSupportForm({...supportForm,support_summary:e.target.value})}/>
                          <textarea placeholder="Notes" value={supportForm.support_notes} onChange={e=>setSupportForm({...supportForm,support_notes:e.target.value})}/>
                          <button>Add Support Entry</button>
                        </form>
                      </>
                    : <Empty text="Select a product on the left to log support history."/>
                  }
                </div>
              </div>

              {selectedInstalledProductId &&
                <Table
                  headers={['Date','Type','Summary','Notes','Handled By']}
                  rows={selectedSupportRows().map(s=>[s.support_date,s.support_type,s.support_summary,s.support_notes||'-',s.handled_by_name||'-'])}
                />
              }
            </Card>
          </>
        }

        {page==='Shipments' &&
          <>
            <Card title="Add Shipment Record">
              <form onSubmit={createShipment} className="labeledOpsForm opsForm">
                <label>Customer Name
                  <input value={shipmentForm.customer_name} onChange={e=>setShipmentForm({...shipmentForm,customer_name:e.target.value})}/>
                </label>
                <label>Product Model
                  <select value={shipmentForm.product_model} onChange={e=>setShipmentForm({...shipmentForm,product_model:e.target.value})}>
                    <option value="">Select model</option>
                    {PRODUCT_MODELS.map(m=><option key={m}>{m}</option>)}
                  </select>
                </label>
                <label>Serial Number
                  <input value={shipmentForm.serial_number} onChange={e=>setShipmentForm({...shipmentForm,serial_number:e.target.value})}/>
                </label>
                <label>PO Number
                  <input value={shipmentForm.po_number} onChange={e=>setShipmentForm({...shipmentForm,po_number:e.target.value})}/>
                </label>
                <label>Invoice Number
                  <input value={shipmentForm.invoice_number} onChange={e=>setShipmentForm({...shipmentForm,invoice_number:e.target.value})}/>
                </label>
                <label>Shipment Status
                  <select value={shipmentForm.shipment_status} onChange={e=>setShipmentForm({...shipmentForm,shipment_status:e.target.value})}>
                    <option>PO Received</option><option>Preparing</option><option>Ready to Ship</option><option>Shipped</option><option>Delivered</option>
                  </select>
                </label>
                <label>Payment Status
                  <select value={shipmentForm.payment_status} onChange={e=>setShipmentForm({...shipmentForm,payment_status:e.target.value})}>
                    <option>Pending</option><option>Partial</option><option>Paid</option>
                  </select>
                </label>
                <label>Carrier
                  <input value={shipmentForm.carrier} onChange={e=>setShipmentForm({...shipmentForm,carrier:e.target.value})}/>
                </label>
                <label>Tracking Number
                  <input value={shipmentForm.tracking_number} onChange={e=>setShipmentForm({...shipmentForm,tracking_number:e.target.value})}/>
                </label>
                <label>BOL Number
                  <input value={shipmentForm.bol_number} onChange={e=>setShipmentForm({...shipmentForm,bol_number:e.target.value})}/>
                </label>
                <label>LTL Scheduled Date
                  <input type="date" value={shipmentForm.ltl_scheduled_date} onChange={e=>setShipmentForm({...shipmentForm,ltl_scheduled_date:e.target.value})}/>
                </label>
                <label>Ship Date
                  <input type="date" value={shipmentForm.ship_date} onChange={e=>setShipmentForm({...shipmentForm,ship_date:e.target.value})}/>
                </label>
                <label>Delivery Date
                  <input type="date" value={shipmentForm.delivery_date} onChange={e=>setShipmentForm({...shipmentForm,delivery_date:e.target.value})}/>
                </label>
                <label>State
                  <select value={shipmentForm.state} onChange={e=>setShipmentForm({...shipmentForm,state:e.target.value})}>
                    {US_STATES.map(([code,name])=><option key={code} value={code}>{code} - {name}</option>)}
                  </select>
                </label>
                <label>City
                  <input value={shipmentForm.city} onChange={e=>setShipmentForm({...shipmentForm,city:e.target.value})}/>
                </label>
                <label>Notes
                  <input value={shipmentForm.notes} onChange={e=>setShipmentForm({...shipmentForm,notes:e.target.value})}/>
                </label>
                <div className="formButtonGroup"><button>Add Shipment</button></div>
              </form>
            </Card>

            <Card title="Shipment Records">
              <Table
                headers={['Customer','Model','Serial','PO #','Carrier / Tracking','Shipment Status','Payment','Ship Date','Delivery Date']}
                rows={shipments.map(s=>[
                  s.customer_name,
                  s.product_model || '-',
                  s.serial_number || '-',
                  s.po_number || '-',
                  `${s.carrier || '-'}${s.tracking_number ? (' · ' + s.tracking_number) : ''}`,
                  s.shipment_status,
                  s.payment_status,
                  s.ship_date || '-',
                  s.delivery_date || '-'
                ])}
              />
            </Card>
          </>
        }

        {page==='Inventory' &&
          <>
            <Card title="Add Inventory Item">
              <form onSubmit={createInventoryItem} className="opsForm">
                <select value={inventoryForm.product_category} onChange={e=>setInventoryForm({...inventoryForm,product_category:e.target.value})}>
                  <option>Milling Machine</option><option>Scanner</option><option>Furnace</option><option>Accessory</option>
                </select>
                <select value={inventoryForm.product_model} onChange={e=>setInventoryForm({...inventoryForm,product_model:e.target.value})}>
                  {PRODUCT_MODELS.map(m=><option key={m}>{m}</option>)}
                </select>
                <input placeholder="Serial Number" value={inventoryForm.serial_number} onChange={e=>setInventoryForm({...inventoryForm,serial_number:e.target.value})}/>
                <input placeholder="Location" value={inventoryForm.location} onChange={e=>setInventoryForm({...inventoryForm,location:e.target.value})}/>
                <select value={inventoryForm.condition} onChange={e=>setInventoryForm({...inventoryForm,condition:e.target.value})}>
                  <option>New</option><option>Refurbished</option><option>Used</option><option>Demo</option>
                </select>
                <select value={inventoryForm.status} onChange={e=>setInventoryForm({...inventoryForm,status:e.target.value})}>
                  <option>Available</option><option>Reserved</option><option>Shipped</option><option>Defective</option>
                </select>
                <input type="date" value={inventoryForm.received_date} onChange={e=>setInventoryForm({...inventoryForm,received_date:e.target.value})}/>
                <input placeholder="Notes" value={inventoryForm.notes} onChange={e=>setInventoryForm({...inventoryForm,notes:e.target.value})}/>
                <button>Add Item</button>
              </form>
            </Card>

            <Card title="Inventory">
              <Table
                headers={['Model','Category','Serial','Location','Condition','Status','Received','Notes']}
                rows={inventory.map(i=>[i.product_model,i.product_category,i.serial_number,i.location,i.condition,i.status,i.received_date || '-',i.notes || '-'])}
              />
            </Card>
          </>
        }

        {page==='Employees' && isAdmin &&
          <Card title="Employees"><Table headers={['Name','Email','Role','Status']} rows={profiles.map(p=>[p.full_name,p.email,p.role,p.status])} /></Card>
        }

        {page==='Admin' && isAdmin &&
          <Card title="Admin Tools"><div className="actions"><button onClick={exportCSV}>Export Attendance CSV</button><button className="light" onClick={loadAll}>Sync Latest Data</button></div></Card>
        }
      </main>
    </div>
  );
}

function LeaveActions({row, updateLeaveStatus}) {
  return <div className="actions"><button onClick={()=>updateLeaveStatus(row,'Approved')}>Approve</button><button className="dark" onClick={()=>updateLeaveStatus(row,'Rejected')}>Reject</button></div>
}

function Dashboard({quote,open,tasks,events,leaves,installedProducts,shipments,startShift,endShift,setPage,month,setMonth}) {
  return (
    <>
      <div className="quoteCard">“{quote}”</div>
      <section className="kpis">
        <KPI title="Attendance" value={open?'In':'Not In'} icon="⏱"/>
        <KPI title="Tasks" value={tasks.length} icon="✅"/>
        <KPI title="Upcoming Events" value={events.length} icon="📅"/>
        <KPI title="Installed Units" value={installedProducts.length} icon="📍"/>
      </section>
      <div className="two">
        <Card title="Attendance & Location" action={<button onClick={open?endShift:startShift}>{open?'Shift Ended':'Shift Started'}</button>}>
          <div className="clock"><strong>{open?new Date(open.clock_in_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'--:--'}</strong><span>{open?'Shift started':'Shift not started'}<br/>Timezone: {open?.local_timezone||localTz()}</span></div>
        </Card>
        <Card title="Current Active Tasks" action={<button onClick={()=>setPage('Tasks')}>+ Task</button>}>
          {tasks.length ? tasks.slice(0,4).map(t=><TaskCard key={t.id} task={t} compact={true} currentUserId={''} isAdmin={false} onStatusChange={()=>{}} onDelete={()=>{}}/>) : <Empty text="No active tasks."/>}
        </Card>
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
function TaskCard({task, currentUserId, isAdmin, onStatusChange, onDelete, compact=false}) {
  const status = task.status || 'To Do';
  const canUpdate = isAdmin || task.assignee_id === currentUserId;
  const canDelete = isAdmin || task.created_by === currentUserId;
  const assignedDate = task.created_at ? new Date(task.created_at).toLocaleDateString() : '-';

  let dueClass = '';
  if (status !== 'Completed' && task.due_date) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(task.due_date + 'T00:00:00');
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays < 0) dueClass = ' overdue';
    else if (diffDays <= 3) dueClass = ' dueSoon';
  }

  return (
    <div className={"task" + dueClass}>
      <i></i>
      <div>
        <b>{task.title}</b>
        <span>{task.assignee_name || 'Unassigned'} · {task.priority || 'Medium'}</span>
        <div className="taskDates">
          <small>Assign Date: {assignedDate}</small>
          <small>Due Date: {task.due_date || 'No due date'}</small>
        </div>
        {task.description && <p className="taskDescription">{task.description}</p>}
      </div>

      {!compact && (
        <div className="taskActions">
          <select disabled={!canUpdate} value={status} onChange={e=>onStatusChange(task, e.target.value)}>
            <option>To Do</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          {canDelete && <button className="miniDelete" onClick={()=>onDelete(task)}>×</button>}
        </div>
      )}
    </div>
  );
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
function Calendar({month,events,deleteEvent}) {
  const [popup,setPopup] = React.useState(null);
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const weekStart = new Date(gridStart);
    weekStart.setDate(gridStart.getDate() + w * 7);
    const days = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + d);
      days.push(day);
    }
    weeks.push(days);
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function strip(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function weekSegments(days) {
    const weekStart = strip(days[0]);
    const weekEnd = strip(days[6]);
    return events.map(e => {
      const s = strip(new Date((e.event_date || dateKey(days[0])) + 'T00:00:00'));
      const en = strip(new Date((e.end_date || e.event_date || dateKey(days[0])) + 'T00:00:00'));
      if (en < weekStart || s > weekEnd) return null;
      const start = s < weekStart ? 0 : Math.round((s - weekStart) / 86400000);
      const end = en > weekEnd ? 6 : Math.round((en - weekStart) / 86400000);
      return { event: e, start, span: end - start + 1 };
    }).filter(Boolean);
  }

  function dayEvents(day) {
    const key = dateKey(day);
    return events.filter(e => {
      const start = e.event_date || key;
      const end = e.end_date || e.event_date || key;
      return key >= start && key <= end;
    });
  }

  return (
    <div className="calendarWrap">
      <div className="dowRow">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=><div className="dow" key={x}>{x}</div>)}</div>
      {weeks.map((days, wi) => (
        <div className="weekBlock" key={wi}>
          <div className="weekDays">
            {days.map(day => {
              const inMonth = day.getMonth() === m;
              const weekendClass = day.getDay() === 0 ? ' sunday' : day.getDay() === 6 ? ' saturday' : '';
              const all = dayEvents(day);
              return <div className={(inMonth ? 'dayNum' : 'dayNum mutedDay') + weekendClass} key={dateKey(day)}>
                {day.getDate()}
                {all.length > 3 && <button className="moreBadge" onClick={()=>setPopup({date:dateKey(day), events:all})}>+{all.length-3}</button>}
              </div>
            })}
          </div>
          <div className="weekEvents">
            {weekSegments(days).slice(0,3).map(({event,start,span}) => (
              <div key={event.id + '-' + wi} className={`eventBar ${eventClass(event.type)}`} style={{ gridColumn: `${start + 1} / span ${span}` }} title={`Created by ${event.created_by_name || 'Unknown'}`}>
                <span>{event.title}{event.all_day ? '' : ' · ' + (event.event_time || '')}</span>
                <small>by {event.created_by_name || 'Unknown'}</small>
                <button className="miniDelete" onClick={() => deleteEvent(event.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {popup && <div className="modalOverlay" onClick={()=>setPopup(null)}>
        <div className="modalCard" onClick={e=>e.stopPropagation()}>
          <div className="head"><h2>{popup.date} Events</h2><button className="light" onClick={()=>setPopup(null)}>Close</button></div>
          {popup.events.map(e=><div className={`popupEvent ${eventClass(e.type)}`} key={e.id}>
            <b>{e.title}</b>
            <span>{e.type} · {e.all_day ? 'All Day' : (e.event_time || '')}</span>
            <small>{e.event_date}{e.end_date && e.end_date !== e.event_date ? ` ~ ${e.end_date}` : ''} · by {e.created_by_name || 'Unknown'}</small>
          </div>)}
        </div>
      </div>}
    </div>
  );
}

function Table({headers,rows}) { return <table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>):<tr><td colSpan={headers.length} className="emptyCell">No records yet.</td></tr>}</tbody></table> }

createRoot(document.getElementById('root')).render(<App/>);
