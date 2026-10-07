import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireEntitlement } from '../middleware/entitlement';
import { getSubscriptionState, getUsage } from '../services/entitlement.service';
import { isFeatureEnabledForBusiness } from '../services/featureFlag.service';
import { UnauthorizedError } from '../utils/errors';
import { AuthenticatedRequest, ApiResponse } from '../types';

/**
 * Subscription status for the logged-in tenant: drives the trial banner,
 * usage meter, and upgrade prompts in the frontend.
 */
const router = Router();

router.use(authenticate);
router.use(requireEntitlement);

router.get('/me', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const businessId = req.user?.businessId;
  if (!businessId) throw new UnauthorizedError('User has no workspace');

  const state = req.subscription ?? (await getSubscriptionState(businessId));
  if (!state) {
    res.status(404).json({ success: false, message: 'No subscription found' } as ApiResponse);
    return;
  }

  const aiResponsesUsed = await getUsage(state.subscriptionId, 'ai_responses');
  const daysRemaining = state.trialEndAt
    ? Math.max(0, Math.ceil((state.trialEndAt.getTime() - Date.now()) / 86_400_000))
    : null;

  res.json({
    success: true,
    data: {
      planCode: state.planCode,
      planName: state.planName,
      status: state.status,
      trialStartAt: state.trialStartAt,
      trialEndAt: state.trialEndAt,
      trialDaysRemaining: daysRemaining,
      limits: {
        aiResponsesPerPeriod: state.aiResponsesLimit,
        maxStaffUsers: state.maxStaffUsers,
        maxLocations: state.maxLocations,
      },
      usage: {
        aiResponses: aiResponsesUsed,
        periodStart: state.currentPeriodStart,
      },
      enforcement: {
        trialExpiry: await isFeatureEnabledForBusiness('trial_expiry_enforcement', businessId),
        aiQuota: await isFeatureEnabledForBusiness('ai_quota_enforcement', businessId),
      },
    },
  } as ApiResponse);
});

export default router;
