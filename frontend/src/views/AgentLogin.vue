<template>
  <main class="portal-shell agent-theme">
    <RouterLink class="back" to="/login">← Back to portal selection</RouterLink>
    <RouterLink class="home" to="/">Landing page</RouterLink>

    <section class="portal-card">
      <div class="portal-badge">A</div>
      <p class="eyebrow">SUPPORT OPERATIONS</p>
      <h1>Agent access</h1>
      <p class="lead">Authorized support agents can review the queue, reply to customers and manage ticket status from the Agent workspace.</p>

      <div v-if="sessionNotice" class="session-notice">
        <strong>Customer session detected</strong>
        <span>You are currently signed in as a Customer. Use your separate Agent Cognito account here.</span>
      </div>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="!configured" class="error">AWS Cognito is not configured. Run the frontend AWS configuration script, then restart Vite.</div>

      <button class="login-button" :disabled="busy || !configured" @click="loginAgent">
        <span>{{ busy ? 'Opening secure sign-in…' : sessionNotice ? 'Switch to an Agent account' : 'Sign in as Agent' }}</span><b>→</b>
      </button>

      <div class="role-rule"><span>◆</span><p>This portal accepts only accounts whose verified Cognito group contains <strong>Agent</strong>.</p></div>
      <p class="powered">Protected by AWS Cognito · role verified after sign-in</p>
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

async function loginAgent() {
  busy.value = true
  error.value = ''
  try {
    if (auth.authenticated.value && auth.role.value !== 'Agent') {
      await clearStoredUser()
      auth.setUserFromCallback(null)
    }
    await auth.login('Agent')
  } catch (e) {
    error.value = e.message || 'Could not start agent sign-in.'
    busy.value = false
  }
}

onMounted(async () => {
  await auth.init()
  if (!auth.authenticated.value) return
  if (auth.role.value === 'Agent') router.replace('/agent-dashboard')
  else sessionNotice.value = true
})
</script>

<style scoped>
.portal-shell{position:relative;display:grid;place-items:center;min-height:100vh;padding:80px 22px 30px;overflow:hidden;color:#fbf9ff;background:#0d0917}.portal-shell:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(137,90,255,.2),transparent 34%),linear-gradient(145deg,#0b0812,#11101c)}.portal-shell:after{content:"";position:absolute;width:520px;height:520px;border-radius:50%;background:rgba(126,81,235,.08);filter:blur(70px);animation:float 8s ease-in-out infinite}@keyframes float{50%{transform:translateY(-20px)}}.back,.home{position:absolute;z-index:2;top:30px;color:#9b8fb8;text-decoration:none;font-size:12px;font-weight:700}.back{left:34px}.home{right:34px}.back:hover,.home:hover{color:white}.portal-card{position:relative;z-index:1;width:min(500px,100%);padding:42px;border:1px solid rgba(165,131,255,.18);border-radius:29px;background:linear-gradient(145deg,rgba(31,25,47,.95),rgba(18,15,29,.96));box-shadow:0 36px 90px rgba(0,0,0,.44),inset 0 1px rgba(255,255,255,.04);text-align:center;backdrop-filter:blur(22px)}.portal-badge{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 22px;border-radius:19px;background:linear-gradient(145deg,#a17cff,#654bdd);box-shadow:0 16px 38px rgba(104,72,218,.3);font:900 25px Manrope,sans-serif}.eyebrow{margin:0;color:#a28bff;font-size:9px;font-weight:900;letter-spacing:2px}.portal-card h1{margin:13px 0 11px;font:800 34px/1.1 Manrope,sans-serif;letter-spacing:-1.3px}.lead{margin:0 auto 25px;color:#9a90ad;font-size:12px;line-height:1.75}.login-button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:58px;padding:0 19px;border:0;border-radius:16px;color:white;background:linear-gradient(135deg,#6b50df,#9a76ff);box-shadow:0 15px 36px rgba(102,76,216,.27);font-weight:900;transition:.22s}.login-button:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.06)}.login-button:disabled{opacity:.45}.login-button b{font-size:21px}.role-rule{display:flex;align-items:center;gap:9px;margin-top:16px;padding:12px 13px;border-radius:13px;background:rgba(141,101,245,.08);color:#a198b2;text-align:left}.role-rule span{color:#ac91ff}.role-rule p{margin:0;font-size:10px;line-height:1.5}.role-rule strong{color:#d9ceff}.powered{margin:22px 0 0;color:#625a70;font-size:9px;font-weight:800;letter-spacing:1px}.error,.session-notice{margin-bottom:14px;padding:12px;border-radius:12px;font-size:11px;line-height:1.5;text-align:left}.error{border:1px solid rgba(255,102,119,.2);background:rgba(255,83,102,.07);color:#e7a7ae}.session-notice{border:1px solid rgba(168,136,255,.2);background:rgba(131,93,236,.075);color:#baace0}.session-notice strong,.session-notice span{display:block}.session-notice strong{margin-bottom:4px;color:#ddd4fb}@media(max-width:560px){.back{left:18px}.home{right:18px}.portal-card{padding:34px 22px}}
</style>
