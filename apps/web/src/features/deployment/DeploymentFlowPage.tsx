import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Box, Check, Code2, Copy, Database, Mail, RotateCcw, ShieldCheck, Snowflake, Users } from 'lucide-react';
import { sourceExcerpts } from './sourceExcerpts';

const steps = [
  { title: 'Activate Snowflake', owner: 'DEVELOPER', icon: Mail, description: 'Open the official trial signup, activate the account from the email, and copy its Data Sharing Account Identifier. Existing account? Skip signup.', takeaway: 'The developer supplies an account identifier, not a password.' },
  { title: 'Confirm identity + account', owner: 'UNITY PORTAL', icon: Users, description: 'Normalize the recipient to ORG.ACCOUNT. For live delivery, resolve the authenticated Unity identity and verify the approved recipient binding on the backend.', takeaway: 'One binding becomes the input to both independent delivery modules.' },
  { title: 'Prepare two products', owner: 'PROVIDER BACKEND', icon: Code2, description: 'The Native App module prepares an application-package listing. The data module creates a Unity-filtered secure view, a backing share, and its own private listing.', takeaway: 'Separate modules. Separate listings. No source-table SELECT grant to the consumer.' },
  { title: 'Review, then publish', owner: 'PROVIDER BACKEND', icon: ShieldCheck, description: 'Create drafts targeting only the approved account. Publish explicitly after validation. Track each product independently so a failed delivery can be retried without recreating the successful product.', takeaway: 'Draft creation and publication are intentionally separate actions.' },
  { title: 'Accept in Snowflake', owner: 'SNOWFLAKE CONSUMER', icon: Snowflake, description: 'The developer accepts both private listings in Snowflake, installs the Native App, and creates a database from the data listing. Remote-region fulfillment may take time.', takeaway: 'Publication is not installation. The consumer retains control of the final steps.' }
];

function Connector({ text }: { text: string }) {
  return <div className="flow-connector"><span/>{text}<ArrowDown size={16}/><span/></div>;
}
export function DeploymentFlowPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const active = steps[activeStep];
  const ActiveIcon = active.icon;
  return <section className="deployment-page" aria-label="Deployment flow presentation">
    <div className="backline"><Code2 size={15}/> UNITY + SNOWFLAKE / DELIVERY WALKTHROUGH</div>
    <div className="page-heading"><div><h1>One onboarding.<span>Two private deliveries.</span></h1><p>A simple developer journey. Two clearly separated backend integrations.</p></div><a className="button secondary" href="#integrations">Try the onboarding<ArrowRight size={16}/></a></div>
    <div className="flow-mode-note"><span className="badge">PRESENTATION</span><p>This page explains the deployment design. Today's portal simulates delivery; the live adapters are implemented but unverified.</p></div>

    <section className="card walkthrough" aria-labelledby="walkthrough-heading">
      <div className="card-heading"><div><div className="eyebrow">THE DEVELOPER JOURNEY</div><h2 id="walkthrough-heading">From account to private delivery</h2></div><span className="badge neutral">5 STEPS</span></div>
      <ol className="walkthrough-steps">{steps.map((item, index) => <li key={item.title}><button aria-current={index === activeStep ? 'step' : undefined} onClick={() => setActiveStep(index)}><span>{index < activeStep ? <Check size={14}/> : index + 1}</span>{item.title}</button></li>)}</ol>
      <div className="walkthrough-detail" aria-live="polite" aria-atomic="true"><div className="walkthrough-icon"><ActiveIcon size={26}/></div><div><div className="eyebrow">{active.owner} / STEP {activeStep + 1}</div><h3>{active.title}</h3><p>{active.description}</p><strong>{active.takeaway}</strong></div></div>
      <div className="walkthrough-controls"><button className="text-button" onClick={() => setActiveStep(0)}><RotateCcw size={14}/>Restart</button><div><button className="button secondary" disabled={activeStep === 0} onClick={() => setActiveStep(value => value - 1)}><ArrowLeft size={14}/>Previous</button><button className="button primary" disabled={activeStep === steps.length - 1} onClick={() => setActiveStep(value => value + 1)}>Next<ArrowRight size={14}/></button></div></div>
    </section>

    <section className="card flow-map" aria-labelledby="flow-map-heading">
      <div className="card-heading"><div><div className="eyebrow">WHAT HAPPENS BEHIND THE PORTAL</div><h2 id="flow-map-heading">One recipient. Two delivery paths.</h2></div><ShieldCheck size={22}/></div>
      <div className="binding-card"><div className="product-symbol"><Users size={24}/></div><div><h3>Unity identity + approved Snowflake account</h3><p>Illustrative binding: <code>unity_demo_north</code> + <code>ACME.GAMES</code></p><small>Not an authenticated binding. Live identity and account verification are prerequisites.</small></div></div>
      <Connector text="The same binding enters each module"/>
      <div className="delivery-lanes">
        <article className={`delivery-lane app-lane ${activeStep === 2 ? 'lane-highlight' : ''}`}><header><Box size={23}/><div><span className="eyebrow">NATIVE APP MODULE</span><h3>Deliver the application</h3></div></header><ol>
          <li><span>01</span><div><strong>Existing application package</strong><p>Configure the built Native App package. The portal does not build it.</p></div></li>
          <li><span>02</span><div><strong>Check distribution readiness</strong><p>Provider ownership, EXTERNAL distribution, approved version, and default release directive.</p></div></li>
          <li><span>03</span><div><strong>Private Native App listing</strong><p>Attach the package and target the approved account only.</p></div></li>
        </ol><div className="lane-outcome"><Box size={17}/>Application-package listing</div></article>
        <article className={`delivery-lane data-lane ${activeStep === 2 ? 'lane-highlight' : ''}`}><header><Database size={23}/><div><span className="eyebrow">DATA-SHARING MODULE</span><h3>Deliver the Unity dataset</h3></div></header><ol>
          <li><span>01</span><div><strong>Configured source data</strong><p>Allowlisted columns and a Unity identity column define the scope.</p></div></li>
          <li><span>02</span><div><strong>Filtered secure view + share</strong><p>Fix the view to the Unity identity. Grant SELECT on this view, never the unfiltered source table.</p></div></li>
          <li><span>03</span><div><strong>Private data listing</strong><p>Attach the backing secure share and target the approved account only.</p></div></li>
        </ol><div className="lane-outcome"><Database size={17}/>Secure-share listing</div></article>
      </div>
      <p className="lane-caption">Two distinct integration paths, not a claim of parallel execution. They share low-level helpers, not product-specific logic.</p>
      <Connector text="Prepare drafts, then publish explicitly"/>
      <div className="publish-card"><ShieldCheck size={24}/><div><h3>Independent status. Independent retry.</h3><p>Resharing disabled in the manifest. Existing-resource conflicts fail closed. A failed product does not require recreating the successful delivery.</p></div></div>
      <Connector text="Consumer acceptance and fulfillment are separate"/>
      <div className="consumer-card"><Snowflake size={29}/><div><h3>The developer finishes in Snowflake</h3><p>Accept the two listings → install the Native App → create the data database.</p><small>Cross-region fulfillment can be asynchronous. Connecting the future Native App to the separately mounted dataset is not implemented yet.</small></div></div>
    </section>

    <section className="responsibility-grid" aria-label="Who does what">
      <article className="card"><Mail size={21}/><h3>Developer does</h3><p>Activates an account, pastes its identifier, and reviews the recipient.</p></article>
      <article className="card"><Code2 size={21}/><h3>Unity backend does</h3><p>Resolves identity, prepares scoped products, and manages private-listing delivery.</p></article>
      <article className="card"><Snowflake size={21}/><h3>Snowflake consumer does</h3><p>Accepts the listings and installs or mounts each product in their account.</p></article>
    </section>
    <section className="card implementation-evidence" aria-labelledby="implementation-heading">
      <div className="card-heading"><div><div className="eyebrow">FROM THE ACTUAL REPOSITORY</div><h2 id="implementation-heading">See the implementation</h2></div><Code2 size={22}/></div>
      <p>Short source excerpts, loaded at build time. References and line numbers come from the same files as the snippets. These are not complete runnable deployment scripts.</p>
      {sourceExcerpts.map(excerpt => <details className="source-excerpt" key={excerpt.id}>
        <summary>{excerpt.title}<span className="badge neutral">TYPESCRIPT</span></summary>
        <p>{excerpt.description}</p>
        <div className="source-toolbar"><code>{excerpt.path}:{excerpt.startLine}-{excerpt.endLine}</code><button className="button secondary" aria-label={`Copy snippet: ${excerpt.title}`} onClick={async () => {
          try { await navigator.clipboard.writeText(excerpt.code); setCopyStatus(`Copied: ${excerpt.title}`); }
          catch { setCopyStatus('Clipboard unavailable. Select the code text and copy it manually.'); }
        }}><Copy size={14}/>Copy snippet</button></div>
        <pre tabIndex={0} aria-label={`Code excerpt: ${excerpt.title}`}><code>{excerpt.code}</code></pre>
      </details>)}
      <div role="status" aria-live="polite" className="copy-status">{copyStatus}</div>
    </section>
    <section className="card integration-readiness" aria-labelledby="readiness-heading"><div><ShieldCheck size={23}/><div><div className="eyebrow">A CLEAR PATH TO LIVE DELIVERY</div><h2 id="readiness-heading">Demo works today. Live integration comes next.</h2></div></div>
      <p>The live adapters are implemented but unverified and disconnected from demo sessions. Nothing on this page deploys or publishes to Snowflake.</p>
      <ul><li>Trusted Unity authentication and verified consumer account binding</li><li>Provider account, credentials, ownership, permissions, and listing terms</li><li>Real dataset with explicit columns and Unity entitlement scope</li><li>Built Native App with approved release and security readiness</li><li>Cross-region fulfillment configuration where required, plus consumer installation tests</li></ul>
      <p>The sample listing builder currently uses V1 manifests; V2-enabled provider accounts need the corresponding manifest adaptation. Provider-side publication does not automatically install the application.</p>
    </section>
  </section>;
}