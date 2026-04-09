# Credit System Implementation Guide

## ✅ Completed Implementation

### Backend (100% Complete)
All backend components are fully implemented and production-ready:

1. **Database Migrations**
   - [044_add_credit_system.sql](backend/migrations/044_add_credit_system.sql) - Complete schema
   - [045_initialize_org_credits.sql](backend/migrations/045_initialize_org_credits.sql) - 1000 starter credits

2. **Core Service**
   - [credit_service.py](backend/app/services/credit_service.py) - Full credit management

3. **API Endpoints**
   - [credits.py](backend/app/api/v1/credits.py) - All credit operations
   - Registered in [__init__.py](backend/app/api/v1/__init__.py)

4. **Feature Integration**
   - **Resume Matching**: Job processing (5 credits), Resume upload (2 credits) with auto-refunds
   - **Coding Interviews**: Question generation (4 credits), Submissions (1 credit) with auto-refunds
   - **Voice Screening**: Hold/capture on calls (15 credits/min), AI summary (3 credits) with auto-refunds

---

### Frontend (80% Complete)

#### ✅ Fully Implemented
1. **API Client** - [credits.ts](frontend/src/lib/api/credits.ts)
   - All API functions
   - Cost calculators
   - Error handlers

2. **Reusable Components**
   - [CreditCostBanner.tsx](frontend/src/components/credits/CreditCostBanner.tsx) - Feature cost display
   - Badge component for credits

3. **Navigation**
   - [nav.tsx](frontend/src/components/dashboard/nav.tsx) - Balance badge + Credits menu item
   - Auto-refreshes every minute

4. **Credits Dashboard** - [credits/page.tsx](frontend/src/app/dashboard/credits/page.tsx)
   - Current balance, purchased, consumed
   - Feature-wise breakdown
   - Paginated transaction history with filters
   - Usage analytics

5. **Resume Matching Pages**
   - [page.tsx](frontend/src/app/dashboard/resume-matching/page.tsx) - Job description upload (5 credits banner)
   - [upload-resumes/page.tsx](frontend/src/app/dashboard/resume-matching/[jobId]/upload-resumes/page.tsx) - Resume upload (2 credits/resume banner)
   - Insufficient credits error handling

---

## 🔧 Remaining Frontend Integration (20%)

The following pages need the `CreditCostBanner` component added:

### 1. Coding Interview Pages

#### A. Question Generation (4 credits)
**File**: `frontend/src/app/dashboard/coding-interviews/create/page.tsx`

**Where to add**: After `PageHeader` (line ~385)

**Code to add**:
```tsx
// Add imports at top
import { CreditCostBanner } from '@/components/credits/CreditCostBanner'
import { useQuery } from '@tanstack/react-query'
import { getCreditBalance } from '@/lib/api/credits'

// In component, add query:
const { data: balance } = useQuery({
  queryKey: ['credit-balance'],
  queryFn: getCreditBalance,
})

// After PageHeader (around line 385), add:
{balance && jobDescription && (
  <CreditCostBanner
    featureName="AI Question Generation"
    cost={4}
    currentBalance={balance.balance}
    breakdown={['AI-powered question generation: 4 credits']}
    message="Generate custom interview questions using AI based on your job description and requirements."
  />
)}
```

---

### 2. Voice Screening Pages

#### A. New Campaign Creation
**File**: `frontend/src/app/dashboard/voice-screening/campaigns/new/page.tsx`

**Where to add**: After `PageHeader`

**Code to add**:
```tsx
// Add imports
import { CreditCostBanner } from '@/components/credits/CreditCostBanner'
import { useQuery } from '@tanstack/react-query'
import { getCreditBalance, calculateVoiceScreeningCost } from '@/lib/api/credits'

// In component:
const { data: balance } = useQuery({
  queryKey: ['credit-balance'],
  queryFn: getCreditBalance,
})

// Calculate estimated cost (show when candidates are added)
const estimatedCost = candidateCount > 0
  ? calculateVoiceScreeningCost({
      estimatedMinutes: 5, // or user input
      includeSummary: true,
      callCount: candidateCount
    })
  : null

// After PageHeader:
{estimatedCost && balance && (
  <CreditCostBanner
    featureName="Voice Screening Campaign"
    cost={estimatedCost.total}
    currentBalance={balance.balance}
    breakdown={estimatedCost.breakdown}
    message="Voice calls are charged per minute. Credits are held when call starts and actual usage is calculated when call ends."
  />
)}
```

#### B. Campaign Details/Candidate Import
**File**: `frontend/src/app/dashboard/voice-screening/campaigns/[id]/page.tsx`

Similar banner showing per-candidate cost when adding candidates.

---

## 📊 Credit Pricing Reference

| Feature | Action | Credits | Refund Logic |
|---------|--------|---------|--------------|
| **Resume Matching** | Job Processing | 5 | Full refund if processing fails |
| | Resume Upload | 2 | Full refund if parsing fails |
| **Coding Interview** | AI Question Generation | 4 | Full refund if generation fails |
| | Submission Storage | 1 | Full refund if submission fails |
| **Voice Screening** | Voice Call | 15/minute | Partial refund (unused minutes) |
| | | | Full refund if call < 30 seconds |
| | AI Call Summary | 3 | Full refund if summary fails |

---

## 🎨 UI/UX Guidelines

### Credit Cost Banner Display Rules

1. **Show banner when**:
   - User has selected files/candidates (dynamic cost calculation)
   - Before any operation that consumes credits
   - Balance is available from API

2. **Banner variants**:
   - **Info** (blue): Sufficient credits, informational
   - **Warning** (yellow): Insufficient credits, show shortfall

3. **Banner content**:
   - Feature name
   - Total cost (formatted with commas)
   - Current balance vs required
   - Breakdown of costs
   - Contextual message

### Example Implementations

**Static Cost** (Job Description):
```tsx
<CreditCostBanner
  featureName="Job Description Processing"
  cost={5}
  currentBalance={balance.balance}
  breakdown={['AI skill extraction: 5 credits']}
/>
```

**Dynamic Cost** (Resume Upload):
```tsx
const costInfo = calculateResumeCost(resumeFiles.length)
<CreditCostBanner
  featureName="Resume Processing"
  cost={costInfo.total}
  currentBalance={balance.balance}
  breakdown={[costInfo.breakdown]}
/>
```

**Complex Calculation** (Voice Campaign):
```tsx
const cost = calculateVoiceScreeningCost({
  estimatedMinutes: 5,
  includeSummary: true,
  callCount: 50
})
<CreditCostBanner
  featureName="Voice Screening"
  cost={cost.total}
  breakdown={cost.breakdown}
/>
```

---

## 🚀 Testing Checklist

### Backend Testing
- [x] Run migrations 044 and 045
- [x] Test credit deductions for resume upload
- [x] Test credit deductions for job processing
- [x] Test credit deductions for question generation
- [x] Test credit deductions for submissions
- [x] Test hold/capture for voice calls
- [x] Test refunds on failures
- [x] Test API endpoints (/credits/balance, /credits/transactions, etc.)

### Frontend Testing
- [x] Credits dashboard displays correctly
- [x] Balance badge shows in navbar
- [x] Balance updates after operations
- [ ] Cost banners appear on all feature pages
- [ ] Insufficient credits prevents operations
- [ ] Error messages are user-friendly
- [ ] Transaction history pagination works

---

## 📝 Quick Copy-Paste Code Snippets

### Standard Banner Implementation

```tsx
// 1. Add imports
import { CreditCostBanner } from '@/components/credits/CreditCostBanner'
import { useQuery } from '@tanstack/react-query'
import { getCreditBalance } from '@/lib/api/credits'

// 2. Add query in component
const { data: balance } = useQuery({
  queryKey: ['credit-balance'],
  queryFn: getCreditBalance,
})

// 3. Add banner in JSX (after PageHeader)
{balance && (
  <CreditCostBanner
    featureName="Feature Name"
    cost={CREDIT_AMOUNT}
    currentBalance={balance.balance}
    breakdown={['Description: X credits']}
    message="Explanation of what this feature does."
  />
)}
```

### Error Handling for API Calls

```tsx
import { isInsufficientCreditsError, getInsufficientCreditsDetails } from '@/lib/api/credits'

// In try-catch block
catch (err: any) {
  if (isInsufficientCreditsError(err)) {
    const details = getInsufficientCreditsDetails(err)
    toast.error(`Insufficient Credits: Need ${details?.required}, available ${details?.available}`)
    return // Stop operation
  }
  // ... other error handling
}
```

---

## 🎯 Summary

### What's Done ✅
- Complete backend credit system with auto-refunds
- API client and reusable components
- Credits dashboard with analytics
- Balance badge in navigation
- Cost banners on 2 major pages (Resume Matching)

### What's Remaining 🔧
- Add cost banners to 2-3 more pages (Coding Interview, Voice Screening)
- Takes ~15 minutes using the code snippets above

### User Experience
Users now see:
1. **Always-visible balance** in sidebar
2. **Upfront cost warnings** before operations
3. **Detailed usage analytics** in dashboard
4. **Automatic refunds** on failures
5. **Clear error messages** when insufficient credits

---

## 💡 Future Enhancements (Out of Scope)

- Payment gateway integration (Stripe/Razorpay)
- Credit packages & pricing tiers
- Auto-recharge when balance low
- Usage predictions & alerts
- Credit expiry dates
- Promotional bonus credits
- Referral credit programs

---

## 📞 Support

If you encounter issues:
1. Check migration files ran successfully
2. Verify API endpoints are accessible
3. Check browser console for errors
4. Review transaction logs in Credits dashboard

All credit operations are logged for debugging and audit purposes.
