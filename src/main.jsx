
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
  const [editingInstalledId,setEditingInstalledId] = useState(null);
  const [installedProductFilter,setInstalledProductFilter] = useState('All');
  const [installedYearFilter,setInstalledYearFilter] = useState('All');
  const [mapProductFilter,setMapProductFilter] = useState('All');
  const [mapYearFilter,setMapYearFilter] = useState('All');
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
    return visibleTasks.filter(t => (t.status || 'To Do') !== 'Completed');
  }, [visibleTasks]);

  const completedTasks = useMemo(() => {
    return visibleTasks.filter(t => (t.status || 'To Do') === 'Completed');
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
    const [a,t,e,ps,l,b,ip,sh,inv] = await Promise.all([
      supabase.from('attendance_records').select('*').order('created_at', { ascending:false }),
      supabase.from('tasks').select('*').order('created_at', { ascending:false }),
      supabase.from('calendar_events').select('*').order('event_date', { ascending:true }),
      supabase.from('profiles').select('*').order('created_at', { ascending:true }),
      supabase.from('leave_requests').select('*').order('created_at', { ascending:false }),
      supabase.from('leave_balances').select('*').order('employee_name', { ascending:true }),
      supabase.from('installed_products').select('*').order('created_at', { ascending:false }),
      supabase.from('product_shipments').select('*').order('created_at', { ascending:false }),
      supabase.from('inventory_items').select('*').order('created_at', { ascending:false })
    ]);
    if (a.error) setError('Attendance load error: ' + a.error.message);
    if (t.error) setError('Tasks load error: ' + t.error.message);
    if (e.error) setError('Calendar load error: ' + e.error.message);
    if (l.error) setError('Leave load error: ' + l.error.message);
    if (b.error) setError('Leave balance load error: ' + b.error.message);
    if (ip.error) setError('Installed products load error: ' + ip.error.message);
    if (sh.error) setError('Shipments load error: ' + sh.error.message);
    if (inv.error) setError('Inventory load error: ' + inv.error.message);

    setAttendance(a.data || []);
    setTasks(t.data || []);
    setEvents(e.data || []);
    setLeaves(l.data || []);
    setBalances(b.data || []);
    setInstalledProducts(ip.data || []);
    setShipments(sh.data || []);
    setInventory(inv.data || []);

    const profileRows = ps.data?.length ? ps.data : [p];
    setProfiles(profileRows);
    if (!task.assignee_id && profileRows.length) setTask(prev => ({...prev, assignee_id: profileRows[0].id}));
    if (!balanceForm.user_id && profileRows.length) setBalanceForm(prev => ({...prev, user_id: profileRows[0].id}));
  }

  async function startShift() {
    setError('');
    setNotice('');
    if (open) return setError('Your shift is already started.');
    if (!window.confirm('Would you like to start your shift now?')) return;
    const p = profile || await ensureProfile();
    const res = await supabase.from('attendance_records').insert({
      user_id: session.user.id,
      employee_name: p.full_name,
      clock_in_at: new Date().toISOString(),
      local_timezone: localTz(),
      hq_timezone: 'America/Los_Angeles',
      location_text: null,
      status: 'checked_in'
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
    const res = await supabase.from('attendance_records').update({
      clock_out_at: endedAt,
      status: 'completed'
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
    if (!isAdmin && taskRow.assignee_id !== session?.user?.id) {
      return setError('Only the assigned person can change this task status.');
    }
    const res = await supabase.from('tasks').update({ status }).eq('id', taskRow.id);
    if (res.error) return setError('Task update error: ' + res.error.message);
    await loadAll();
  }

  async function deleteTask(taskRow) {
    setError('');
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
    const res = await supabase.from('leave_requests').update({ status }).eq('id', row.id);
    if (res.error) return setError('Leave update error: ' + res.error.message);

    if (status === 'Approved') {
      const current = balances.find(b => b.user_id === row.user_id);
      if (current) {
        const field = row.leave_type === 'Paid Sick Leave' ? 'paid_sick_leave_days' : 'paid_time_off_days';
        const nextValue = Math.max(0, Number(current[field] || 0) - Number(row.days || 0));
        await supabase.from('leave_balances').update({
          [field]: nextValue,
          updated_at: new Date().toISOString()
        }).eq('id', current.id);
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
      customer_type:'Lab', dealer_name:'', address:'', city:'', state:'CA', zip_code:'',
      ship_date:'', install_date:'', warranty_start:'', warranty_end:'', status:'Installed', notes:''
    });
  }

  async function deleteInstalledProduct(id) {
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
        <div className="logo">{LOGO ? <img src={LOGO} /> : <b>DOF USA HUB</b>}</div>
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
          <Dashboard quote={dashboardQuote} open={open} tasks={activeTasks} events={events} leaves={visibleLeaves} installedProducts={installedProducts} shipments={shipments} startShift={startShift} endShift={endShift} setPage={setPage} month={month} setMonth={setMonth} />
        }

        {page==='Attendance' &&
          <Card title="Attendance Records" action={<div className="actions"><button onClick={startShift}>Shift Started</button><button className="dark" onClick={endShift}>Shift Ended</button></div>}>
            <p className="hint">{isAdmin ? 'Admin view: all employee attendance records are visible here. Export is available only in Admin.' : 'Employee view: only your own attendance records are visible.'}</p>
            <Table headers={['Employee','Shift Started','Shift Ended','Total Time','Timezone','Status']} rows={visibleAttendance.map(r=>[r.employee_name,fmt(r.clock_in_at),fmt(r.clock_out_at),hoursBetween(r.clock_in_at,r.clock_out_at),r.local_timezone,r.status])} />
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
                  <input type="date" value={task.due_date} onChange={e=>setTask({...task,due_date:e.target.value})}/>
                  <select value={task.priority} onChange={e=>setTask({...task,priority:e.target.value})}><option>High</option><option>Medium</option><option>Low</option></select>
                  <textarea placeholder="Description" value={task.description} onChange={e=>setTask({...task,description:e.target.value})}/>
                  <button>Assign Task</button>
                </form>
              </Card>
              <Card title="Active / Assigned Tasks">
                {activeTasks.length ? activeTasks.map(t=><Task key={t.id} t={t} currentUserId={session.user.id} isAdmin={isAdmin} updateTaskStatus={updateTaskStatus} deleteTask={deleteTask}/>) : <Empty text="No active tasks."/>}
              </Card>
            </div>
            <Card title="Completed / Previous Tasks">
              {completedTasks.length ? completedTasks.map(t=><Task key={t.id} t={t} currentUserId={session.user.id} isAdmin={isAdmin} updateTaskStatus={updateTaskStatus} deleteTask={deleteTask}/>) : <Empty text="No completed tasks yet."/>}
            </Card>
          </>
        }

        {page==='Leave' &&
          <>
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
              <Card title="Leave Requests">
                <Table headers={isAdmin?['Employee','Type','Start','End','Days','Status','Action']:['Type','Start','End','Days','Status']}
                  rows={visibleLeaves.map(r=> isAdmin ? [r.employee_name,r.leave_type,r.start_date,r.end_date,r.days,r.status,
                    r.status==='Pending' ? <LeaveActions key={r.id} row={r} updateLeaveStatus={updateLeaveStatus}/> : '-'
                  ] : [r.leave_type,r.start_date,r.end_date,r.days,r.status])} />
              </Card>
            </div>
            {isAdmin && <Card title="Set Initial Leave Balance">
              <p className="hint">Enter the employee's available leave balance in days. Example: 10 days of Paid Time Off, 5 days of Paid Sick Leave. Requests can be made in 0.5-day or 1-day units.</p>
              <form onSubmit={saveLeaveBalance} className="leaveBalanceForm">
                <label>Employee
                  <select value={balanceForm.user_id} onChange={e=>setBalanceForm({...balanceForm,user_id:e.target.value})}>
                    {profiles.map(p=><option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                  </select>
                </label>
                <label>Paid Time Off Balance (days)
                  <input type="number" step="0.5" placeholder="Example: 10" value={balanceForm.paid_time_off_days} onChange={e=>setBalanceForm({...balanceForm,paid_time_off_days:e.target.value})}/>
                </label>
                <label>Paid Sick Leave Balance (days)
                  <input type="number" step="0.5" placeholder="Example: 5" value={balanceForm.paid_sick_leave_days} onChange={e=>setBalanceForm({...balanceForm,paid_sick_leave_days:e.target.value})}/>
                </label>
                <button>Save Balance</button>
              </form>
            </Card>}
            <Card title="Leave Balances">
              <Table headers={['Employee','Paid Time Off','Paid Sick Leave']} rows={(isAdmin?balances:balances.filter(b=>b.user_id===session.user.id)).map(b=>[b.employee_name,`${b.paid_time_off_days || 0} days`,`${b.paid_sick_leave_days || 0} days`])}/>
            </Card>
          </>
        }


        {page==='Map Preview' &&
          <Card title="U.S. Installation Map">
            <div className="mapFilters">
              <label>Year
                <select value={mapYearFilter} onChange={e=>setMapYearFilter(e.target.value)}>
                  <option>All</option>
                  {installedYearOptions().map(y=><option key={y}>{y}</option>)}
                </select>
              </label>
              <label>Product
                <select value={mapProductFilter} onChange={e=>setMapProductFilter(e.target.value)}>
                  <option>All</option>
                  {PRODUCT_MODELS.map(p=><option key={p}>{p}</option>)}
                </select>
              </label>
            </div>

            <div className="productLegend">
              {PRODUCT_MODELS.map(p=><span key={p}><i style={{background:PRODUCT_COLORS[p]}}></i>{p}</span>)}
            </div>

            <div className="mapPreview">
              <div className="mapBox realMapBox">
                <div className="mapTitle">DOF USA Installed Base</div>
                <div className="mapSub">Markers are placed by ZIP/state approximation and colored by product model.</div>
                <ComposableMap projection="geoAlbersUsa" className="usaMap">
                  <Geographies geography={GEO_URL}>
                    {({ geographies }) => geographies.map(geo => (
                      <Geography key={geo.rsmKey} geography={geo} className="geoState" />
                    ))}
                  </Geographies>
                  {mapMarkersByZip().map(({row,coords}) => (
                    <Marker key={row.id} coordinates={coords}>
                      <circle r={7} fill={PRODUCT_COLORS[row.product_model] || '#2563eb'} className="mapDot" />
                      <title>{row.product_model} · {row.customer_name} · {row.city}, {row.state} {row.zip_code}</title>
                    </Marker>
                  ))}
                </ComposableMap>
              </div>
              <div className="mapStats">
                <KPI title="Filtered Units" value={filteredMapProducts().length} icon="📍"/>
                <KPI title="Active States" value={[...new Set(filteredMapProducts().map(p=>p.state).filter(Boolean))].length} icon="🗺️"/>
                <KPI title="Pending Shipments" value={shipments.filter(s=>!['Delivered','Installed'].includes(s.shipment_status)).length} icon="🚚"/>
                <Card title="Product Count">
                  {productSummary(filteredMapProducts()).length ? productSummary(filteredMapProducts()).map(([model,count])=><div className="stateRow" key={model}><span><i className="legendDot" style={{background:PRODUCT_COLORS[model] || '#64748b'}}></i>{model}</span><b>{count}</b></div>) : <Empty text="No data for selected filters."/>}
                </Card>
              </div>
            </div>

            <Card title="Yearly Product Summary">
              <Table headers={['Year', ...PRODUCT_MODELS]} rows={yearlyProductSummary(filteredInstalledProducts()).map(([year,items])=>[year, ...PRODUCT_MODELS.map(p=>items[p] || 0)])}/>
            </Card>
          </Card>
        }

        {page==='Installed Products' &&
          <>
            <Card title={editingInstalledId ? "Edit Installed Product" : "Add Installed Product"}>
              <form onSubmit={createInstalledProduct} className="opsForm labeledOpsForm">
                <label>Product Category
                  <select value={installedForm.product_category} onChange={e=>setInstalledForm({...installedForm,product_category:e.target.value})}><option>Milling Machine</option><option>Intraoral Scanner</option></select>
                </label>
                <label>Product Model
                  <select value={installedForm.product_model} onChange={e=>setInstalledForm({...installedForm,product_model:e.target.value})}>
                    {PRODUCT_MODELS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </label>
                <label>Serial Number
                  <input placeholder="Serial Number" value={installedForm.serial_number} onChange={e=>setInstalledForm({...installedForm,serial_number:e.target.value})}/>
                </label>
                <label>Customer Name
                  <input placeholder="Customer Name" value={installedForm.customer_name} onChange={e=>setInstalledForm({...installedForm,customer_name:e.target.value})}/>
                </label>
                <label>Customer Type
                  <select value={installedForm.customer_type} onChange={e=>setInstalledForm({...installedForm,customer_type:e.target.value})}><option>Lab</option><option>Clinic</option><option>Dealer</option><option>DSO</option><option>KOL</option></select>
                </label>
                <label>Dealer Name
                  <input placeholder="Dealer Name" value={installedForm.dealer_name} onChange={e=>setInstalledForm({...installedForm,dealer_name:e.target.value})}/>
                </label>
                <label>City
                  <input placeholder="City" value={installedForm.city} onChange={e=>setInstalledForm({...installedForm,city:e.target.value})}/>
                </label>
                <label>State
                  <input placeholder="CA" value={installedForm.state} onChange={e=>setInstalledForm({...installedForm,state:e.target.value.toUpperCase()})}/>
                </label>
                <label>ZIP Code
                  <input placeholder="ZIP Code" value={installedForm.zip_code} onChange={e=>setInstalledForm({...installedForm,zip_code:e.target.value})}/>
                </label>
                <label>Product Shipped Date
                  <input type="date" value={installedForm.ship_date} onChange={e=>setInstalledForm({...installedForm,ship_date:e.target.value})}/>
                </label>
                <label>Installation Date
                  <input type="date" value={installedForm.install_date} onChange={e=>setInstalledForm({...installedForm,install_date:e.target.value})}/>
                </label>
                <label>Warranty Start Date
                  <input type="date" value={installedForm.warranty_start} onChange={e=>setInstalledForm({...installedForm,warranty_start:e.target.value})}/>
                </label>
                <label>Warranty Expiration Date
                  <input type="date" value={installedForm.warranty_end} onChange={e=>setInstalledForm({...installedForm,warranty_end:e.target.value})}/>
                </label>
                <label>Status
                  <select value={installedForm.status} onChange={e=>setInstalledForm({...installedForm,status:e.target.value})}><option>Sold</option><option>Shipped</option><option>Installed</option><option>Demo</option><option>Returned</option></select>
                </label>
                <div className="formButtonGroup">
                  <button>{editingInstalledId ? "Update Product" : "Add Product"}</button>
                  {editingInstalledId && <button type="button" className="light" onClick={cancelInstalledEdit}>Cancel Edit</button>}
                </div>
              </form>
            </Card>

            <Card title="Installed Product Search">
              <div className="mapFilters">
                <label>Year
                  <select value={installedYearFilter} onChange={e=>setInstalledYearFilter(e.target.value)}>
                    <option>All</option>
                    {installedYearOptions().map(y=><option key={y}>{y}</option>)}
                  </select>
                </label>
                <label>Product
                  <select value={installedProductFilter} onChange={e=>setInstalledProductFilter(e.target.value)}>
                    <option>All</option>
                    {PRODUCT_MODELS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </label>
              </div>
              <div className="summaryCards">
                <KPI title="Current Filtered Units" value={filteredInstalledProducts().length} icon="📦"/>
                <KPI title="Installed Years" value={[...new Set(filteredInstalledProducts().map(installYear))].length} icon="📅"/>
                <KPI title="States" value={[...new Set(filteredInstalledProducts().map(p=>p.state).filter(Boolean))].length} icon="🗺️"/>
              </div>
              <Table headers={['Year', ...PRODUCT_MODELS]} rows={yearlyProductSummary(filteredInstalledProducts()).map(([year,items])=>[year, ...PRODUCT_MODELS.map(p=>items[p] || 0)])}/>
            </Card>

            <Card title="Installed Products List">
              <Table headers={['Model','Serial','Customer','City','State','ZIP','Installed','Warranty End','Status','Action']} rows={filteredInstalledProducts().map(p=>[p.product_model,p.serial_number,p.customer_name,p.city,p.state,p.zip_code,p.install_date,p.warranty_end,p.status,
                <div className="actions" key={p.id}><button className="light" onClick={()=>editInstalledProduct(p)}>Edit</button><button className="miniDelete" onClick={()=>deleteInstalledProduct(p.id)}>×</button></div>
              ])}/>
            </Card>
          </>
        }

        {page==='Shipments' &&
          <>
            <Card title="Add Product Shipment">
              <form onSubmit={createShipment} className="opsForm">
                <input placeholder="PO Number" value={shipmentForm.po_number} onChange={e=>setShipmentForm({...shipmentForm,po_number:e.target.value})}/>
                <input placeholder="Invoice Number" value={shipmentForm.invoice_number} onChange={e=>setShipmentForm({...shipmentForm,invoice_number:e.target.value})}/>
                <input placeholder="Customer Name" value={shipmentForm.customer_name} onChange={e=>setShipmentForm({...shipmentForm,customer_name:e.target.value})}/>
                <input placeholder="Product Model" value={shipmentForm.product_model} onChange={e=>setShipmentForm({...shipmentForm,product_model:e.target.value})}/>
                <input placeholder="Serial Number" value={shipmentForm.serial_number} onChange={e=>setShipmentForm({...shipmentForm,serial_number:e.target.value})}/>
                <select value={shipmentForm.shipment_status} onChange={e=>setShipmentForm({...shipmentForm,shipment_status:e.target.value})}><option>PO Received</option><option>Invoice Sent</option><option>Payment Completed</option><option>Ready to Ship</option><option>LTL Scheduled</option><option>Shipped</option><option>Delivered</option><option>Installed</option></select>
                <select value={shipmentForm.payment_status} onChange={e=>setShipmentForm({...shipmentForm,payment_status:e.target.value})}><option>Pending</option><option>Partially Paid</option><option>Paid</option><option>Financing</option></select>
                <input placeholder="Carrier" value={shipmentForm.carrier} onChange={e=>setShipmentForm({...shipmentForm,carrier:e.target.value})}/>
                <input placeholder="Tracking Number" value={shipmentForm.tracking_number} onChange={e=>setShipmentForm({...shipmentForm,tracking_number:e.target.value})}/>
                <input placeholder="BOL Number" value={shipmentForm.bol_number} onChange={e=>setShipmentForm({...shipmentForm,bol_number:e.target.value})}/>
                <input placeholder="City" value={shipmentForm.city} onChange={e=>setShipmentForm({...shipmentForm,city:e.target.value})}/>
                <input placeholder="State" value={shipmentForm.state} onChange={e=>setShipmentForm({...shipmentForm,state:e.target.value.toUpperCase()})}/>
                <button>Add Shipment</button>
              </form>
            </Card>
            <Card title="Shipment Pipeline">
              <Table headers={['Customer','Model','Serial','PO','Invoice','Payment','Shipment Status','Carrier','State']} rows={shipments.map(s=>[s.customer_name,s.product_model,s.serial_number,s.po_number,s.invoice_number,s.payment_status,s.shipment_status,s.carrier,s.state])}/>
            </Card>
          </>
        }

        {page==='Inventory' &&
          <>
            <Card title="Add Inventory Item">
              <form onSubmit={createInventoryItem} className="opsForm">
                <select value={inventoryForm.product_category} onChange={e=>setInventoryForm({...inventoryForm,product_category:e.target.value})}><option>Milling Machine</option><option>Intraoral Scanner</option><option>Desktop Scanner</option><option>Accessory</option></select>
                <input placeholder="Product Model" value={inventoryForm.product_model} onChange={e=>setInventoryForm({...inventoryForm,product_model:e.target.value})}/>
                <input placeholder="Serial Number" value={inventoryForm.serial_number} onChange={e=>setInventoryForm({...inventoryForm,serial_number:e.target.value})}/>
                <input placeholder="Location" value={inventoryForm.location} onChange={e=>setInventoryForm({...inventoryForm,location:e.target.value})}/>
                <select value={inventoryForm.condition} onChange={e=>setInventoryForm({...inventoryForm,condition:e.target.value})}><option>New</option><option>Demo</option><option>Refurbished</option><option>Loaner</option></select>
                <select value={inventoryForm.status} onChange={e=>setInventoryForm({...inventoryForm,status:e.target.value})}><option>Available</option><option>Reserved</option><option>Shipped</option><option>Installed</option><option>Returned</option></select>
                <input type="date" value={inventoryForm.received_date} onChange={e=>setInventoryForm({...inventoryForm,received_date:e.target.value})}/>
                <button>Add Inventory</button>
              </form>
            </Card>
            <Card title="Inventory List">
              <Table headers={['Category','Model','Serial','Location','Condition','Status','Received']} rows={inventory.map(i=>[i.product_category,i.product_model,i.serial_number,i.location,i.condition,i.status,i.received_date])}/>
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
        <KPI title="Events" value={events.length} icon="📅"/>
        <KPI title="Installed Units" value={installedProducts.length} icon="📍"/>
      </section>
      <div className="two">
        <Card title="Attendance & Location" action={<button onClick={open?endShift:startShift}>{open?'Shift Ended':'Shift Started'}</button>}>
          <div className="clock"><strong>{open?new Date(open.clock_in_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'--:--'}</strong><span>{open?'Shift started':'Shift not started'}<br/>Timezone: {open?.local_timezone||localTz()}</span></div>
        </Card>
        <Card title="Current Active Tasks" action={<button onClick={()=>setPage('Tasks')}>+ Task</button>}>
          {tasks.length ? tasks.slice(0,4).map(t=><Task key={t.id} t={t} compact={true} updateTaskStatus={()=>{}} deleteTask={()=>{}}/>) : <Empty text="No active tasks."/>}
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
function Task({t, currentUserId, isAdmin, updateTaskStatus, deleteTask, compact=false}) {
  const canUpdate = isAdmin || t.assignee_id === currentUserId;
  const canDelete = isAdmin || t.created_by === currentUserId;
  return (
    <div className="task">
      <i></i>
      <div>
        <b>{t.title}</b>
        <span>{t.assignee_name} · {t.priority} · {t.due_date||'No due date'}</span>
        {t.description && <p className="taskDescription">{t.description}</p>}
      </div>
      {!compact && <div className="taskActions">
        <select disabled={!canUpdate} value={t.status || 'To Do'} onChange={e=>updateTaskStatus(t, e.target.value)}>
          <option>To Do</option><option>In Progress</option><option>Completed</option>
        </select>
        {canDelete && <button className="miniDelete" onClick={()=>deleteTask(t)}>×</button>}
      </div>}
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

  return (
    <div className="calendarWrap">
      <div className="dowRow">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=><div className="dow" key={x}>{x}</div>)}</div>
      {weeks.map((days, wi) => (
        <div className="weekBlock" key={wi}>
          <div className="weekDays">
            {days.map(day => {
              const inMonth = day.getMonth() === m;
              const weekendClass = day.getDay() === 0 ? ' sunday' : day.getDay() === 6 ? ' saturday' : '';
              return <div className={(inMonth ? 'dayNum' : 'dayNum mutedDay') + weekendClass} key={dateKey(day)}>{day.getDate()}</div>
            })}
          </div>
          <div className="weekEvents">
            {weekSegments(days).map(({event,start,span}) => (
              <div key={event.id + '-' + wi} className={`eventBar ${eventClass(event.type)}`} style={{ gridColumn: `${start + 1} / span ${span}` }} title={`Created by ${event.created_by_name || 'Unknown'}`}>
                <span>{event.title}{event.all_day ? '' : ' · ' + (event.event_time || '')}</span>
                <small>by {event.created_by_name || 'Unknown'}</small>
                <button className="miniDelete" onClick={() => deleteEvent(event.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function Table({headers,rows}) { return <table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>):<tr><td colSpan={headers.length} className="emptyCell">No records yet.</td></tr>}</tbody></table> }

createRoot(document.getElementById('root')).render(<App/>);
