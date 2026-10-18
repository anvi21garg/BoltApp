import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Filter,
  Hospital,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Role = 'patient' | 'hospital' | 'insurer';
type Profile = { id: string; full_name: string; role: Role; organisation_name: string | null };
type Case = {
  id: string;
  reference_number: string;
  title: string;
  hospital_id: string | null;
  insurer_id: string | null;
  hospital_name: string | null;
  insurer_name: string | null;
  procedure_name: string | null;
  diagnosis: string | null;
  policy_number: string | null;
  estimated_cost: number;
  status: string;
  readiness_score: number;
  version: number;
  patient_approved_version: number | null;
  updated_at: string;
};
type Document = { id: string; pa_id: string; name: string; document_type: string; file_type: string; file_size: number; status: string; created_at: string };
type DocumentRequest = { id: string; pa_id: string; document_type: string; note: string | null; status: string; created_at: string };

const navByRole: Record<Role, { label: string; icon: typeof LayoutDashboard }[]> = {
  patient: [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'My claims', icon: ClipboardCheck },
    { label: 'Documents', icon: FileText },
    { label: 'Messages', icon: Bell },
  ],
  hospital: [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Requests', icon: ClipboardCheck },
    { label: 'Patients', icon: UsersRound },
    { label: 'Documents', icon: FileText },
  ],
  insurer: [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Intake', icon: Upload },
    { label: 'Review queue', icon: ClipboardCheck },
    { label: 'Policies', icon: ShieldCheck },
  ],
};

const statusLabel: Record<string, string> = {
  DRAFT: 'Draft',
  COLLECTING_DOCUMENTS: 'Collecting documents',
  HOSPITAL_REVIEW: 'Hospital review',
  PATIENT_APPROVAL: 'Patient approval',
  SUBMITTED: 'Submitted',
  INSURER_REVIEW: 'Insurer review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  RESUBMISSION_REQUESTED: 'Needs changes',
};

function App() {
  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? { user: data.session.user } : null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ? { user: nextSession.user } : null);
      if (!nextSession) setProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('id, full_name, role, organisation_name').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (data) setProfile(data as Profile);
      setLoading(false);
    });
  }, [session]);

  if (loading) return <div className="page-loading"><div className="brand-mark">PA</div><span>Preparing your workspace</span></div>;
  if (!session || !profile) return <AuthScreen />;
  return <Portal profile={profile} onLogout={() => supabase.auth.signOut()} />;
}

function AuthScreen() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [role, setRole] = useState<Role>('patient');
  const [form, setForm] = useState({ name: '', organisation: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    if (isRegistering) {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (signUpError) setError(signUpError.message);
      else if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, full_name: form.name, role, organisation_name: form.organisation || null });
        if (profileError) setError(profileError.message);
        else setNotice(data.session ? 'Your workspace is ready.' : 'Account created. You can now sign in.');
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (signInError) setError('That email and password combination did not work.');
    }
    setBusy(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-art">
        <div className="brand"><span className="brand-mark">PA</span><span>PAce</span></div>
        <div className="art-copy"><p className="eyebrow">Prior authorisation, made clearer</p><h1>Bring every part of a PA request into focus.</h1><p>Prepare, complete and review prior authorisation cases with the people who matter.</p></div>
        <div className="art-card"><div className="art-card-top"><span>Readiness snapshot</span><Sparkles size={16} /></div><div className="art-score"><strong>82</strong><span>/100</span><div className="score-ring"><div /></div></div><div className="mini-lines"><span /><span /><span /></div></div>
        <div className="art-footer">Secure workspace for patients, hospitals and insurers</div>
      </div>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="mobile-brand"><span className="brand-mark">PA</span><span>PAce</span></div>
          <div className="auth-heading"><p className="eyebrow">{isRegistering ? 'Create your workspace' : 'Welcome back'}</p><h2>{isRegistering ? 'Start with a clearer PA journey.' : 'Sign in to PAce.'}</h2><p>{isRegistering ? 'Choose the workspace that matches your role.' : 'Your prior authorisation workspace is ready when you are.'}</p></div>
          {isRegistering && <div className="role-picker">{(['patient', 'hospital', 'insurer'] as Role[]).map((item) => <button type="button" className={role === item ? 'role-choice active' : 'role-choice'} onClick={() => setRole(item)} key={item}>{item === 'patient' ? <UserRound size={18} /> : item === 'hospital' ? <Hospital size={18} /> : <ShieldCheck size={18} />}<span>{item[0].toUpperCase() + item.slice(1)}</span>{role === item && <Check size={16} />}</button>)}</div>}
          <form onSubmit={submit} className="auth-form">
            {isRegistering && <><label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Aanya Mehta" /></label>{role !== 'patient' && <label>Organisation name<input required value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} placeholder={role === 'hospital' ? 'e.g. City Care Hospital' : 'e.g. Nova Health Insurance'} /></label>}</>}
            <label>Email address<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
            <label>Password<input required minLength={6} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" /></label>
            {error && <div className="form-error">{error}</div>}{notice && <div className="form-notice">{notice}</div>}
            <button className="primary-button full" disabled={busy}>{busy ? 'Please wait…' : isRegistering ? 'Create workspace' : 'Sign in'}<ArrowUpRight size={17} /></button>
          </form>
          <button className="switch-auth" onClick={() => { setIsRegistering(!isRegistering); setError(''); setNotice(''); }}>{isRegistering ? 'Already have an account? Sign in' : 'New to PAce? Create an account'}</button>
          <p className="auth-footnote"><CircleHelp size={14} /> Use fictional information for testing.</p>
        </div>
      </section>
    </main>
  );
}

function Portal({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const [activeNav, setActiveNav] = useState('Overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [showNewCase, setShowNewCase] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [toast, setToast] = useState('');

  async function loadCases() {
    const { data } = await supabase.from('pa_requests').select('*').order('updated_at', { ascending: false });
    const nextCases = (data || []) as Case[];
    setCases(nextCases);
    if (selectedCase) setSelectedCase(nextCases.find((item) => item.id === selectedCase.id) || null);
  }
  async function loadCaseData(paId: string) {
    const [docs, reqs] = await Promise.all([
      supabase.from('documents').select('*').eq('pa_id', paId).order('created_at', { ascending: false }),
      supabase.from('document_requests').select('*').eq('pa_id', paId).order('created_at', { ascending: false }),
    ]);
    setDocuments((docs.data || []) as Document[]); setRequests((reqs.data || []) as DocumentRequest[]);
  }
  useEffect(() => {
    supabase.from('pa_requests').select('*').order('updated_at', { ascending: false }).then(({ data }) => setCases((data || []) as Case[]));
    if (profile.role === 'hospital') supabase.from('document_requests').select('*').eq('assigned_to', profile.id).order('created_at', { ascending: false }).then(({ data }) => setRequests((data || []) as DocumentRequest[]));
    const channel = supabase.channel(`pace-sync-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'pa_requests' }, () => { void supabase.from('pa_requests').select('*').order('updated_at', { ascending: false }).then(({ data }) => setCases((data || []) as Case[])); }).on('postgres_changes', { event: '*', schema: 'public', table: 'document_requests' }, () => { if (selectedCase) void loadCaseData(selectedCase.id); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile.id, profile.role, selectedCase?.id]);
  useEffect(() => { if (selectedCase) loadCaseData(selectedCase.id); }, [selectedCase]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3000); return () => window.clearTimeout(timer); }, [toast]);

  const stats = useMemo(() => ({ active: cases.filter((item) => !['APPROVED', 'DENIED'].includes(item.status)).length, documents: documents.length, requests: requests.filter((item) => item.status === 'Pending').length }), [cases, documents, requests]);

  async function createCase(values: { title: string; hospital: string; insurer: string; procedure: string; diagnosis: string; cost: string }) {
    const [{ data: hospital }, { data: insurer }] = await Promise.all([
      supabase.from('profiles').select('id').eq('role', 'hospital').eq('organisation_name', values.hospital).maybeSingle(),
      supabase.from('profiles').select('id').eq('role', 'insurer').eq('organisation_name', values.insurer).maybeSingle(),
    ]);
    const { data, error } = await supabase.from('pa_requests').insert({ patient_id: profile.id, hospital_id: hospital?.id || null, insurer_id: insurer?.id || null, title: values.title, hospital_name: values.hospital, insurer_name: values.insurer, procedure_name: values.procedure, diagnosis: values.diagnosis, estimated_cost: Number(values.cost) || 0, status: 'COLLECTING_DOCUMENTS', readiness_score: 16 }).select().maybeSingle();
    if (!error && data) { await supabase.from('pa_timeline').insert({ pa_id: data.id, actor_id: profile.id, action: 'Case created', detail: 'PA draft started by patient' }); setShowNewCase(false); setSelectedCase(data as Case); await loadCases(); setToast('Your PA workspace is ready.'); }
  }
  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !selectedCase) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) { setToast('Please choose a PDF, JPG or PNG under 10 MB.'); return; }
    const path = `${profile.id}/${selectedCase.id}/${Date.now()}-${file.name}`;
    const upload = await supabase.storage.from('pace-documents').upload(path, file);
    if (upload.error) { setToast('The document could not be uploaded.'); return; }
    const { error } = await supabase.from('documents').insert({ pa_id: selectedCase.id, uploaded_by: profile.id, name: file.name, document_type: 'Supporting document', file_type: file.type, file_size: file.size, storage_path: path, status: 'Needs review' });
    if (!error) { await supabase.from('pa_requests').update({ readiness_score: Math.min(100, selectedCase.readiness_score + 14), updated_at: new Date().toISOString() }).eq('id', selectedCase.id); await loadCaseData(selectedCase.id); await loadCases(); setToast('Document added to your case.'); }
    event.target.value = '';
  }
  async function requestDocument(values: { type: string; note: string }) {
    if (!selectedCase) return;
    const { error } = await supabase.from('document_requests').insert({ pa_id: selectedCase.id, requested_by: profile.id, assigned_to: selectedCase.hospital_id, document_type: values.type, note: values.note || null });
    if (!error) { setShowRequest(false); await loadCaseData(selectedCase.id); setToast('Request sent to the hospital.'); }
  }
  async function applyCaseAction(action: string, reason?: string) {
    if (!selectedCase) return;
    const { error } = await supabase.rpc('pace_apply_case_action', { p_pa_id: selectedCase.id, p_action: action, p_reason: reason || null });
    if (error) { setToast('This action is not available for the current case version.'); return; }
    await loadCases(); await loadCaseData(selectedCase.id);
    setToast(action === 'PATIENT_APPROVE' ? 'Your approval was recorded and the case was submitted.' : 'The case workflow was updated.');
  }
  async function respondToRequest(requestId: string, status: 'Fulfilled' | 'Unavailable') {
    const { error } = await supabase.rpc('pace_fulfill_document_request', { p_request_id: requestId, p_status: status, p_response_note: status === 'Unavailable' ? 'The requested document is not available.' : null });
    if (error) { setToast('The request could not be updated.'); return; }
    const { data } = await supabase.from('document_requests').select('*').eq('assigned_to', profile.id).order('created_at', { ascending: false });
    setRequests((data || []) as DocumentRequest[]); await loadCases(); setToast(status === 'Fulfilled' ? 'The patient has been notified.' : 'The patient has been notified that the document is unavailable.');
  }

  return <div className="app-shell">
    <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand sidebar-brand"><span className="brand-mark">PA</span><span>PAce</span></div>
      <div className="workspace-switcher"><div className="avatar">{profile.full_name.charAt(0)}</div><div><strong>{profile.full_name}</strong><span>{profile.role === 'patient' ? 'Patient workspace' : profile.organisation_name}</span></div><ChevronRight size={15} /></div>
      <nav className="main-nav">{navByRole[profile.role].map(({ label, icon: Icon }) => <button className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav(label); setSidebarOpen(false); }} key={label}><Icon size={18} /><span>{label}</span>{label === 'Messages' && stats.requests > 0 && <b>{stats.requests}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item"><CircleHelp size={18} /><span>Help centre</span></button><button className="nav-item" onClick={onLogout}><LogOut size={18} /><span>Sign out</span></button><div className="sidebar-note"><Sparkles size={16} /><div><strong>Need a hand?</strong><span>We make complex PA steps easier to follow.</span></div></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button><div className="search-box"><Search size={17} /><input placeholder="Search claims, records, policies…" /></div><div className="top-actions"><button className="icon-button"><Bell size={18} /></button><button className="icon-button"><CircleHelp size={18} /></button><div className="top-profile"><div className="avatar small">{profile.full_name.charAt(0)}</div><div><strong>{profile.full_name}</strong><span>{profile.role === 'patient' ? 'Patient' : profile.role === 'hospital' ? 'Hospital staff' : 'Reviewer'}</span></div></div></div></header>
      <div className="content-wrap">{activeNav === 'Overview' ? <Overview profile={profile} cases={cases} selectedCase={selectedCase} setSelectedCase={setSelectedCase} stats={stats} requests={requests} onNewCase={() => setShowNewCase(true)} onRequest={() => setShowRequest(true)} onUpload={uploadDocument} onAction={applyCaseAction} onRespondToRequest={respondToRequest} /> : <SectionView profile={profile} activeNav={activeNav} cases={cases} selectedCase={selectedCase} setSelectedCase={setSelectedCase} documents={documents} requests={requests} onNewCase={() => setShowNewCase(true)} onRequest={() => setShowRequest(true)} onUpload={uploadDocument} onAction={applyCaseAction} onRespondToRequest={respondToRequest} />}</div>
    </main>
    {showNewCase && <NewCaseModal onClose={() => setShowNewCase(false)} onSubmit={createCase} />}
    {showRequest && <RequestModal onClose={() => setShowRequest(false)} onSubmit={requestDocument} />}
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>;
}

function Overview({ profile, cases, selectedCase, setSelectedCase, stats, requests, onNewCase, onRequest, onUpload, onAction, onRespondToRequest }: { profile: Profile; cases: Case[]; selectedCase: Case | null; setSelectedCase: (item: Case | null) => void; stats: { active: number; documents: number; requests: number }; requests: DocumentRequest[]; onNewCase: () => void; onRequest: () => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onAction: (action: string, reason?: string) => void; onRespondToRequest: (requestId: string, status: 'Fulfilled' | 'Unavailable') => void }) {
  const patient = profile.role === 'patient';
  return <>
    <div className="page-heading"><div><p className="eyebrow">{patient ? 'Patient overview' : profile.role === 'hospital' ? 'Hospital workspace' : 'Review workspace'}</p><h1>{patient ? `Good morning, ${profile.full_name.split(' ')[0]}` : `Welcome, ${profile.full_name.split(' ')[0]}`}</h1><p>{patient ? 'Here’s what needs your attention today.' : 'Keep your PA cases moving with the next best action.'}</p></div>{patient ? <button className="primary-button" onClick={onNewCase}><Plus size={18} /> Start a PA request</button> : <button className="primary-button" onClick={onNewCase}><Upload size={18} /> New intake</button>}</div>
    <div className="notice-banner"><div className="notice-icon"><Sparkles size={18} /></div><div><strong>{patient ? 'A clearer path to approval' : 'One workspace, fewer follow-ups'}</strong><p>{patient ? 'Add your key documents and we’ll show what is still needed before submission.' : 'Review open tasks and keep patients, documents and decisions moving together.'}</p></div><button>Learn more <ArrowUpRight size={15} /></button></div>
    <div className="stats-grid"><StatCard label={patient ? 'Active PA requests' : 'Open cases'} value={String(stats.active).padStart(2, '0')} meta="Needs your attention" icon={<ClipboardCheck />} /><StatCard label="Documents ready" value={String(stats.documents).padStart(2, '0')} meta="Across your workspace" icon={<FileCheck2 />} /><StatCard label={patient ? 'Hospital requests' : 'Tasks waiting'} value={String(stats.requests).padStart(2, '0')} meta={stats.requests ? 'Action required' : 'All clear for now'} icon={<Clock3 />} /></div>
    {patient ? <div className="dashboard-grid"><section className="panel claims-panel"><div className="panel-heading"><div><span className="section-kicker">Your PA requests</span><h2>Cases in progress</h2></div><button className="text-button" onClick={() => setSelectedCase(cases[0] || null)}>View all <ArrowUpRight size={14} /></button></div>{cases.length === 0 ? <EmptyCase onClick={onNewCase} /> : <div className="case-list">{cases.slice(0, 3).map((item) => <CaseRow key={item.id} item={item} selected={selectedCase?.id === item.id} onClick={() => setSelectedCase(item)} />)}</div>}</section><CaseInsight selectedCase={selectedCase || cases[0] || null} onRequest={onRequest} onUpload={onUpload} onApprove={() => onAction('PATIENT_APPROVE')} /></div> : <RoleDashboard role={profile.role} cases={cases} selectedCase={selectedCase} setSelectedCase={setSelectedCase} requests={requests} onAction={onAction} />}
  </>;
}

function SectionView({ profile, activeNav, cases, selectedCase, setSelectedCase, documents, requests, onNewCase, onRequest, onUpload, onAction, onRespondToRequest }: { profile: Profile; activeNav: string; cases: Case[]; selectedCase: Case | null; setSelectedCase: (item: Case | null) => void; documents: Document[]; requests: DocumentRequest[]; onNewCase: () => void; onRequest: () => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onAction: (action: string, reason?: string) => void; onRespondToRequest: (requestId: string, status: 'Fulfilled' | 'Unavailable') => void }) {
  if (activeNav === 'Requests' && profile.role === 'hospital') return <><div className="page-heading"><div><p className="eyebrow">Hospital requests</p><h1>Requests from patients</h1><p>Respond here and the patient’s case updates automatically.</p></div></div><div className="panel full-panel">{requests.length ? requests.map((request) => <div className="request-row" key={request.id}><div className="request-icon"><Hospital size={18} /></div><div><strong>{request.document_type}</strong><p>{request.note || 'Document requested for this case.'}</p></div><span className={`status-pill ${request.status === 'Pending' ? 'warning' : 'success'}`}>{request.status}</span>{request.status === 'Pending' && <div className="request-actions"><button className="secondary-button" onClick={() => onRespondToRequest(request.id, 'Unavailable')}>Unavailable</button><button className="primary-button" onClick={() => onRespondToRequest(request.id, 'Fulfilled')}><Check size={14} /> Fulfilled</button></div>}</div>) : <div className="empty-documents"><div className="empty-icon"><Bell size={22} /></div><h3>No pending requests</h3><p>Patient document requests will appear here.</p></div>}</div></>;
  if (activeNav === 'My claims' || activeNav === 'Review queue') return <><div className="page-heading"><div><p className="eyebrow">{activeNav}</p><h1>{activeNav === 'My claims' ? 'Your claims' : 'Review queue'}</h1><p>Open a case to see its details and next actions.</p></div><button className="filter-button"><Filter size={16} /> Filter</button></div><div className="panel full-panel"><div className="search-row"><div className="inline-search"><Search size={16} /><input placeholder="Search by reference or procedure" /></div><span className="result-count">{cases.length} cases</span></div>{cases.length ? cases.map((item) => <CaseRow key={item.id} item={item} selected={selectedCase?.id === item.id} onClick={() => setSelectedCase(item)} />) : <EmptyCase onClick={onNewCase} />}</div>{selectedCase && <div className="detail-drawer">{profile.role === 'patient' ? <CaseInsight selectedCase={selectedCase} onRequest={onRequest} onUpload={onUpload} onApprove={() => onAction('PATIENT_APPROVE')} /> : <RoleCaseInsight role={profile.role} selectedCase={selectedCase} onAction={onAction} />}</div>}</>;
  if (activeNav === 'Documents' || activeNav === 'Policies') return <><div className="page-heading"><div><p className="eyebrow">{activeNav}</p><h1>{activeNav === 'Documents' ? 'Your document vault' : 'Policy library'}</h1><p>Keep source files organised and ready for review.</p></div><label className="primary-button"><Upload size={17} /> Upload file<input className="hidden-input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={onUpload} /></label></div><div className="panel full-panel">{documents.length ? documents.map((doc) => <DocumentRow key={doc.id} doc={doc} />) : <div className="empty-documents"><div className="empty-icon"><FileText size={22} /></div><h3>No documents yet</h3><p>Upload a source document to start building your PA package.</p><label className="secondary-button">Choose a file<input className="hidden-input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={onUpload} /></label></div>}</div></>;
  return <><div className="page-heading"><div><p className="eyebrow">{activeNav}</p><h1>{activeNav === 'Messages' ? 'Messages & requests' : activeNav}</h1><p>Stay on top of changes across your PA workspace.</p></div></div><div className="panel full-panel">{requests.length ? requests.map((request) => <div className="request-row" key={request.id}><div className="request-icon"><Hospital size={18} /></div><div><strong>{request.document_type}</strong><p>{request.note || 'Document requested for this case.'}</p></div><span className={`status-pill ${request.status === 'Pending' ? 'warning' : 'success'}`}>{request.status}</span></div>) : <div className="empty-documents"><div className="empty-icon"><Bell size={22} /></div><h3>You’re all caught up</h3><p>Notifications and requests will appear here.</p></div>}</div></>;
}

function RoleDashboard({ role, cases, selectedCase, setSelectedCase, requests, onAction }: { role: Role; cases: Case[]; selectedCase: Case | null; setSelectedCase: (item: Case | null) => void; requests: DocumentRequest[]; onAction: (action: string, reason?: string) => void }) { return <div className="role-dashboard"><section className="panel task-panel"><div className="panel-heading"><div><span className="section-kicker">Today’s focus</span><h2>{role === 'hospital' ? 'Cases needing action' : 'Cases ready for review'}</h2></div><button className="text-button">View all <ArrowUpRight size={14} /></button></div>{cases.length ? cases.map((item) => <CaseRow item={item} selected={selectedCase?.id === item.id} onClick={() => setSelectedCase(item)} key={item.id} />) : <div className="empty-documents compact"><div className="empty-icon"><UsersRound size={20} /></div><h3>No assigned cases yet</h3><p>New authorised cases will appear here.</p></div>}{role === 'hospital' && requests.some((request) => request.status === 'Pending') && <p className="role-note">You have pending patient document requests. Open Requests to respond.</p>}</section>{selectedCase ? <RoleCaseInsight role={role} selectedCase={selectedCase} onAction={onAction} /> : <section className="panel side-info"><div className="insight-header"><Sparkles size={17} /><span>Built for clarity</span></div><h3>Make the next action obvious.</h3><p>PAce brings documents, policy requirements and the case timeline together so reviews stay focused.</p><div className="info-line"><Check size={15} /> Shared case history</div><div className="info-line"><Check size={15} /> Traceable source documents</div></section>}</div> }

function RoleCaseInsight({ role, selectedCase, onAction }: { role: Role; selectedCase: Case; onAction: (action: string, reason?: string) => void }) { const insurer = role === 'insurer'; const canApprove = insurer ? ['SUBMITTED', 'INSURER_REVIEW'].includes(selectedCase.status) : ['COLLECTING_DOCUMENTS', 'HOSPITAL_REVIEW', 'RESUBMISSION_REQUESTED'].includes(selectedCase.status); return <section className="panel insight-panel"><div className="insight-header"><span className="section-kicker">Shared case workflow</span><span className={`status-pill ${selectedCase.status === 'APPROVED' ? 'success' : 'warning'}`}>{statusLabel[selectedCase.status]}</span></div><h2>{selectedCase.title}</h2><p className="muted">{selectedCase.reference_number} · Version {selectedCase.version}</p><div className="readiness"><div className="readiness-top"><span>PA readiness</span><strong>{selectedCase.readiness_score}%</strong></div><div className="progress-track"><div style={{ width: `${selectedCase.readiness_score}%` }} /></div><p>All participants see the same current case version.</p></div><div className="insight-actions">{insurer && selectedCase.status === 'SUBMITTED' && <button className="secondary-button full" onClick={() => onAction('INSURER_START_REVIEW')}>Start insurer review</button>}{canApprove && <button className="primary-button full" onClick={() => onAction(insurer ? 'INSURER_APPROVE' : 'HOSPITAL_APPROVE')}><Check size={16} /> {insurer ? 'Approve case' : 'Approve for patient review'}</button>}{canApprove && <button className="secondary-button full" onClick={() => onAction(insurer ? 'INSURER_DENY' : 'HOSPITAL_REQUEST_CHANGES', insurer ? 'DOCUMENTS_INSUFFICIENT: Supporting evidence needs review.' : 'Please add the missing supporting information.')}>{insurer ? 'Deny with reason' : 'Request changes'}</button>}</div></section> }

function CaseInsight({ selectedCase, onRequest, onUpload, onApprove }: { selectedCase: Case | null; onRequest: () => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onApprove: () => void }) { if (!selectedCase) return <section className="panel insight-panel empty-insight"><div className="empty-icon"><ClipboardCheck size={21} /></div><h3>Select a case to see the next step</h3><p>Your PA checklist and recommendations will appear here.</p></section>; return <section className="panel insight-panel"><div className="insight-header"><span className="section-kicker">Next best action</span><span className={`status-pill ${selectedCase.status === 'APPROVED' ? 'success' : 'warning'}`}>{statusLabel[selectedCase.status]}</span></div><h2>{selectedCase.title}</h2><p className="muted">{selectedCase.reference_number} · Updated today</p><div className="readiness"><div className="readiness-top"><span>PA readiness</span><strong>{selectedCase.readiness_score}%</strong></div><div className="progress-track"><div style={{ width: `${selectedCase.readiness_score}%` }} /></div><p>Indicative completeness estimate. The insurer makes the final decision.</p></div><div className="checklist"><div className="checklist-item done"><span><Check size={13} /></span><div><strong>PA details started</strong><small>Procedure and cost are on file</small></div></div><div className={selectedCase.readiness_score >= 30 ? 'checklist-item done' : 'checklist-item'}><span>{selectedCase.readiness_score >= 30 ? <Check size={13} /> : <Clock3 size={13} />}</span><div><strong>Supporting evidence</strong><small>{selectedCase.readiness_score >= 30 ? 'Documents added for review' : 'Upload your first document'}</small></div></div><div className="checklist-item"><span><Clock3 size={13} /></span><div><strong>Hospital confirmation</strong><small>Request the missing hospital document</small></div></div></div><div className="insight-actions"><label className="secondary-button"><Upload size={16} /> Add document<input className="hidden-input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={onUpload} /></label><button className="secondary-button" onClick={onRequest}><Hospital size={16} /> Request from hospital</button>{selectedCase.status !== 'PATIENT_APPROVAL' && <button className="primary-button full" onClick={onApprove}><Check size={16} /> Approve this version</button>}</div></section> }

function StatCard({ label, value, meta, icon }: { label: string; value: string; meta: string; icon: React.ReactNode }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div> }
function CaseRow({ item, selected, onClick }: { item: Case; selected?: boolean; onClick: () => void }) { return <button className={selected ? 'case-row selected' : 'case-row'} onClick={onClick}><div className="case-symbol"><FileCheck2 size={17} /></div><div className="case-main"><strong>{item.title}</strong><span>{item.reference_number} · {item.procedure_name || 'Procedure to be confirmed'}</span></div><div className="case-meta"><span className={`status-pill ${item.status === 'APPROVED' ? 'success' : item.status === 'DENIED' ? 'danger' : 'warning'}`}>{statusLabel[item.status]}</span><span className="case-score">{item.readiness_score}% ready</span></div><ChevronRight size={16} className="row-chevron" /></button> }
function DocumentRow({ doc }: { doc: Document }) { return <div className="document-row"><div className="document-icon"><FileText size={18} /></div><div><strong>{doc.name}</strong><span>{doc.document_type} · {(doc.file_size / 1024 / 1024).toFixed(1)} MB</span></div><span className={`status-pill ${doc.status === 'Accepted' ? 'success' : 'warning'}`}>{doc.status}</span><MoreHorizontal size={18} /></div> }
function EmptyCase({ onClick }: { onClick: () => void }) { return <div className="empty-state"><div className="empty-icon"><ClipboardCheck size={22} /></div><h3>Start your first PA request</h3><p>Bring your documents together and see exactly what is still needed.</p><button className="secondary-button" onClick={onClick}><Plus size={16} /> Start a request</button></div> }

function NewCaseModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (values: { title: string; hospital: string; insurer: string; procedure: string; diagnosis: string; cost: string }) => void }) { const [values, setValues] = useState({ title: '', hospital: '', insurer: '', procedure: '', diagnosis: '', cost: '' }); return <Modal title="Start a PA request" onClose={onClose}><p className="modal-intro">Add the essentials now. You can refine the details and attach documents later.</p><form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}><label>Case name<input required placeholder="e.g. Laparoscopic appendectomy" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} /></label><div className="form-grid"><label>Hospital<input placeholder="Hospital name" value={values.hospital} onChange={(e) => setValues({ ...values, hospital: e.target.value })} /></label><label>Insurer<input placeholder="Insurer name" value={values.insurer} onChange={(e) => setValues({ ...values, insurer: e.target.value })} /></label></div><div className="form-grid"><label>Procedure<input placeholder="Proposed procedure" value={values.procedure} onChange={(e) => setValues({ ...values, procedure: e.target.value })} /></label><label>Estimated cost<input type="number" placeholder="₹ 0" value={values.cost} onChange={(e) => setValues({ ...values, cost: e.target.value })} /></label></div><label>Diagnosis or clinical context<textarea rows={3} placeholder="What is the care team treating?" value={values.diagnosis} onChange={(e) => setValues({ ...values, diagnosis: e.target.value })} /></label><button className="primary-button full">Create PA workspace <ArrowUpRight size={16} /></button></form></Modal> }
function RequestModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (values: { type: string; note: string }) => void }) { const [values, setValues] = useState({ type: 'Hospital cost estimate', note: '' }); return <Modal title="Request a document" onClose={onClose}><p className="modal-intro">The hospital will see this request in its shared workspace.</p><form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}><label>Document needed<select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}><option>Hospital cost estimate</option><option>Doctor’s prescription</option><option>Discharge summary</option><option>Investigation report</option><option>Other supporting document</option></select></label><label>Note for the hospital<textarea rows={4} placeholder="Add context or a deadline" value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} /></label><button className="primary-button full">Send request <ArrowUpRight size={16} /></button></form></Modal> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-heading"><div><p className="eyebrow">PAce workspace</p><h2>{title}</h2></div><button className="close-button" onClick={onClose}><X size={19} /></button></div>{children}</div></div> }

export default App;
