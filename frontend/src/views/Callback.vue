<template>
  <main class="callback-shell">
    <div class="callback-glow"></div>
    <section class="callback-card">
      <div class="brand-mark">S</div>

      <div v-if="!failed && !mismatch" class="loader"><span></span><span></span><span></span></div>
      <div v-else-if="mismatch" class="role-icon">↔</div>
      <div v-else class="failed-icon">!</div>

      <p class="eyebrow">SUPPORTLY · ROLE VERIFICATION</p>
      <h1>{{ status }}</h1>
      <p class="detail">{{ detail }}</p>

      <div v-if="mismatch" class="role-result">
        <span class="label">SIGNED-IN ROLE</span>
        <strong>{{ actualRole }}</strong>
      </div>

      <div v-if="mismatch" class="action-stack">
        <button class="primary-button" @click="continueWithActualRole">
          Continue to {{ actualRole }} workspace
        </button>
        <button class="secondary-button" @click="switchAccount">
          Sign in with a different {{ expectedRole }} account
        </button>
        <button class="link-button" @click="goHome">Back to landing page</button>
      </div>

      <button v-else-if="failed" class="back-button" @click="goBack">{{ backLabel }}</button>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  clearExpectedRole,
  clearStoredUser,
  getExpectedRole,
  handleSigninCallback,
  roleFromProfile
} from '../auth/cognito'
import { useAuth } from '../auth/useAuth'

const router = useRouter()
const auth = useAuth()

const status = ref('Finishing sign-in…')
const detail = ref('Verifying your Cognito session and workspace role.')
const failed = ref(false)
const mismatch = ref(false)
const actualRole = ref('')
const expectedRole = ref('')
const backPath = ref('/login')
const backLabel = ref('Back to sign in')

function workspaceFor(role) {
  return role === 'Agent' ? '/agent-dashboard' : '/tickets'
}

function goBack() {
  router.replace(backPath.value)
}

function goHome() {
  clearExpectedRole()
  router.replace('/')
}

function continueWithActualRole() {
  clearExpectedRole()
  router.replace(workspaceFor(actualRole.value))
}

async function switchAccount() {
  await clearStoredUser().catch(() => {})
  auth.setUserFromCallback(null)
  const target = expectedRole.value === 'Agent' ? '/agent-login' : '/customer-login'
  clearExpectedRole()
  router.replace(target)
}

onMounted(async () => {
  expectedRole.value = getExpectedRole()

  if (expectedRole.value === 'Agent') {
    backPath.value = '/agent-login'
    backLabel.value = 'Back to Agent sign in'
  } else if (expectedRole.value === 'Customer') {
    backPath.value = '/customer-login'
    backLabel.value = 'Back to Customer sign in'
  }

  try {
    const user = await handleSigninCallback()
    auth.setUserFromCallback(user)
    actualRole.value = roleFromProfile(user.profile || {})

    if (expectedRole.value && actualRole.value !== expectedRole.value) {
      mismatch.value = true
      status.value = `You're signed in as ${actualRole.value}`
      detail.value = `You opened the ${expectedRole.value} portal, but this Cognito account belongs to the ${actualRole.value} workspace. Choose the correct workspace or sign in with a different account.`
      return
    }

    clearExpectedRole()
    status.value = `${actualRole.value} sign-in verified`
    detail.value = actualRole.value === 'Agent' ? 'Opening your Agent operations dashboard…' : 'Opening your Customer ticket workspace…'
    setTimeout(() => router.replace(workspaceFor(actualRole.value)), 450)
  } catch (err) {
    failed.value = true
    status.value = 'Sign-in failed'
    detail.value = err.message || 'Could not complete sign-in. Please try again.'
  }
})
</script>

<style scoped>
.callback-shell{position:relative;display:grid;place-items:center;min-height:100vh;padding:24px;overflow:hidden;background:#090b12;color:#f6f6fb}.callback-shell:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(115,89,242,.16),transparent 34%),linear-gradient(145deg,#0a0c14,#0d1018)}.callback-glow{position:absolute;width:420px;height:420px;border-radius:50%;background:rgba(126,105,255,.07);filter:blur(80px)}.callback-card{position:relative;z-index:1;width:min(490px,100%);padding:42px;text-align:center;border:1px solid rgba(255,255,255,.08);border-radius:28px;background:rgba(21,23,34,.93);box-shadow:0 30px 80px rgba(0,0,0,.38);backdrop-filter:blur(20px)}.brand-mark{display:grid;place-items:center;width:46px;height:46px;margin:0 auto 25px;border-radius:14px;background:linear-gradient(145deg,#9b8cff,#6d56ee);font:800 21px/1 Manrope,sans-serif;box-shadow:0 12px 30px rgba(108,82,230,.22)}.loader{display:flex;justify-content:center;gap:6px;margin:4px 0 22px}.loader span{width:7px;height:7px;border-radius:50%;background:#9585ff;animation:pulse 1s infinite ease-in-out}.loader span:nth-child(2){animation-delay:.15s}.loader span:nth-child(3){animation-delay:.3s}@keyframes pulse{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-5px)}}.failed-icon,.role-icon{display:grid;place-items:center;width:42px;height:42px;margin:0 auto 22px;border-radius:12px;font-weight:900}.failed-icon{color:#ff9aa4;background:rgba(255,93,108,.1)}.role-icon{color:#b3a5ff;background:rgba(137,108,255,.1);font-size:18px}.eyebrow{margin:0;color:#8176c3;font-size:9px;font-weight:800;letter-spacing:1.7px}.callback-card h1{margin:14px 0 9px;font:800 29px/1.15 Manrope,sans-serif}.detail{margin:0;color:#858ca3;font-size:12px;line-height:1.7}.role-result{margin:22px 0 0;padding:13px 15px;border:1px solid rgba(159,137,255,.14);border-radius:13px;background:rgba(129,96,236,.055)}.role-result .label{display:block;color:#716a8e;font-size:7px;font-weight:900;letter-spacing:1.4px}.role-result strong{display:block;margin-top:5px;color:#d8d1ff;font-size:14px}.action-stack{display:grid;gap:9px;margin-top:18px}.primary-button,.secondary-button,.back-button{width:100%;min-height:48px;border-radius:14px;font-weight:800}.primary-button{border:0;color:white;background:linear-gradient(135deg,#745ff1,#8d79ff);box-shadow:0 12px 28px rgba(105,82,220,.2)}.secondary-button{border:1px solid rgba(255,255,255,.09);color:#c7cbd8;background:rgba(255,255,255,.035)}.link-button{min-height:36px;border:0;color:#777f94;background:transparent;font-size:10px;font-weight:800}.primary-button:hover,.secondary-button:hover,.back-button:hover{filter:brightness(1.07)}.link-button:hover{color:#fff}.back-button{margin-top:24px;border:0;color:white;background:linear-gradient(135deg,#745ff1,#8d79ff)}
</style>
