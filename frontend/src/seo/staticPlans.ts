import type { Plan } from '@/types'

declare global {
  interface Window {
    __WAFLO_PLANS__?: Plan[] | null
  }
}

/**
 * Plans captured at build time so the pricing section can be rendered into the
 * prerendered HTML. At runtime the landing page fetches the same data from the
 * API, so the static copy can never drift from enforcement for long.
 */
let staticPlans: Plan[] | null = null

export function setStaticPlans(plans: Plan[] | null): void {
  staticPlans = plans
}

export function getStaticPlans(): Plan[] | null {
  if (staticPlans === null && typeof window !== 'undefined' && window.__WAFLO_PLANS__) {
    staticPlans = window.__WAFLO_PLANS__
  }
  return staticPlans
}
