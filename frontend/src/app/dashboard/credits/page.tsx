/**
 * Credits Dashboard Page
 *
 * Shows:
 * - Current balance
 * - Usage statistics
 * - Transaction history
 * - Feature-wise breakdown
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  FileText,
  Code,
  Phone,
  Calendar,
} from 'lucide-react';
import {
  getCreditBalance,
  getTransactionHistory,
  formatCredits,
  getFeatureDisplayName,
  getActionDisplayName,
  getTransactionTypeBadgeColor,
  type CreditTransaction,
} from '@/lib/api/credits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CreditsPage() {
  const [transactionType, setTransactionType] = useState<string>('all');
  const [featureFilter, setFeatureFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Fetch balance
  const {
    data: balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ['credit-balance'],
    queryFn: getCreditBalance,
  });

  // Fetch transactions
  const {
    data: transactionHistory,
    isLoading: transactionsLoading,
    refetch: refetchTransactions,
  } = useQuery({
    queryKey: ['credit-transactions', transactionType, featureFilter, page],
    queryFn: () =>
      getTransactionHistory({
        limit: pageSize,
        offset: page * pageSize,
        transaction_type:
          transactionType !== 'all' ? (transactionType as any) : undefined,
        feature: featureFilter !== 'all' ? featureFilter : undefined,
      }),
  });

  // Calculate feature-wise breakdown
  const featureBreakdown = React.useMemo(() => {
    if (!transactionHistory?.transactions) return [];

    const breakdown: Record<
      string,
      { feature: string; consumed: number; refunded: number }
    > = {};

    transactionHistory.transactions.forEach((tx) => {
      if (tx.feature) {
        if (!breakdown[tx.feature]) {
          breakdown[tx.feature] = { feature: tx.feature, consumed: 0, refunded: 0 };
        }
        if (tx.type === 'deduction') {
          breakdown[tx.feature].consumed += Math.abs(tx.amount);
        } else if (tx.type === 'refund') {
          breakdown[tx.feature].refunded += tx.amount;
        }
      }
    });

    return Object.values(breakdown).sort((a, b) => b.consumed - a.consumed);
  }, [transactionHistory]);

  const handleRefresh = () => {
    refetchBalance();
    refetchTransactions();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Credits</h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage your organization's credit balance and usage
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Current Balance */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-100">
              <Coins className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                Current Balance
              </p>
              {balanceLoading ? (
                <div className="h-8 w-24 bg-slate-200 animate-pulse rounded mt-1" />
              ) : (
                <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatCredits(balance?.balance || 0)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Total Purchased */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                Total Purchased
              </p>
              {balanceLoading ? (
                <div className="h-8 w-24 bg-slate-200 animate-pulse rounded mt-1" />
              ) : (
                <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatCredits(balance?.total_purchased || 0)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Total Consumed */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-100">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                Total Consumed
              </p>
              {balanceLoading ? (
                <div className="h-8 w-24 bg-slate-200 animate-pulse rounded mt-1" />
              ) : (
                <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatCredits(balance?.total_consumed || 0)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Usage Rate */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-100">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                Usage Rate
              </p>
              {balanceLoading ? (
                <div className="h-8 w-24 bg-slate-200 animate-pulse rounded mt-1" />
              ) : (
                <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">
                  {balance?.total_purchased
                    ? Math.round(
                        ((balance.total_consumed || 0) / balance.total_purchased) * 100
                      )
                    : 0}
                  %
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Breakdown */}
      {featureBreakdown.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Usage by Feature
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featureBreakdown.map((item) => {
              const icon =
                item.feature === 'resume_matching' ? (
                  <FileText className="h-5 w-5" />
                ) : item.feature === 'coding_interview' ? (
                  <Code className="h-5 w-5" />
                ) : (
                  <Phone className="h-5 w-5" />
                );

              return (
                <div
                  key={item.feature}
                  className="border border-slate-200 rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                      {icon}
                    </div>
                    <span className="font-medium text-sm text-slate-900">
                      {getFeatureDisplayName(item.feature)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Consumed:</span>
                      <span className="font-semibold text-red-600 tabular-nums">
                        {formatCredits(item.consumed)}
                      </span>
                    </div>
                    {item.refunded > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Refunded:</span>
                        <span className="font-semibold text-green-600 tabular-nums">
                          {formatCredits(item.refunded)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Transaction History
            </h2>
            <div className="flex items-center gap-3">
              {/* Feature Filter */}
              <Select value={featureFilter} onValueChange={setFeatureFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Features" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Features</SelectItem>
                  <SelectItem value="resume_matching">Resume Matching</SelectItem>
                  <SelectItem value="coding_interview">Coding Interview</SelectItem>
                  <SelectItem value="voice_screening">Voice Screening</SelectItem>
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="deduction">Deduction</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {transactionsLoading ? (
            <div className="p-8 text-center text-slate-500">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent" />
              <p className="mt-2 text-sm">Loading transactions...</p>
            </div>
          ) : !transactionHistory?.transactions?.length ? (
            <div className="p-8 text-center text-slate-500">
              <p className="text-sm">No transactions found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="w-[120px] text-right">Amount</TableHead>
                    <TableHead className="w-[120px] text-right">
                      Balance After
                    </TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionHistory.transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-slate-600">
                        {new Date(tx.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getTransactionTypeBadgeColor(tx.type)}
                          className="text-xs capitalize"
                        >
                          {tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {tx.feature ? getFeatureDisplayName(tx.feature) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {tx.action ? getActionDisplayName(tx.action) : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={`text-sm font-medium ${tx.type === 'deduction' ? 'text-red-600' : 'text-green-600'}`}
                        >
                          {tx.type === 'deduction' ? (
                            <span className="inline-flex items-center gap-1">
                              <ArrowDownRight className="h-3 w-3" />
                              {formatCredits(Math.abs(tx.amount))}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <ArrowUpRight className="h-3 w-3" />
                              {formatCredits(tx.amount)}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-slate-900 tabular-nums">
                        {formatCredits(tx.balance_after)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                        {tx.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {transactionHistory && transactionHistory.total > pageSize && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    Showing {page * pageSize + 1} to{' '}
                    {Math.min((page + 1) * pageSize, transactionHistory.total)} of{' '}
                    {transactionHistory.total} transactions
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={(page + 1) * pageSize >= transactionHistory.total}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
