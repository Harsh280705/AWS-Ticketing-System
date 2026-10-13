<template>
  <main class="portal-shell customer-theme">
    <RouterLink class="back" to="/login">← Back to portal selection</RouterLink>
    <RouterLink class="home" to="/">Landing page</RouterLink>

    <section class="portal-card">
      <div class="portal-badge">C</div>
      <p class="eyebrow">CUSTOMER PORTAL</p>
      <h1>Welcome, customer</h1>
      <p class="lead">Sign in securely to create tickets, track progress, upload attachments and continue conversations with the support team.</p>

      <div v-if="sessionNotice" class="session-notice">
        <strong>Agent session detected</strong>
        <span>You are currently signed in as an Agent. Use a different Cognito account for the Customer portal.</span>
      </div>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="!configured" class="error">AWS Cognito is not configured. Run the frontend AWS configuration script, then restart Vite.</div>

      <button class="login-button" :disabled="busy || !configured" @click="loginCustomer">
        <span>{{ busy ? 'Opening secure sign-in…' : sessionNotice ? 'Switch to a Customer account' : 'Sign in as Customer' }}</span><b>→</b>
      </button>

      <div class="role-rule"><span>✓</span><p>This portal is for <strong>Customer</strong> accounts. Agent accounts are redirected to their own workspace.</p></div>
      <p class="powered">Protected by AWS Cognito</p>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { clearStoredUser, isAuthConfigured } from '../auth/cognito'
import { useAuth } from '../auth/useAuth'

const router = useRouter()
const auth = useAuth()
const configured = isAuthConfigured()
const busy = ref(false)
const error = ref('')
const sessionNotice = ref(false)

async function loginCustomer() {
  busy.value = true
  error.value = ''
  try {
    if (auth.authenticated.value && auth.role.value !== 'Customer') {
      await clearStoredUser()
      auth.setUserFromCallback(null)
    }
    await auth.login('Customer')
  } catch (e) {
    error.value = e.message || 'Could not start customer sign-in.'
    busy.value = false
  }
}

onMounted(async () => {
  await auth.init()
  if (!auth.authenticated.value) return
  if (auth.role.value === 'Customer') router.replace('/tickets')
  else sessionNotice.value = true
})
</script>

<style scoped>
.portal-shell{position:relative;display:grid;place-items:center;min-height:100vh;padding:80px 22px 30px;overflow:hidden;color:#f7fbff;background:#071019}.portal-shell:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(38,171,239,.18),transparent 34%),linear-gradient(145deg,#071019,#09131d)}.portal-shell:after{content:"";position:absolute;width:500px;height:500px;border-radius:50%;background:rgba(28,163,225,.07);filter:blur(70px);animation:float 8s ease-in-out infinite}@keyframes float{50%{transform:translateY(-20px)}}.back,.home{position:absolute;z-index:2;top:30px;color:#85a5ba;text-decoration:none;font-size:12px;font-weight:700}.back{left:34px}.home{right:34px}.back:hover,.home:hover{color:white}.portal-card{position:relative;z-index:1;width:min(500px,100%);padding:42px;border:1px solid rgba(94,197,245,.18);border-radius:29px;background:linear-gradient(145deg,rgba(18,34,47,.94),rgba(10,21,31,.95));box-shadow:0 36px 90px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.04);text-align:center;backdrop-filter:blur(22px)}.portal-badge{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 22px;border-radius:19px;background:linear-gradient(145deg,#2bb5ef,#187dca);box-shadow:0 16px 38px rgba(31,158,220,.28);font:900 25px Manrope,sans-serif}.eyebrow{margin:0;color:#5bbfeb;font-size:9px;font-weight:900;letter-spacing:2px}.portal-card h1{margin:13px 0 11px;font:800 34px/1.1 Manrope,sans-serif;letter-spacing:-1.3px}.lead{margin:0 auto 25px;color:#87a0b1;font-size:12px;line-height:1.75}.login-button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:58px;padding:0 19px;border:0;border-radius:16px;color:white;background:linear-gradient(135deg,#158dce,#27afe6);box-shadow:0 15px 36px rgba(22,142,202,.24);font-weight:900;transition:.22s}.login-button:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.06)}.login-button:disabled{opacity:.45}.login-button b{font-size:21px}.role-rule{display:flex;align-items:center;gap:9px;margin-top:16px;padding:12px 13px;border-radius:13px;background:rgba(52,173,222,.07);color:#86a6b8;text-align:left}.role-rule span{color:#60c9ec}.role-rule p{margin:0;font-size:10px;line-height:1.5}.role-rule strong{color:#c8e8f7}.powered{margin:22px 0 0;color:#556b79;font-size:9px;font-weight:800;letter-spacing:1.2px}.error,.session-notice{margin-bottom:14px;padding:12px;border-radius:12px;font-size:11px;line-height:1.5;text-align:left}.error{border:1px solid rgba(255,102,119,.2);background:rgba(255,83,102,.07);color:#e7a7ae}.session-notice{border:1px solid rgba(112,199,255,.18);background:rgba(71,169,225,.07);color:#9ac7df}.session-notice strong,.session-notice span{display:block}.session-notice strong{margin-bottom:4px;color:#c8eafa}@media(max-width:560px){.back{left:18px}.home{right:18px}.portal-card{padding:34px 22px}}
</style>
