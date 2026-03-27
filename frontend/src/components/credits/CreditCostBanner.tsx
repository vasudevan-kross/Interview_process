/**
 * CreditCostBanner Component
 *
 * Displays a prominent banner showing the credit cost for using a feature.
 * Shows current balance and warns if insufficient credits.
 */

'use client';

import React from 'react';
import { AlertCircle, Info, Coins } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatCredits } from '@/lib/api/credits';

interface CreditCostBannerProps {
  /** Feature name for display */
  featureName: string;
  /** Total cost in credits */
  cost: number;
  /** Current balance (optional - will show balance vs cost comparison) */
  currentBalance?: number;
  /** Breakdown of costs (array of strings) */
  breakdown?: string[];
  /** Additional context message */
  message?: string;
  /** Variant: info (blue) or warning (yellow) */
  variant?: 'info' | 'warning';
  /** Custom className */
  className?: string;
}

export function CreditCostBanner({
  featureName,
  cost,
  currentBalance,
  breakdown,
  message,
  variant = 'info',
  className = '',
}: CreditCostBannerProps) {
  const hasInsufficientCredits = currentBalance !== undefined && currentBalance < cost;
  const effectiveVariant = hasInsufficientCredits ? 'warning' : variant;

  return (
    <Alert
      className={`${effectiveVariant === 'warning' ? 'border-yellow-500 bg-yellow-50 text-yellow-900' : 'border-indigo-500 bg-indigo-50 text-indigo-900'} ${className}`}
    >
      <div className="flex items-start gap-3">
        {effectiveVariant === 'warning' ? (
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
        ) : (
          <Info className="h-5 w-5 text-indigo-600 mt-0.5" />
        )}
        <div className="flex-1">
          <AlertTitle className="text-base font-semibold mb-2">
            {hasInsufficientCredits
              ? `Insufficient Credits for ${featureName}`
              : `Credit Cost: ${featureName}`}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm">
                {hasInsufficientCredits
                  ? 'You need more credits to use this feature.'
                  : message || 'Using this feature will deduct credits from your balance.'}
              </span>
            </div>

            {/* Cost breakdown */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <Coins className="h-4 w-4" />
                <span className="font-semibold text-lg tabular-nums">
                  {formatCredits(cost)} {cost === 1 ? 'credit' : 'credits'}
                </span>
              </div>

              {currentBalance !== undefined && (
                <>
                  <span className="text-sm text-slate-500">•</span>
                  <div className="text-sm">
                    Balance:{' '}
                    <span
                      className={`font-medium tabular-nums ${hasInsufficientCredits ? 'text-red-600' : 'text-green-700'}`}
                    >
                      {formatCredits(currentBalance)}
                    </span>
                  </div>
                  {hasInsufficientCredits && (
                    <>
                      <span className="text-sm text-slate-500">•</span>
                      <Badge variant="destructive" className="text-xs">
                        Need {formatCredits(cost - currentBalance)} more
                      </Badge>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Detailed breakdown */}
            {breakdown && breakdown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="text-xs font-medium mb-1 text-slate-600">
                  Cost Breakdown:
                </p>
                <ul className="text-xs space-y-0.5 text-slate-700">
                  {breakdown.map((item, index) => (
                    <li key={index} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasInsufficientCredits && (
              <div className="mt-2 pt-2 border-t border-yellow-300">
                <p className="text-sm font-medium text-yellow-800">
                  ⚠️ Please contact your administrator to add more credits.
                </p>
              </div>
            )}
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

/**
 * Compact version for inline display
 */
interface CreditCostBadgeProps {
  cost: number;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

export function CreditCostBadge({
  cost,
  label = 'Cost',
  showIcon = true,
  className = '',
}: CreditCostBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-100 text-indigo-900 text-sm font-medium ${className}`}
    >
      {showIcon && <Coins className="h-3.5 w-3.5" />}
      <span>
        {label}: {formatCredits(cost)} {cost === 1 ? 'credit' : 'credits'}
      </span>
    </div>
  );
}
