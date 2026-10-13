<template>
  <main class="role-shell">
    <div class="aurora aurora-a"></div>
    <div class="aurora aurora-b"></div>
    <div class="mesh"></div>

    <RouterLink class="brand" to="/" aria-label="Supportly home">
      <span class="brand-mark">S</span>
      <span><strong>Supportly</strong><small>AWS TICKETING SYSTEM</small></span>
    </RouterLink>

    <RouterLink class="home-link" to="/">← Landing page</RouterLink>

    <section class="role-card">
      <div class="eyebrow">SECURE ROLE-BASED ACCESS</div>
      <h1>Choose your workspace</h1>
      <p class="subtitle">Customers and support agents use separate entry points. AWS Cognito verifies the account after sign-in and the token decides which workspace is allowed.</p>

      <div class="role-grid">
        <button class="role-option customer" @click="openCustomer">
          <span class="icon customer-icon">C</span>
          <span class="copy">
            <small>CUSTOMER PORTAL</small>
            <strong>Customer sign in</strong>
            <span>Create tickets, upload attachments, follow updates and reply to support conversations.</span>
          </span>
          <span class="go">→</span>
        </button>

        <button class="role-option agent" @click="openAgent">
          <span class="icon agent-icon">A</span>
          <span class="copy">
            <small>SUPPORT TEAM</small>
            <strong>Agent sign in</strong>
            <span>Review the queue, respond to customers and manage ticket status as an authorized Agent.</span>
          </span>
          <span class="go">→</span>
        </button>
      </div>

      <div class="security-note">
        <span>✓</span>
        <div><strong>Portal choice does not change permissions</strong><p>The signed-in user must still have the matching Cognito role. If the wrong account is used, you can switch accounts without getting stuck on an error screen.</p></div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { RouterLink, useRouter } from 'vue-router'
const router = useRouter()
function openCustomer() { router.push('/customer-login') }
function openAgent() { router.push('/agent-login') }
</script>

<style scoped>
.role-shell{position:relative;min-height:100vh;overflow:hidden;display:grid;place-items:center;padding:42px 5vw;background:#080a11;color:#f7f8fc;isolation:isolate}.role-shell:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 20% 18%,rgba(59,171,255,.14),transparent 30%),radial-gradient(circle at 80% 77%,rgba(139,92,246,.16),transparent 32%),linear-gradient(145deg,#080a11,#0d101a);z-index:-3}.mesh{position:absolute;inset:0;opacity:.18;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:50px 50px;z-index:-2}.aurora{position:absolute;border-radius:50%;filter:blur(60px);z-index:-1;animation:drift 9s ease-in-out infinite}.aurora-a{width:340px;height:340px;left:-100px;top:12%;background:rgba(42,178,255,.14)}.aurora-b{width:420px;height:420px;right:-140px;bottom:4%;background:rgba(129,87,255,.15);animation-delay:-4s}@keyframes drift{50%{transform:translateY(-22px) translateX(12px)}}.brand{position:absolute;left:5vw;top:34px;display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none}.brand-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:linear-gradient(145deg,#8f7cff,#6653e6);font:800 20px/1 Manrope,sans-serif;box-shadow:0 14px 35px rgba(105,82,231,.28)}.brand strong{display:block;font:800 16px/1 Manrope,sans-serif}.brand small{display:block;margin-top:5px;color:#71798e;font-size:8px;font-weight:800;letter-spacing:1.7px}.home-link{position:absolute;right:5vw;top:47px;color:#788197;text-decoration:none;font-size:10px;font-weight:800}.home-link:hover{color:#fff}.role-card{width:min(1020px,100%);margin-top:30px;padding:46px;border:1px solid rgba(255,255,255,.08);border-radius:30px;background:linear-gradient(145deg,rgba(25,28,41,.92),rgba(15,17,26,.94));box-shadow:0 35px 100px rgba(0,0,0,.4);backdrop-filter:blur(22px)}.eyebrow{color:#9387dc;font-size:10px;font-weight:900;letter-spacing:2px;text-align:center}.role-card h1{margin:14px 0 10px;text-align:center;font:800 clamp(34px,5vw,52px)/1 Manrope,sans-serif;letter-spacing:-2px}.subtitle{max-width:700px;margin:0 auto 34px;text-align:center;color:#8e96aa;font-size:14px;line-height:1.75}.role-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.role-option{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;min-height:210px;padding:28px;border-radius:23px;text-align:left;color:#fff;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);transition:.25s ease;cursor:pointer}.role-option:hover{transform:translateY(-6px);background:rgba(255,255,255,.045)}.role-option.customer:hover{border-color:rgba(67,190,255,.38);box-shadow:0 24px 55px rgba(31,143,206,.12)}.role-option.agent:hover{border-color:rgba(155,125,255,.38);box-shadow:0 24px 55px rgba(108,78,214,.13)}.icon{display:grid;place-items:center;width:56px;height:56px;border-radius:17px;font:900 21px/1 Manrope,sans-serif}.customer-icon{background:linear-gradient(145deg,#29a9e9,#1975c9);box-shadow:0 12px 30px rgba(34,153,218,.24)}.agent-icon{background:linear-gradient(145deg,#9b7fff,#6a50df);box-shadow:0 12px 30px rgba(111,80,222,.25)}.copy small{display:block;margin-bottom:7px;color:#7f879b;font-size:9px;font-weight:900;letter-spacing:1.5px}.copy strong{display:block;font:800 22px/1.15 Manrope,sans-serif}.copy>span{display:block;margin-top:10px;color:#858da2;font-size:12px;line-height:1.7}.go{font-size:26px;color:#8d95a9;transition:.2s}.role-option:hover .go{transform:translateX(5px);color:white}.security-note{display:flex;gap:12px;align-items:flex-start;margin-top:22px;padding:15px 17px;border:1px solid rgba(91,213,166,.14);border-radius:15px;background:rgba(68,190,144,.055);color:#97aa9e}.security-note>span{display:grid;place-items:center;flex:0 0 26px;width:26px;height:26px;border-radius:8px;background:rgba(72,206,156,.1);color:#6bd6a9;font-weight:900}.security-note strong{font-size:11px;color:#b4c8bb}.security-note p{margin:4px 0 0;font-size:10px;line-height:1.55}@media(max-width:760px){.role-shell{padding:100px 18px 28px}.brand{left:22px;top:24px}.home-link{right:22px;top:37px}.brand small{display:none}.role-card{padding:28px 20px}.role-grid{grid-template-columns:1fr}.role-option{min-height:165px;padding:21px}.copy strong{font-size:19px}.subtitle{font-size:12px}}
</style>
