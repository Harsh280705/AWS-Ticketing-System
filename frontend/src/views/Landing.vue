<template>
  <main class="lp-shell">
    <div class="lp-bg-grid" aria-hidden="true"></div>
    <div class="lp-glow lp-glow-a" aria-hidden="true"></div>
    <div class="lp-glow lp-glow-b" aria-hidden="true"></div>
    <div class="lp-glow lp-glow-c" aria-hidden="true"></div>

    <header class="lp-nav-wrap">
      <div class="lp-nav">
        <RouterLink to="/" class="lp-brand" aria-label="Supportly home">
          <span class="lp-brand-mark">S</span>
          <span class="lp-brand-copy">
            <strong>Supportly</strong>
            <small>AWS SERVICE DESK</small>
          </span>
        </RouterLink>

        <nav class="lp-nav-links" aria-label="Landing navigation">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#security">Security</a>
          <a href="#architecture">Architecture</a>
        </nav>

        <div class="lp-nav-actions">
          <RouterLink to="/login" class="lp-nav-signin">Sign in</RouterLink>
          <RouterLink to="/login" class="lp-nav-primary">
            Open portal
            <span>→</span>
          </RouterLink>
        </div>
      </div>
    </header>

    <section class="lp-hero">
      <div class="lp-hero-copy">
        <div class="lp-status-pill">
          <span class="lp-status-dot"></span>
          AWS-powered support operations
        </div>

        <h1>
          Ticketing support
        </h1>

        <p class="lp-hero-lead">
          A modern role-based ticketing service desk for customers and support teams.
        </p>

        <div class="lp-hero-actions">
          <RouterLink to="/customer-login" class="lp-role-card lp-customer-card">
            <span class="lp-role-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"/></svg>
            </span>
            <span class="lp-role-copy">
              <small>CUSTOMER</small>
              <strong>Open customer portal</strong>
              <em>Submit & track requests</em>
            </span>
            <span class="lp-role-arrow">→</span>
          </RouterLink>

          <RouterLink to="/agent-login" class="lp-role-card lp-agent-card">
            <span class="lp-role-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5ZM17 19c0 1-1 2-3 2h-2"/></svg>
            </span>
            <span class="lp-role-copy">
              <small>SUPPORT TEAM</small>
              <strong>Open agent portal</strong>
              <em>Manage & resolve tickets</em>
            </span>
            <span class="lp-role-arrow">→</span>
          </RouterLink>
        </div>

        <div class="lp-trust-row">
          <span><i>✓</i> Cognito authentication</span>
          <span><i>✓</i> JWT-protected API</span>
          <span><i>✓</i> Serverless backend</span>
        </div>
      </div>

      <div class="lp-product-stage" aria-label="Supportly dashboard preview">
        <div class="lp-stage-orbit lp-orbit-a" aria-hidden="true"></div>
        <div class="lp-stage-orbit lp-orbit-b" aria-hidden="true"></div>

        <div class="lp-float-card lp-float-lambda">
          <span class="lp-float-icon lambda">λ</span>
          <div><small>SERVERLESS BACKEND</small><strong>AWS Lambda + API Gateway</strong></div>
        </div>

        <div class="lp-float-card lp-float-auth">
          <span class="lp-float-icon shield">✓</span>
          <div><small>SECURE & SCALABLE</small><strong>Amazon Cognito</strong></div>
        </div>

        <div class="lp-float-card lp-float-uptime">
          <span class="lp-float-icon cloud">☁</span>
          <div><small>CLOUD STATUS</small><strong>99.9% service uptime</strong></div>
        </div>

        <div class="lp-dashboard">
          <div class="lp-dashboard-top">
            <div class="lp-dashboard-brand">
              <span>S</span>
              <div><strong>Supportly</strong><small>AWS SERVICE DESK</small></div>
            </div>
            <div class="lp-dashboard-search">
              <span>⌕</span>
              Search tickets, customers...
            </div>
            <div class="lp-agent-chip">
              <span>A</span>
              <div><strong>Alex</strong><small>Support Agent</small></div>
            </div>
          </div>

          <div class="lp-dashboard-body">
            <aside class="lp-mini-nav">
              <button class="active"><span>⌂</span> Overview</button>
              <button><span>▤</span> Tickets</button>
              <button><span>♙</span> Customers</button>
              <button><span>▥</span> Reports</button>
              <button><span>⚙</span> Settings</button>
            </aside>

            <div class="lp-dashboard-main">
              <div class="lp-dash-heading">
                <div>
                  <p>SUPPORT OVERVIEW</p>
                  <h2>Good morning, Alex</h2>
                  <span>Here’s what’s happening with your support desk today.</span>
                </div>
                <div class="lp-date-pill">Oct 13, 2026</div>
              </div>

              <div class="lp-kpi-grid">
                <article class="lp-kpi purple">
                  <div class="lp-kpi-head"><span>New tickets</span><b>↗ 12%</b></div>
                  <strong>24</strong>
                  <div class="lp-sparkline"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                </article>
                <article class="lp-kpi blue">
                  <div class="lp-kpi-head"><span>In progress</span><b>↗ 8%</b></div>
                  <strong>11</strong>
                  <div class="lp-sparkline"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                </article>
                <article class="lp-kpi green">
                  <div class="lp-kpi-head"><span>Resolved</span><b>↗ 24%</b></div>
                  <strong>86</strong>
                  <div class="lp-sparkline"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                </article>
                <article class="lp-kpi red">
                  <div class="lp-kpi-head"><span>SLA alerts</span><b>↓ 50%</b></div>
                  <strong>3</strong>
                  <div class="lp-sparkline"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                </article>
              </div>

              <div class="lp-dash-lower">
                <section class="lp-recent-card">
                  <div class="lp-card-heading"><strong>Recent tickets</strong><span>View all →</span></div>
                  <div class="lp-ticket-preview">
                    <span class="violet">▣</span>
                    <div><strong>Login access issue</strong><small>Customer · 2m ago</small></div>
                    <b class="open">OPEN</b>
                  </div>
                  <div class="lp-ticket-preview">
                    <span class="blue">▣</span>
                    <div><strong>Attachment upload failing</strong><small>Customer · 18m ago</small></div>
                    <b class="progress">IN PROGRESS</b>
                  </div>
                  <div class="lp-ticket-preview">
                    <span class="green">▣</span>
                    <div><strong>Billing question</strong><small>Customer · 2h ago</small></div>
                    <b class="resolved">RESOLVED</b>
                  </div>
                </section>

                <section class="lp-volume-card">
                  <div class="lp-card-heading"><strong>Ticket volume</strong><span>7 days⌄</span></div>
                  <div class="lp-bars" aria-hidden="true">
                    <i style="--h:38%"></i><i style="--h:62%"></i><i style="--h:82%"></i><i style="--h:57%"></i><i style="--h:42%"></i><i style="--h:64%"></i><i style="--h:86%"></i>
                  </div>
                  <div class="lp-bar-labels"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="lp-capability-strip" id="features">
      <article>
        <span class="lp-cap-icon">↯</span>
        <div><strong>Role-based access</strong><p>Dedicated customer and support portals.</p></div>
      </article>
      <article>
        <span class="lp-cap-icon">⌾</span>
        <div><strong>Enterprise-grade security</strong><p>Cognito authentication and JWT authorization.</p></div>
      </article>
      <article>
        <span class="lp-cap-icon">☁</span>
        <div><strong>Fully serverless</strong><p>Lambda, API Gateway, DynamoDB and S3.</p></div>
      </article>
      <article>
        <span class="lp-cap-icon">▥</span>
        <div><strong>Live operations</strong><p>Track ticket progress and queue performance.</p></div>
      </article>
    </section>

    <section class="lp-metrics">
      <div><span>◉</span><strong>2</strong><small>Dedicated role portals</small></div>
      <div><span>◇</span><strong>7</strong><small>Serverless functions</small></div>
      <div><span>☁</span><strong>100%</strong><small>Serverless workflow</small></div>
      <div><span>◷</span><strong>24/7</strong><small>Cloud availability</small></div>
    </section>

    <section class="lp-section" id="workflow">
      <div class="lp-section-heading">
        <span>WORKFLOW</span>
        <h2>Built to keep support moving.</h2>
        <p>From sign-in to resolution, every step stays simple, secure and visible.</p>
      </div>

      <div class="lp-workflow-grid">
        <article><b>01</b><div><strong>Authenticate</strong><p>Cognito verifies the user and role before workspace access.</p></div></article>
        <article><b>02</b><div><strong>Submit or triage</strong><p>Customers create requests while agents work from a live queue.</p></div></article>
        <article><b>03</b><div><strong>Collaborate</strong><p>Conversation, attachments and ticket history stay together.</p></div></article>
        <article><b>04</b><div><strong>Resolve</strong><p>Agents assign, update and resolve with clear status visibility.</p></div></article>
      </div>
    </section>

    <section class="lp-security" id="security">
      <div class="lp-security-copy">
        <span class="lp-security-icon">✓</span>
        <div>
          <small>ROLE-BASED SECURITY</small>
          <h2>Opening the Agent portal never grants Agent access.</h2>
          <p>Supportly verifies the authenticated Cognito group after sign-in. Customer and Agent workspaces remain separated even when someone manually opens a different portal URL.</p>
        </div>
      </div>
      <RouterLink to="/login" class="lp-outline-btn">Choose a portal <span>→</span></RouterLink>
    </section>

    <section class="lp-architecture" id="architecture">
      <div class="lp-section-heading compact">
        <span>SERVERLESS ARCHITECTURE</span>
        <h2>Small surface. Serious backend.</h2>
      </div>
      <div class="lp-architecture-flow">
        <div><b>Vue 3</b><span>Frontend</span></div><i>→</i>
        <div><b>Cognito</b><span>Authentication</span></div><i>→</i>
        <div><b>API Gateway</b><span>JWT routes</span></div><i>→</i>
        <div><b>Lambda</b><span>Business logic</span></div><i>→</i>
        <div><b>DynamoDB + S3</b><span>Data & files</span></div>
      </div>
    </section>

    <footer class="lp-footer">
      <div class="lp-brand">
        <span class="lp-brand-mark">S</span>
        <span class="lp-brand-copy"><strong>Supportly</strong><small>AWS SERVICE DESK</small></span>
      </div>
      <p>Vue 3 · Amazon Cognito · API Gateway · Lambda · DynamoDB · S3</p>
      <span>Training POC</span>
    </footer>
  </main>
</template>

<script setup>
import { RouterLink } from 'vue-router'
</script>

<style scoped>
.lp-shell{
  --lp-bg:#060914;
  --lp-panel:#0e1424;
  --lp-panel-2:#111a2e;
  --lp-line:rgba(134,153,209,.16);
  --lp-text:#f7f8ff;
  --lp-muted:#9aa6c0;
  --lp-purple:#8b5cf6;
  --lp-blue:#38a8ff;
  --lp-cyan:#67e8f9;
  --lp-green:#45d6a3;
  position:relative;
  min-height:100vh;
  overflow:hidden;
  color:var(--lp-text);
  background:
    radial-gradient(circle at 74% 23%,rgba(70,58,219,.18),transparent 28%),
    radial-gradient(circle at 16% 40%,rgba(24,136,211,.09),transparent 24%),
    linear-gradient(180deg,#08101f 0%,#060914 62%,#050812 100%);
  isolation:isolate;
}
.lp-bg-grid{position:absolute;inset:0 0 auto;height:980px;z-index:-4;opacity:.22;background-image:linear-gradient(rgba(139,164,225,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(139,164,225,.045) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,#000,transparent 88%)}
.lp-bg-grid:after{content:"";position:absolute;right:2%;top:155px;width:430px;height:430px;opacity:.32;background-image:radial-gradient(circle,rgba(134,151,246,.28) 1.2px,transparent 1.4px);background-size:20px 20px;mask-image:radial-gradient(circle,#000,transparent 70%)}
.lp-glow{position:absolute;z-index:-3;border-radius:999px;filter:blur(100px);pointer-events:none}.lp-glow-a{width:420px;height:420px;right:-120px;top:180px;background:rgba(111,55,255,.19)}.lp-glow-b{width:320px;height:320px;left:-150px;top:420px;background:rgba(23,155,234,.11)}.lp-glow-c{width:540px;height:260px;left:42%;top:690px;background:rgba(57,77,220,.08)}
.lp-nav-wrap{position:relative;z-index:20;padding:18px 28px 0}.lp-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;width:min(1400px,100%);min-height:72px;margin:0 auto;padding:0 18px;border:1px solid rgba(121,150,220,.18);border-radius:18px;background:rgba(8,14,29,.72);box-shadow:0 18px 70px rgba(0,0,0,.28);backdrop-filter:blur(22px)}
.lp-brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none}.lp-brand-mark{display:grid;width:43px;height:43px;place-items:center;border-radius:13px;background:linear-gradient(145deg,#9b72ff,#6655ff 55%,#258cff);box-shadow:0 9px 28px rgba(95,76,255,.32);font:800 20px/1 Manrope,sans-serif}.lp-brand-copy strong{display:block;font:800 20px/1 Manrope,sans-serif;letter-spacing:-.45px}.lp-brand-copy small{display:block;margin-top:5px;color:#8290ad;font-size:7px;font-weight:900;letter-spacing:2px}.lp-nav-links{display:flex;gap:36px;align-items:center}.lp-nav-links a{position:relative;color:#9da8be;text-decoration:none;font-size:12px;font-weight:700;transition:.2s}.lp-nav-links a:after{content:"";position:absolute;left:50%;right:50%;bottom:-10px;height:2px;border-radius:2px;background:linear-gradient(90deg,#8a6bff,#43b9ff);transition:.2s}.lp-nav-links a:hover{color:#fff}.lp-nav-links a:hover:after{left:0;right:0}.lp-nav-actions{display:flex;justify-content:flex-end;gap:10px}.lp-nav-signin,.lp-nav-primary{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 17px;border-radius:12px;text-decoration:none;font-size:11px;font-weight:800}.lp-nav-signin{border:1px solid rgba(142,162,218,.17);color:#c6cee0;background:rgba(255,255,255,.025)}.lp-nav-primary{gap:12px;border:1px solid rgba(114,113,255,.42);color:#fff;background:linear-gradient(120deg,#7758f7,#6e65ff 48%,#289bff);box-shadow:0 10px 34px rgba(83,85,241,.25)}.lp-nav-primary span{font-size:16px}.lp-nav-signin:hover,.lp-nav-primary:hover{transform:translateY(-1px)}
.lp-hero{position:relative;z-index:3;display:grid;grid-template-columns:minmax(430px,.88fr) minmax(650px,1.22fr);gap:52px;align-items:center;width:min(1400px,calc(100% - 56px));min-height:720px;margin:0 auto;padding:74px 0 60px}.lp-hero-copy{position:relative;z-index:5}.lp-status-pill{display:inline-flex;align-items:center;gap:10px;min-height:34px;padding:0 14px;border:1px solid rgba(50,201,169,.16);border-radius:999px;color:#93ddcc;background:rgba(24,145,123,.07);font-size:10px;font-weight:800;letter-spacing:.45px}.lp-status-dot{width:8px;height:8px;border-radius:50%;background:#25dda5;box-shadow:0 0 0 5px rgba(37,221,165,.09),0 0 20px rgba(37,221,165,.7);animation:lpPulse 2.2s ease-in-out infinite}.lp-hero h1{max-width:650px;margin:26px 0 22px;color:#fff;font:800 clamp(64px,6.7vw,105px)/.92 Manrope,sans-serif;letter-spacing:-6px}.lp-hero h1 span{display:block;margin-top:8px;background:linear-gradient(100deg,#a677ff 0%,#727eff 35%,#48aefc 68%,#86e1ff 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.lp-hero-lead{max-width:610px;margin:0;color:#a6b0c6;font-size:15px;line-height:1.75}.lp-hero-actions{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:640px;margin-top:32px}.lp-role-card{position:relative;display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:12px;min-height:82px;padding:14px 16px;border:1px solid rgba(132,153,213,.17);border-radius:17px;text-decoration:none;color:#fff;overflow:hidden;transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease}.lp-role-card:before{content:"";position:absolute;inset:0;opacity:.8;z-index:-1}.lp-customer-card:before{background:linear-gradient(120deg,rgba(111,66,238,.34),rgba(46,118,241,.27))}.lp-agent-card:before{background:linear-gradient(120deg,rgba(255,255,255,.04),rgba(77,63,162,.12))}.lp-role-card:hover{transform:translateY(-3px);border-color:rgba(126,137,255,.42);box-shadow:0 18px 48px rgba(13,19,50,.4)}.lp-role-icon{display:grid;width:44px;height:44px;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(7,12,27,.37)}.lp-role-icon svg{width:22px;height:22px;fill:none;stroke:#d9dcff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.lp-role-copy{display:block;min-width:0}.lp-role-copy small{display:block;color:#8f9ab7;font-size:7px;font-weight:900;letter-spacing:1.3px}.lp-role-copy strong{display:block;margin-top:5px;font-size:12px}.lp-role-copy em{display:block;margin-top:5px;color:#8d99b3;font-size:9px;font-style:normal}.lp-role-arrow{font-size:20px;color:#aab7ff}.lp-trust-row{display:flex;flex-wrap:wrap;gap:18px;margin-top:22px;color:#74809a;font-size:9px;font-weight:700}.lp-trust-row i{color:#6bdda9;font-style:normal}
.lp-product-stage{position:relative;min-height:600px;perspective:1400px}.lp-stage-orbit{position:absolute;border:1px solid rgba(106,99,255,.18);border-radius:50%;pointer-events:none}.lp-orbit-a{width:620px;height:620px;right:0;top:-10px;box-shadow:0 0 80px rgba(75,73,239,.06) inset}.lp-orbit-b{width:460px;height:460px;right:80px;top:70px;border-color:rgba(47,170,245,.13)}.lp-dashboard{position:absolute;right:-16px;top:84px;width:min(790px,100%);min-height:470px;border:1px solid rgba(108,135,212,.26);border-radius:26px;background:linear-gradient(145deg,rgba(14,21,39,.98),rgba(8,14,29,.98));box-shadow:0 36px 90px rgba(0,0,0,.5),0 0 70px rgba(78,75,255,.1);overflow:hidden;transform:rotateY(-5deg) rotateX(1.2deg);transform-origin:center;animation:lpDashboardFloat 7s ease-in-out infinite}.lp-dashboard:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(120deg,rgba(255,255,255,.035),transparent 22%)}.lp-dashboard-top{display:grid;grid-template-columns:180px 1fr 150px;align-items:center;gap:18px;min-height:68px;padding:0 18px;border-bottom:1px solid rgba(124,147,207,.12);background:rgba(12,19,35,.84)}.lp-dashboard-brand{display:flex;align-items:center;gap:9px}.lp-dashboard-brand>span{display:grid;width:30px;height:30px;place-items:center;border-radius:8px;background:linear-gradient(135deg,#8b61ff,#4c75ff);font:800 13px Manrope,sans-serif}.lp-dashboard-brand strong,.lp-dashboard-brand small{display:block}.lp-dashboard-brand strong{font-size:10px}.lp-dashboard-brand small{margin-top:3px;color:#687591;font-size:5px;letter-spacing:1px}.lp-dashboard-search{height:34px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid rgba(122,145,204,.12);border-radius:9px;background:#101a31;color:#64718c;font-size:8px}.lp-agent-chip{display:flex;justify-self:end;align-items:center;gap:8px}.lp-agent-chip>span{display:grid;width:30px;height:30px;place-items:center;border-radius:50%;background:linear-gradient(135deg,#8e63ff,#6958e8);font-size:9px;font-weight:800}.lp-agent-chip strong,.lp-agent-chip small{display:block}.lp-agent-chip strong{font-size:8px}.lp-agent-chip small{margin-top:2px;color:#72809b;font-size:6px}.lp-dashboard-body{display:grid;grid-template-columns:135px 1fr;min-height:402px}.lp-mini-nav{padding:19px 10px;border-right:1px solid rgba(124,147,207,.1);background:rgba(6,11,23,.32)}.lp-mini-nav button{display:flex;align-items:center;gap:8px;width:100%;height:34px;margin-bottom:5px;padding:0 10px;border:0;border-radius:8px;color:#677590;background:transparent;font-size:7px;text-align:left}.lp-mini-nav button.active{color:#dfe7ff;background:linear-gradient(90deg,rgba(75,88,229,.42),rgba(65,111,238,.18))}.lp-dashboard-main{padding:22px}.lp-dash-heading{display:flex;justify-content:space-between;align-items:flex-start}.lp-dash-heading p{margin:0 0 7px;color:#6d78a7;font-size:6px;font-weight:900;letter-spacing:1.3px}.lp-dash-heading h2{margin:0;color:#f7f8ff;font:800 18px Manrope,sans-serif;letter-spacing:-.6px}.lp-dash-heading span{display:block;margin-top:5px;color:#77839d;font-size:7px}.lp-date-pill{padding:8px 10px;border:1px solid rgba(125,147,204,.12);border-radius:8px;color:#8995ad;background:rgba(255,255,255,.02);font-size:7px}.lp-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.lp-kpi{min-height:108px;padding:13px;border:1px solid rgba(119,142,201,.12);border-radius:12px;background:linear-gradient(145deg,rgba(19,29,52,.88),rgba(14,22,40,.78))}.lp-kpi-head{display:flex;justify-content:space-between;gap:5px;color:#8894ae;font-size:6px}.lp-kpi-head b{font-size:6px}.lp-kpi.purple b{color:#9f8bff}.lp-kpi.blue b{color:#63baff}.lp-kpi.green b{color:#58d6ae}.lp-kpi.red b{color:#ff778b}.lp-kpi>strong{display:block;margin:10px 0 8px;font:800 24px Manrope,sans-serif}.lp-sparkline{display:flex;align-items:flex-end;gap:3px;height:22px}.lp-sparkline i{display:block;width:14%;border-radius:4px 4px 1px 1px;background:currentColor;opacity:.5}.lp-sparkline i:nth-child(1){height:35%}.lp-sparkline i:nth-child(2){height:62%}.lp-sparkline i:nth-child(3){height:46%}.lp-sparkline i:nth-child(4){height:78%}.lp-sparkline i:nth-child(5){height:58%}.lp-sparkline i:nth-child(6){height:88%}.lp-kpi.purple .lp-sparkline{color:#8e6cff}.lp-kpi.blue .lp-sparkline{color:#429fea}.lp-kpi.green .lp-sparkline{color:#42c995}.lp-kpi.red .lp-sparkline{color:#ee5e78}.lp-dash-lower{display:grid;grid-template-columns:1.55fr .8fr;gap:10px;margin-top:12px}.lp-recent-card,.lp-volume-card{min-height:160px;padding:13px;border:1px solid rgba(119,142,201,.12);border-radius:12px;background:rgba(13,21,39,.75)}.lp-card-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.lp-card-heading strong{font-size:8px}.lp-card-heading span{color:#6f8ce6;font-size:6px}.lp-ticket-preview{display:grid;grid-template-columns:25px 1fr auto;align-items:center;gap:9px;min-height:38px;border-top:1px solid rgba(120,140,198,.08)}.lp-ticket-preview>span{display:grid;width:24px;height:24px;place-items:center;border-radius:7px;font-size:8px}.lp-ticket-preview>span.violet{color:#c0afff;background:rgba(132,91,255,.18)}.lp-ticket-preview>span.blue{color:#87c4ff;background:rgba(61,151,239,.17)}.lp-ticket-preview>span.green{color:#89e1bd;background:rgba(55,190,141,.17)}.lp-ticket-preview strong,.lp-ticket-preview small{display:block}.lp-ticket-preview strong{font-size:7px}.lp-ticket-preview small{margin-top:2px;color:#67758e;font-size:5.5px}.lp-ticket-preview>b{padding:5px 7px;border-radius:999px;font-size:5px}.lp-ticket-preview>b.open{color:#b6a7ff;background:rgba(128,95,255,.12)}.lp-ticket-preview>b.progress{color:#77bfff;background:rgba(47,142,235,.12)}.lp-ticket-preview>b.resolved{color:#7bdbb3;background:rgba(50,189,134,.12)}.lp-bars{display:flex;align-items:flex-end;justify-content:space-between;gap:5px;height:92px;padding:8px 5px 0}.lp-bars i{width:11%;height:var(--h);border-radius:4px 4px 1px 1px;background:linear-gradient(180deg,#8a5cff,#526cff);box-shadow:0 0 14px rgba(113,85,255,.17)}.lp-bar-labels{display:flex;justify-content:space-between;color:#56627a;font-size:5px;padding:0 3px}.lp-float-card{position:absolute;z-index:5;display:flex;align-items:center;gap:10px;min-width:178px;padding:11px 12px;border:1px solid rgba(123,150,222,.24);border-radius:14px;background:linear-gradient(135deg,rgba(19,31,59,.94),rgba(25,24,62,.93));box-shadow:0 20px 50px rgba(0,0,0,.35);backdrop-filter:blur(14px);animation:lpCardFloat 6s ease-in-out infinite}.lp-float-lambda{left:4%;top:20px}.lp-float-auth{right:-3%;top:40px;animation-delay:-2s}.lp-float-uptime{left:2%;bottom:24px;animation-delay:-4s}.lp-float-icon{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;font-weight:900}.lp-float-icon.lambda{color:#ffa34e;background:rgba(255,139,46,.1);font-size:20px}.lp-float-icon.shield{color:#8fd2ff;background:rgba(54,154,255,.1)}.lp-float-icon.cloud{color:#9fc1ff;background:rgba(73,113,237,.12)}.lp-float-card small,.lp-float-card strong{display:block}.lp-float-card small{color:#7b88a5;font-size:5px;font-weight:900;letter-spacing:1.1px}.lp-float-card strong{margin-top:4px;font-size:7px}
.lp-capability-strip{position:relative;z-index:4;display:grid;grid-template-columns:repeat(4,1fr);width:min(1400px,calc(100% - 56px));margin:6px auto 0;padding:24px 0;border-top:1px solid var(--lp-line);border-bottom:1px solid var(--lp-line)}.lp-capability-strip article{display:grid;grid-template-columns:48px 1fr;gap:14px;align-items:center;padding:0 24px;border-right:1px solid rgba(132,153,209,.12)}.lp-capability-strip article:last-child{border-right:0}.lp-cap-icon{display:grid;width:48px;height:48px;place-items:center;border:1px solid rgba(132,132,255,.2);border-radius:14px;color:#a694ff;background:linear-gradient(145deg,rgba(91,76,212,.16),rgba(28,42,79,.2));font-size:18px}.lp-capability-strip strong{display:block;font-size:11px}.lp-capability-strip p{margin:6px 0 0;color:#72809a;font-size:9px;line-height:1.45}.lp-metrics{display:grid;grid-template-columns:repeat(4,1fr);width:min(1400px,calc(100% - 56px));margin:22px auto 0;border:1px solid rgba(127,150,213,.16);border-radius:18px;background:rgba(10,16,30,.55);overflow:hidden}.lp-metrics div{display:grid;grid-template-columns:36px auto 1fr;align-items:center;gap:10px;min-height:76px;padding:0 25px;border-right:1px solid rgba(127,150,213,.12)}.lp-metrics div:last-child{border-right:0}.lp-metrics span{color:#8b7dff;font-size:20px}.lp-metrics strong{font:800 22px Manrope,sans-serif}.lp-metrics small{color:#74809a;font-size:8px}.lp-section{width:min(1400px,calc(100% - 56px));margin:0 auto;padding:120px 0}.lp-section-heading{max-width:720px;margin:0 auto 52px;text-align:center}.lp-section-heading>span{color:#8174df;font-size:8px;font-weight:900;letter-spacing:2px}.lp-section-heading h2{margin:13px 0 10px;font:800 clamp(32px,4vw,52px)/1.03 Manrope,sans-serif;letter-spacing:-2px}.lp-section-heading p{margin:0;color:#7f8aa2;font-size:13px;line-height:1.7}.lp-workflow-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.lp-workflow-grid article{position:relative;min-height:195px;padding:26px;border:1px solid rgba(126,148,211,.14);border-radius:20px;background:linear-gradient(145deg,rgba(15,23,42,.82),rgba(9,15,29,.68));overflow:hidden}.lp-workflow-grid article:after{content:"";position:absolute;right:-50px;bottom:-70px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(109,81,255,.15),transparent 70%)}.lp-workflow-grid b{display:grid;width:42px;height:42px;place-items:center;border:1px solid rgba(134,117,255,.2);border-radius:12px;color:#9b8cff;background:rgba(105,83,241,.08);font-size:9px}.lp-workflow-grid strong{display:block;margin-top:28px;font-size:14px}.lp-workflow-grid p{margin:9px 0 0;color:#74809a;font-size:10px;line-height:1.65}.lp-security{display:flex;align-items:center;justify-content:space-between;gap:44px;width:min(1400px,calc(100% - 56px));margin:0 auto 80px;padding:35px 38px;border:1px solid rgba(85,210,164,.15);border-radius:22px;background:linear-gradient(115deg,rgba(40,145,112,.07),rgba(20,23,52,.14))}.lp-security-copy{display:flex;align-items:flex-start;gap:18px;max-width:930px}.lp-security-icon{display:grid;flex:0 0 50px;width:50px;height:50px;place-items:center;border-radius:14px;color:#78ddb8;background:rgba(65,188,143,.09);font-weight:900}.lp-security-copy small{color:#62aa8f;font-size:7px;font-weight:900;letter-spacing:1.7px}.lp-security-copy h2{margin:8px 0 9px;font:800 25px Manrope,sans-serif}.lp-security-copy p{margin:0;color:#7e8b9f;font-size:10px;line-height:1.65}.lp-outline-btn{display:inline-flex;align-items:center;gap:18px;flex:0 0 auto;min-height:44px;padding:0 16px;border:1px solid rgba(128,148,202,.17);border-radius:12px;color:#dce2f2;background:rgba(255,255,255,.025);text-decoration:none;font-size:9px;font-weight:800}.lp-outline-btn span{color:#8d7cff;font-size:16px}.lp-architecture{width:min(1400px,calc(100% - 56px));margin:0 auto;padding:70px 0 95px;border-top:1px solid var(--lp-line)}.lp-section-heading.compact{margin-bottom:36px}.lp-architecture-flow{display:grid;grid-template-columns:repeat(9,auto);align-items:center;justify-content:center;gap:14px}.lp-architecture-flow div{min-width:135px;padding:18px 20px;border:1px solid rgba(126,148,211,.14);border-radius:14px;background:rgba(12,19,34,.62);text-align:center}.lp-architecture-flow b,.lp-architecture-flow span{display:block}.lp-architecture-flow b{font-size:10px}.lp-architecture-flow span{margin-top:5px;color:#68758e;font-size:7px}.lp-architecture-flow i{color:#6259aa;font-style:normal}.lp-footer{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;width:min(1400px,calc(100% - 56px));margin:0 auto;padding:30px 0 42px;border-top:1px solid var(--lp-line);color:#66738c;font-size:8px}.lp-footer .lp-brand{justify-self:start}.lp-footer p{margin:0}.lp-footer>span{justify-self:end}
@keyframes lpPulse{50%{opacity:.52;transform:scale(.88)}}@keyframes lpDashboardFloat{50%{transform:rotateY(-4deg) rotateX(.5deg) translateY(-9px)}}@keyframes lpCardFloat{50%{transform:translateY(-8px)}}
@media(max-width:1180px){.lp-nav{grid-template-columns:1fr auto}.lp-nav-links{display:none}.lp-hero{grid-template-columns:1fr;padding-top:80px}.lp-hero-copy{max-width:800px}.lp-product-stage{min-height:610px}.lp-dashboard{right:4%;width:92%}.lp-capability-strip{grid-template-columns:1fr 1fr}.lp-capability-strip article:nth-child(2){border-right:0}.lp-capability-strip article{padding:20px 24px;border-bottom:1px solid rgba(132,153,209,.1)}.lp-workflow-grid{grid-template-columns:1fr 1fr}.lp-architecture-flow{grid-template-columns:1fr;max-width:580px;margin:auto}.lp-architecture-flow i{transform:rotate(90deg);justify-self:center}}
@media(max-width:760px){.lp-nav-wrap{padding:12px 14px 0}.lp-nav{grid-template-columns:1fr auto;min-height:64px;padding:0 12px}.lp-brand-copy strong{font-size:16px}.lp-brand-copy small{font-size:6px}.lp-nav-signin{display:none}.lp-nav-primary{padding:0 13px}.lp-hero{width:calc(100% - 28px);min-height:auto;padding:58px 0 40px;gap:30px}.lp-hero h1{font-size:clamp(48px,14vw,70px);letter-spacing:-3.8px}.lp-hero-lead{font-size:13px}.lp-hero-actions{grid-template-columns:1fr}.lp-trust-row{gap:10px}.lp-product-stage{min-height:410px}.lp-dashboard{top:42px;right:0;width:100%;min-height:350px;transform:none;animation:none}.lp-dashboard-top{grid-template-columns:1fr 1fr;padding:0 12px}.lp-dashboard-search{display:none}.lp-dashboard-body{grid-template-columns:72px 1fr;min-height:300px}.lp-mini-nav{padding:12px 6px}.lp-mini-nav button{justify-content:center;padding:0;font-size:0}.lp-mini-nav button span{font-size:10px}.lp-dashboard-main{padding:14px}.lp-dash-heading span,.lp-date-pill{display:none}.lp-dash-heading h2{font-size:14px}.lp-kpi-grid{grid-template-columns:1fr 1fr}.lp-kpi{min-height:84px}.lp-kpi:nth-child(4){display:none}.lp-dash-lower{grid-template-columns:1fr}.lp-volume-card{display:none}.lp-float-card{display:none}.lp-capability-strip,.lp-metrics,.lp-section,.lp-security,.lp-architecture,.lp-footer{width:calc(100% - 28px)}.lp-capability-strip{grid-template-columns:1fr}.lp-capability-strip article{border-right:0}.lp-metrics{grid-template-columns:1fr 1fr}.lp-metrics div{border-bottom:1px solid rgba(127,150,213,.12)}.lp-metrics div:nth-child(2){border-right:0}.lp-metrics div{grid-template-columns:28px auto 1fr;padding:0 15px}.lp-section{padding:85px 0}.lp-workflow-grid{grid-template-columns:1fr}.lp-security{align-items:flex-start;flex-direction:column;padding:28px}.lp-security-copy{flex-direction:column}.lp-footer{grid-template-columns:1fr;justify-items:center;gap:17px;text-align:center}.lp-footer .lp-brand,.lp-footer>span{justify-self:center}}
@media(max-width:480px){.lp-nav-primary{font-size:0}.lp-nav-primary span{font-size:18px}.lp-hero h1{font-size:47px}.lp-role-card{grid-template-columns:40px 1fr auto}.lp-role-icon{width:40px;height:40px}.lp-product-stage{min-height:350px}.lp-dashboard-top{grid-template-columns:1fr auto}.lp-agent-chip div{display:none}.lp-dashboard-body{grid-template-columns:52px 1fr}.lp-kpi-grid{gap:6px}.lp-kpi{padding:9px}.lp-kpi-head b{display:none}.lp-dash-lower{display:none}.lp-dashboard{min-height:300px}.lp-capability-strip article{grid-template-columns:42px 1fr;padding:17px 10px}.lp-cap-icon{width:42px;height:42px}.lp-metrics{grid-template-columns:1fr}.lp-metrics div{border-right:0}.lp-security-copy h2{font-size:21px}}
@media(prefers-reduced-motion:reduce){.lp-status-dot,.lp-dashboard,.lp-float-card{animation:none!important}.lp-role-card,.lp-nav-primary,.lp-nav-signin{transition:none!important}}
</style>
