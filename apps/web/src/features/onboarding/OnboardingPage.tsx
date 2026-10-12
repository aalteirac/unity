import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Box, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Database, ExternalLink, FlaskConical, Globe2, Layers, LayoutDashboard, Link2, Loader2, Puzzle, RotateCcw, ShieldCheck, Snowflake, Users, X } from 'lucide-react';
import type { DemoIdentity, Job, Operation } from '@portal/contracts';
import { DeploymentFlowPage } from '../deployment/DeploymentFlowPage';
import '../deployment/deployment.css';

function viewFromHash() {
  const route = window.location.hash.slice(1);
  return ['overview', 'projects', 'deployment-flow'].includes(route) ? route : 'integrations';
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'The request could not be completed.');
  return value as T;
}
type Preview = { project: string; activePlayers: number; revenue: number };
export function OnboardingPage() {
  const [identities, setIdentities] = useState<DemoIdentity[]>([]);
  const [identity, setIdentity] = useState<DemoIdentity>();
  const [input, setInput] = useState(() => localStorage.getItem('portal-account') ?? '');
  const [account, setAccount] = useState('');
  const [preview, setPreview] = useState<Preview[]>([]);
  const [job, setJob] = useState<Job>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [operations, setOperations] = useState<Operation[]>();
  const [mode, setMode] = useState('mock');
  const live = mode === 'live-test';
  const [view, setView] = useState(viewFromHash);

  useEffect(() => {
    const syncView = () => setView(viewFromHash());
    window.addEventListener('hashchange', syncView);
    return () => window.removeEventListener('hashchange', syncView);
  }, []);
  function navigate(nextView: string) {
    window.location.hash = nextView;
    setView(nextView);
  }

  async function chooseIdentity(id: string) {
    const result = await api<{ identity: DemoIdentity; preview: Preview[]; mode: string }>('/session', { identityId: id });
    setIdentity(result.identity); setPreview(result.preview); setMode(result.mode); setJob(undefined); setOperations(undefined); setAccount(''); setStep(1);
    localStorage.setItem('portal-identity', id);
  }
  useEffect(() => {
    let active = true;
    api<{ identities: DemoIdentity[] }>('/identities').then(async (result) => {
      if (!active) return;
      setIdentities(result.identities);
      const saved = localStorage.getItem('portal-identity');
      await chooseIdentity(result.identities.find(item => item.id === saved)?.id ?? result.identities[0].id);
    }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed.'); } finally { setBusy(false); }
  }
  async function validate() {
    const result = await api<{ account: string }>('/accounts/validate', { input });
    setAccount(result.account); setStep(2); setJob(undefined); setOperations(undefined);
  }
  async function deliver() {
    const result = await api<Job>('/deliveries', { account });
    setJob(result); setStep(3);
  }
  async function removeListings() {
    if (!job || !window.confirm(`Delete both listings for ${job.account}? This drops the listings and the portal's filtered view and share in Snowflake. Source data and the app package are kept.`)) return;
    setJob(await api<Job>(`/deliveries/${job.id}/delete`, { confirm: true }));
  }
  const statuses = job ? Object.values(job.products).map(product => product.status) : [];
  const removed = statuses.length > 0 && statuses.every(status => status === 'removed');
  const complete = job && statuses.every(status => status === (live ? 'draft' : 'simulated'));
  const retryable = (status: string) => live ? ['failed', 'blocked', 'not_configured'].includes(status) : status === 'failed';
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Unity Cloud home"><Box size={30} strokeWidth={2.7}/><span>unity<span className="brand-cloud">cloud</span></span></a>
      <div className="org-label">ORGANIZATION</div><div className="org-switch"><div className="org-icon">{identity?.organization.slice(0, 1) ?? 'N'}</div><span>{identity?.organization ?? 'Loading studio'}<small>Developer workspace</small></span><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      {[['overview', LayoutDashboard, 'Overview'], ['projects', Layers, 'Projects'], ['integrations', Puzzle, 'Integrations'], ['deployment-flow', Code2, 'Deployment flow']].map(([id, Icon, text]) => {
        const NavIcon = Icon as typeof Box;
        return <button className={`nav-item ${id === view ? 'selected' : ''}`} aria-current={id === view ? 'page' : undefined} key={String(id)} onClick={() => navigate(String(id))}><NavIcon size={18}/>{String(text)}{id === view && <span className="nav-dot"/>}</button>;
      })}
      <div className="sidebar-bottom"><div className="sandbox-label"><FlaskConical size={17}/>Demo workspace</div><a className="nav-item" href="https://docs.snowflake.com/en/collaboration/provider-listings-creating-publishing" target="_blank" rel="noreferrer"><CircleHelp size={18}/>Help & documentation<ArrowUpRight size={14}/></a><div className="user"><div className="avatar">{identity?.initials ?? '--'}</div><span>{identity?.name ?? 'Demo developer'}<small>Unity demo identity</small></span></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Integrations<ChevronRight size={14}/><strong>{view === 'deployment-flow' ? 'Deployment flow' : view === 'projects' ? 'Projects' : view === 'overview' ? 'Overview' : 'Snowflake'}</strong></div><span className="environment"><span/>Sandbox environment</span></header>
      <main>
        <nav className="portal-page-switch" aria-label="Snowflake pages">
          <a href="#integrations" aria-current={view !== 'deployment-flow' ? 'page' : undefined}>Account onboarding</a>
          <a href="#deployment-flow" aria-current={view === 'deployment-flow' ? 'page' : undefined}>Deployment flow</a>
        </nav>
        {view === 'deployment-flow' && <DeploymentFlowPage/>}
        <div hidden={view === 'deployment-flow'}>
        <div className="backline"><Puzzle size={15}/> INTEGRATIONS / DATA & ANALYTICS</div>
        <div className="page-heading"><div><h1>Connect your data. <span>Build what's next.</span></h1><p>Bring your Unity data and analytics tools into your own Snowflake account.</p></div><a className="button secondary docs-link" href="https://docs.snowflake.com/en/user-guide/admin-account-identifier" target="_blank" rel="noreferrer">Documentation<ExternalLink size={15}/></a></div>
        {!live && <div className="demo-banner"><FlaskConical size={18}/><div><strong>You're exploring a demo.</strong> Synthetic Unity data and simulated delivery. No accounts, listings, or shares are created.</div><span className="badge">{mode === 'dry-run' ? 'DRY RUN' : 'DEMO MODE'}</span></div>}
        {view === 'projects' && <section className="card contextual"><h2>Your demo projects</h2><p>{identity?.projects.join(' · ')}</p><button className="text-button" onClick={() => navigate('integrations')}>Return to Snowflake integration <ArrowRight size={14}/></button></section>}
        <div className="content-grid"><div className="primary-column">
          <section className="card integration-hero"><div className="integration-hero-top"><div className="snowflake-logo"><Snowflake size={40}/></div><div><div className="eyebrow">DATA PLATFORM</div><h2>Snowflake</h2><p>Your studio. Your data. Your cloud.</p></div><span className="badge neutral">PRIVATE DELIVERY</span></div><p className="hero-description">Unlock a unified view of your games. Connect a Snowflake account to receive a Native App and a private dataset tailored to your Unity identity.</p><div className="hero-features"><span><ShieldCheck size={16}/>Private to your account</span><span><Database size={16}/>Unity-scoped data</span><span><Globe2 size={16}/>Your Snowflake environment</span></div></section>
          <section className="card setup-card"><div className="card-heading"><div><h2>Set up your connection</h2><p>A few steps to your own analytics workspace.</p></div><button className="icon-button" aria-label="Reset demo" disabled={busy} onClick={() => void action(async () => { setInput(''); localStorage.removeItem('portal-account'); await chooseIdentity(identity!.id); })}><RotateCcw size={17}/></button></div>
            <div className="stepper">{['Account details', 'Review delivery', 'Connection status'].map((label, index) => <div key={label} className={`step ${step >= index + 1 ? 'active' : ''}`}><span>{step > index + 1 ? <Check size={14}/> : index + 1}</span><strong>{label}</strong></div>)}</div>
            {error && <div className="error" role="alert"><X size={17}/>{error}</div>}
            {step === 1 && <><label htmlFor="identity">Unity identity <span className="field-tag">DEMO</span></label><select id="identity" value={identity?.id ?? ''} disabled={busy || !identity} onChange={event => void action(() => chooseIdentity(event.target.value))}>{identities.map(item => <option key={item.id} value={item.id}>{item.name} · {item.organization}</option>)}</select>
              <div className="account-choice"><div><h3>New to Snowflake?</h3><p>Create a trial, then return here with your account details.</p></div><a className="button secondary" href="https://signup.snowflake.com/" target="_blank" rel="noreferrer">Create a free trial<ArrowUpRight size={16}/></a></div>
              <label htmlFor="account">Snowflake account URL or identifier</label><input id="account" aria-describedby="account-help" value={input} autoComplete="off" placeholder="e.g. myorg.myaccount" onChange={event => { setInput(event.target.value); localStorage.setItem('portal-account', event.target.value); }}/><p id="account-help" className="field-help">After signing up, activate your Snowflake account using the link in the email you received. Then sign in to Snowflake, open the account menu, and select <strong>View account details</strong> to find your account URL or <code>ORG.ACCOUNT</code> Data Sharing Account Identifier. Copy it and paste it here. <a href="https://docs.snowflake.com/en/user-guide/admin-account-identifier" target="_blank" rel="noreferrer">Where do I find this?</a></p><div className="security-note"><ShieldCheck size={16}/>We never ask for your Snowflake password or credentials.</div><div className="form-footer"><span>Account details stay in this browser.</span><button className="button primary" disabled={busy || !input.trim() || !identity} onClick={() => void action(validate)}>{busy ? <Loader2 className="spin" size={17}/> : <>Continue<ArrowRight size={17}/></>}</button></div></>}
            {step === 2 && <><div className="recipient"><span>CONFIRM RECIPIENT ACCOUNT</span><strong>{account}</strong><p>{live ? 'Both draft listings will target this account. It must be a real Snowflake account; nothing is published until you publish it in Provider Studio.' : 'Format checked, not ownership verified. Delivery is simulated.'}</p></div><p>These two private listings will be prepared independently for <strong>{identity?.organization}</strong>. Only data scoped to <code>{identity?.unityId}</code> is included.</p><div className="review-products"><div><Box size={22}/><h3>Unity Analytics Native App</h3><p>Application package delivery</p></div><div><Database size={22}/><h3>Your Unity dataset</h3><p>{preview.length} synthetic project records</p></div></div><div className="form-footer"><button className="text-button" disabled={busy} onClick={() => setStep(1)}>Edit account</button><button className="button primary" disabled={busy} onClick={() => void action(deliver)}>{busy ? <Loader2 className="spin" size={17}/> : <>{live ? 'Create draft listings' : 'Simulate private delivery'}<ArrowRight size={17}/></>}</button></div></>}
            {step === 3 && job && <><div className={`completion ${complete ? 'success' : ''}`}><div className="completion-icon">{complete ? <Check size={26}/> : <CircleHelp size={26}/>}</div><h2>{removed ? 'Listings deleted' : complete ? (live ? 'Draft listings created' : 'Your demo connection is ready') : 'One delivery needs attention'}</h2><p>{removed ? 'Both listings were deleted from Snowflake. You can create them again at any time.' : complete ? (live ? `Both private listings exist as unpublished drafts targeting ${job.account}.` : 'Both products were delivered in the simulation. Nothing was published to Snowflake.') : live ? 'Successful products are preserved. Check the API server log, then retry the blocked product.' : 'The successful delivery is preserved. Retry only the failed product.'}</p></div><div className="delivery-list">{(['nativeApp', 'data'] as const).map(product => <div className="delivery-item" key={product}><div className="product-symbol">{product === 'nativeApp' ? <Box size={21}/> : <Database size={21}/>}</div><div><strong>{product === 'nativeApp' ? 'Unity Analytics Native App' : 'Unity-scoped dataset'}</strong><p>{job.products[product].message}</p><code>{job.products[product].listingName}</code></div><span className={`badge ${['failed', 'blocked'].includes(job.products[product].status) ? 'danger' : ''}`}>{job.products[product].status.toUpperCase().replace('_', ' ')}</span>{retryable(job.products[product].status) && <button className="button secondary" disabled={busy} onClick={() => void action(async () => setJob(await api<Job>(`/deliveries/${job.id}/retry`, { product })))}>Retry</button>}</div>)}</div><div className="next-steps"><strong>{live ? 'Check the result in Snowflake' : 'When live delivery is available'}</strong><p>{live ? 'In the provider account, open Data Products » Provider Studio, or run SHOW LISTINGS LIKE \'UNITY_PORTAL_%\'. The consumer can only see them after they are published.' : "Open Snowflake's private sharing area, accept each listing, install the Native App, and create a database from the data listing. These consumer steps are not performed by this portal."}</p></div><div className="form-footer"><button className="text-button" disabled={busy} onClick={() => setStep(1)}>Start a new connection</button>{live && !removed && <button className="button secondary danger" disabled={busy} onClick={() => void action(removeListings)}><X size={16}/>Delete listings</button>}<button className="button secondary" disabled={busy} onClick={() => void action(async () => { const result = await api<{ operations: Operation[] }>('/prepare', { account }); setOperations(result.operations); })}><Code2 size={16}/>Preview integration SQL</button></div></>}
          </section>
          {operations && <section className="card sql-card"><div className="card-heading"><h2>Integration preview</h2><button className="icon-button" aria-label="Close SQL preview" onClick={() => setOperations(undefined)}><X size={18}/></button></div><p>Dry-run only. Sample object configuration; live SQL has not been tested.</p>{operations.map((operation, index) => <details key={index}><summary>{operation.label} <span className="badge neutral">{operation.phase}</span></summary><pre>{operation.sql}</pre></details>)}</section>}
        </div><aside className="secondary-column"><section className="card delivery-card"><div className="eyebrow">WHAT YOU'LL RECEIVE</div><h2>Two products.<br/>One connection.</h2><div className="side-product"><div className="product-symbol purple"><Box size={23}/></div><h3>Unity Analytics app</h3><p>A Native App delivered privately to your Snowflake account.</p><span className="mini-label">SEPARATE APP LISTING</span></div><div className="side-product"><div className="product-symbol"><Database size={23}/></div><h3>Your Unity data</h3><p>A secure dataset filtered to your Unity identity. No other studio's data.</p><span className="mini-label">SEPARATE DATA LISTING</span></div><div className="privacy-footer"><ShieldCheck size={17}/><span>Private by design.<br/>Sharing enforced on the backend.</span></div></section>
          <section className="card preview-card"><div className="card-heading"><h3>Dataset preview</h3><span className="badge neutral">SAMPLE</span></div><p>Synthetic projects for your selected identity.</p>{preview.map(row => <div className="preview-row" key={row.project}><div><span className="project-dot"/>{row.project}<small>{row.activePlayers.toLocaleString()} active players</small></div><strong>${row.revenue.toLocaleString()}</strong></div>)}{!preview.length && <p>No sample data loaded.</p>}<div className="identity-scope"><Users size={14}/><code>{identity?.unityId ?? 'Loading identity'}</code></div></section>
          <div className="help-panel"><Link2 size={19}/><div><strong>Built for your workflow</strong><p>Your Native App and data deliveries are independent, so either can be retried without starting over.</p></div></div>
        </aside></div></div><footer className="page-footer"><span>Unity-inspired demo · Not an official Unity service</span><span>Powered by Snowflake <Snowflake size={15}/></span></footer>
      </main>
    </div>
  </div>;
}