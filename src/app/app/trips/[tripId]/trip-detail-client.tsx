"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { COMMON_CURRENCIES, EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/finance-options";
import { formatCurrency } from "@/lib/money";

type Member = {
  id: string;
  email: string;
  displayName: string | null;
  preferredSettlementCurrency: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string | null;
};

type TripData = {
  trip: {
    id: string;
    name: string;
    joinCode: string;
    description: string | null;
    defaultCurrency: string;
    simplifyTransfers: boolean;
    lockAfterSettlement: boolean;
  };
  membership: {
    id: string;
    role: "owner" | "admin" | "member";
  };
};

type Expense = {
  id: string;
  title: string;
  category: ExpenseCategory;
  notes: string | null;
  currency: string;
  amountCents: number;
  splitMode: "equal" | "percentage" | "exact" | "shares";
  occurredAt: string;
  createdByMemberId: string;
};

type DeletedExpense = Expense & {
  deletedAt: string;
  deletedByMemberId: string | null;
};

type ExpenseReceipt = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByMemberId: string;
  createdAt: string;
};

type ExpenseDetailResponse = {
  expense: Expense;
  payers: Array<{
    memberId: string;
    amountCents: number;
  }>;
  splits: Array<{
    memberId: string;
    amountCents: number | null;
    percentageBp: number | null;
    shares: number | null;
  }>;
  receipts: ExpenseReceipt[];
};

type Transfer = {
  fromMemberId: string;
  toMemberId: string;
  currency: string;
  amountCents: number;
};

type TransferFxQuote = {
  fromMemberId: string;
  toMemberId: string;
  sourceCurrency: string;
  sourceAmountCents: number;
  targetCurrency: string;
  targetAmountCents: number;
  rate: number;
  quotedAt: string;
  source: "frankfurter" | "open-er-api" | "identity";
};

type SettlementStatus = "pending" | "approved" | "rejected";

type SettlementReceipt = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByMemberId: string;
  createdAt: string;
};

type Balance = {
  memberId: string;
  currency: string;
  balanceCents: number;
};

type Settlement = {
  id: string;
  tripId: string;
  currency: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  paidAt: string;
  notes: string | null;
  status: SettlementStatus;
  reviewedByMemberId: string | null;
  reviewedAt: string | null;
  receipts?: SettlementReceipt[];
  createdByMemberId: string;
  createdAt: string;
};

type CurrencySummary = {
  currency: string;
  totalExpenseCents: number;
  youPaidCents: number;
  yourNetCents: number;
};

type MemberTripTotal = {
  memberId: string;
  currency: string;
  totalTripCents: number;
};

type MemberTripTotalApprox = {
  memberId: string;
  targetCurrency: string;
  totalApproxCents: number;
  approximateConversionCount: number;
  unconvertedCurrencyCount: number;
};

type CategoryCumulative = {
  currency: string;
  ranked: Array<{
    category: ExpenseCategory;
    spentCents: number;
    refundCents: number;
    netCents: number;
  }>;
  totalSpentCents: number;
  topSpentCents: number;
  totalNetCents: number;
  topNetCents: number;
  approximateConversionCount: number;
  unconvertedExpenseCount: number;
};

type OweDetailModal = {
  payerMemberId: string;
  receiverMemberId: string;
  displayCurrency: string;
  totalAmountCents: number;
  approximate: boolean;
  unresolvedCount: number;
  details: Array<{
    sourceCurrency: string;
    sourceAmountCents: number;
    targetCurrency: string;
    targetAmountCents: number | null;
    approximate: boolean;
    quotedAt: string | null;
    rate: number | null;
    conversionUnavailable: boolean;
  }>;
};

type CategoryBreakdownModal = {
  category: ExpenseCategory;
  spentCents: number;
  refundCents: number;
  netCents: number;
  currency: string;
  sharePercent: number;
};

type ReceiptPreviewModal = {
  src: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByMemberId: string;
  createdAt: string;
  contextLabel: string;
};

type EditablePayer = {
  memberId: string;
  amount: string;
};

type EditableSplit = {
  memberId: string;
  value: string;
};

type Props = {
  tripId: string;
};

type ViewTab = "overview" | "expenses" | "members" | "settings";

type ToastState = {
  tone: "success" | "info";
  message: string;
};

function toUserFriendlyErrorMessage(rawMessage: string, fallback: string) {
  const message = rawMessage.toLowerCase();

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Network issue detected. Please check your connection and try again.";
  }

  if (message.includes("unauthorized") || message.includes("jwt")) {
    return "Your session expired. Please sign in again.";
  }

  if (message.includes("frommemberid") || message.includes("tomemberid")) {
    return "Please choose different members for From and To.";
  }

  if (message.includes("does not belong to trip")) {
    return "One of the selected members is no longer part of this trip.";
  }

  if (message.includes("upload failed")) {
    return "Expense was saved, but receipt upload failed. Please try uploading the receipt again.";
  }

  if (message.includes("locked for")) {
    return "This trip is locked after settlements started, so this action is no longer allowed.";
  }

  if (message.includes("invalid payload") || message.includes("invalid")) {
    return "Some entered details are invalid. Please review and try again.";
  }

  if (message.includes("not found")) {
    return "We could not find that item. Please refresh and try again.";
  }

  return rawMessage || fallback;
}

function toUserFriendlyError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return toUserFriendlyErrorMessage(error.message, fallback);
  }

  return fallback;
}

function emptyPayer(): EditablePayer {
  return { memberId: "", amount: "" };
}

function emptySplit(): EditableSplit {
  return { memberId: "", value: "" };
}

function toDateTimeLocalInputValue(isoString: string) {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalInputValue(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function createIdempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatCategoryLabel(category: ExpenseCategory) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${sizeBytes} B`;
}

function transferKey(transfer: Transfer) {
  return `${transfer.fromMemberId}:${transfer.toMemberId}:${transfer.currency}:${transfer.amountCents}`;
}

function formatFxRate(rate: number) {
  if (rate >= 1000) {
    return rate.toFixed(2);
  }

  if (rate >= 1) {
    return rate.toFixed(4);
  }

  return rate.toFixed(6);
}

function isImageReceiptMimeType(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function TripDetailClient({ tripId }: Props) {
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deletedExpenses, setDeletedExpenses] = useState<DeletedExpense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [transferFx, setTransferFx] = useState<TransferFxQuote[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [currencySummaries, setCurrencySummaries] = useState<CurrencySummary[]>([]);
  const [memberTripTotals, setMemberTripTotals] = useState<MemberTripTotal[]>([]);
  const [memberTripTotalsApprox, setMemberTripTotalsApprox] = useState<MemberTripTotalApprox[]>([]);
  const [categoryCumulative, setCategoryCumulative] = useState<CategoryCumulative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [viewingExpenseId, setViewingExpenseId] = useState<string | null>(null);
  const [viewingExpenseDetail, setViewingExpenseDetail] = useState<ExpenseDetailResponse | null>(null);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState("USD");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("other");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseOccurredAt, setExpenseOccurredAt] = useState(() => new Date().toISOString());
  const [expenseSplitMode, setExpenseSplitMode] = useState<"equal" | "percentage" | "exact" | "shares">(
    "equal"
  );
  const [payers, setPayers] = useState<EditablePayer[]>([emptyPayer()]);
  const [equalSplitMemberIds, setEqualSplitMemberIds] = useState<string[]>([]);
  const [splitRows, setSplitRows] = useState<EditableSplit[]>([emptySplit()]);
  const [simplifyTransfers, setSimplifyTransfers] = useState(true);
  const [lockAfterSettlement, setLockAfterSettlement] = useState(false);
  const [settlementFrom, setSettlementFrom] = useState("");
  const [settlementTo, setSettlementTo] = useState("");
  const [settlementCurrency, setSettlementCurrency] = useState("USD");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementReceiptFileForRequest, setSettlementReceiptFileForRequest] = useState<File | null>(null);
  const [settlementReceiptFileByTransferKey, setSettlementReceiptFileByTransferKey] = useState<
    Record<string, File | null>
  >({});
  const [settlingTransferKey, setSettlingTransferKey] = useState<string | null>(null);
  const [isSettlingAll, setIsSettlingAll] = useState(false);
  const [receiptFileForExpense, setReceiptFileForExpense] = useState<File | null>(null);
  const [settlementSearch, setSettlementSearch] = useState("");
  const [settlementCurrencyFilter, setSettlementCurrencyFilter] = useState("");
  const [settlementMemberFilter, setSettlementMemberFilter] = useState("");
  const [settlementStartDate, setSettlementStartDate] = useState("");
  const [settlementEndDate, setSettlementEndDate] = useState("");
  const [undoingSettlement, setUndoingSettlement] = useState(false);
  const [settlementPage, setSettlementPage] = useState(1);
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [transferFromFilter, setTransferFromFilter] = useState("");
  const [transferToFilter, setTransferToFilter] = useState("");
  const [preferredSettlementCurrencyDraft, setPreferredSettlementCurrencyDraft] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<ExpenseCategory | "">("");
  const [expenseCurrencyFilter, setExpenseCurrencyFilter] = useState("");
  const [expenseSort, setExpenseSort] = useState<"newest" | "oldest" | "amountDesc" | "amountAsc">("newest");
  const [oweDetailModal, setOweDetailModal] = useState<OweDetailModal | null>(null);
  const [categoryBreakdownModal, setCategoryBreakdownModal] = useState<CategoryBreakdownModal | null>(null);
  const [receiptPreviewModal, setReceiptPreviewModal] = useState<ReceiptPreviewModal | null>(null);

  const memberName = useMemo(() => {
    const map = new Map<string, string>();

    for (const member of members) {
      map.set(member.id, member.displayName || member.email);
    }

    return map;
  }, [members]);

  const currentMember = useMemo(
    () => members.find((member) => member.id === tripData?.membership.id) ?? null,
    [members, tripData?.membership.id]
  );

  const transferFxByKey = useMemo(
    () =>
      new Map(
        transferFx.map((quote) => [
          `${quote.fromMemberId}:${quote.toMemberId}:${quote.sourceCurrency}:${quote.sourceAmountCents}`,
          quote,
        ])
      ),
    [transferFx]
  );

  const joinLink = useMemo(() => {
    if (!tripData?.trip.joinCode) {
      return "";
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
    return base ? `${base}/join?code=${tripData.trip.joinCode}` : `/join?code=${tripData.trip.joinCode}`;
  }, [tripData]);

  const browserTimeZone = useMemo(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return detected || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const exportCsvHref = useMemo(
    () => `/api/trips/${tripId}/export.csv?tz=${encodeURIComponent(browserTimeZone)}`,
    [browserTimeZone, tripId]
  );

  const settlementCurrencies = useMemo(
    () => [...new Set(settlements.map((settlement) => settlement.currency))].sort((a, b) => a.localeCompare(b)),
    [settlements]
  );

  const canRequestSettlementForAnyMember =
    tripData?.membership.role === "owner" || tripData?.membership.role === "admin";

  const selectableCurrencies = useMemo(() => {
    const dynamic = [
      ...expenses.map((expense) => expense.currency),
      ...settlements.map((settlement) => settlement.currency),
      ...balances.map((balance) => balance.currency),
      ...currencySummaries.map((summary) => summary.currency),
      expenseCurrency,
      settlementCurrency,
    ]
      .map((value) => value.trim().toUpperCase())
      .filter((value) => /^[A-Z]{3}$/.test(value));

    return [...new Set([...COMMON_CURRENCIES, ...dynamic])].sort((a, b) => a.localeCompare(b));
  }, [balances, currencySummaries, expenseCurrency, expenses, settlementCurrency, settlements]);

  const sortedSettlements = useMemo(
    () =>
      [...settlements].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
          new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime()
      ),
    [settlements]
  );

  const approvedSettlements = useMemo(
    () => sortedSettlements.filter((settlement) => settlement.status === "approved"),
    [sortedSettlements]
  );

  const latestSettlement = approvedSettlements[0] ?? null;

  const memberTripTotalsByMemberId = useMemo(() => {
    const grouped = new Map<string, MemberTripTotal[]>();

    for (const row of memberTripTotals) {
      const rows = grouped.get(row.memberId) ?? [];
      rows.push(row);
      grouped.set(row.memberId, rows);
    }

    for (const rows of grouped.values()) {
      rows.sort((left, right) => right.totalTripCents - left.totalTripCents);
    }

    return grouped;
  }, [memberTripTotals]);

  const memberTripTotalsApproxByMemberId = useMemo(
    () => new Map(memberTripTotalsApprox.map((row) => [row.memberId, row])),
    [memberTripTotalsApprox]
  );

  const pendingIncomingSettlements = useMemo(
    () =>
      sortedSettlements.filter(
        (settlement) =>
          settlement.status === "pending" && settlement.toMemberId === tripData?.membership?.id
      ),
    [sortedSettlements, tripData?.membership]
  );

  const pendingOutgoingSettlements = useMemo(
    () =>
      sortedSettlements.filter(
        (settlement) =>
          settlement.status === "pending" && settlement.fromMemberId === tripData?.membership?.id
      ),
    [sortedSettlements, tripData?.membership]
  );

  const filteredSettlements = useMemo(() => {
    const search = settlementSearch.trim().toLowerCase();

    return sortedSettlements.filter((settlement) => {
      if (settlementCurrencyFilter && settlement.currency !== settlementCurrencyFilter) {
        return false;
      }

      if (
        settlementMemberFilter &&
        settlement.fromMemberId !== settlementMemberFilter &&
        settlement.toMemberId !== settlementMemberFilter
      ) {
        return false;
      }

      const paidAtTime = new Date(settlement.paidAt).getTime();

      if (settlementStartDate) {
        const start = new Date(`${settlementStartDate}T00:00:00`).getTime();
        if (!Number.isNaN(start) && paidAtTime < start) {
          return false;
        }
      }

      if (settlementEndDate) {
        const endInclusive = new Date(`${settlementEndDate}T23:59:59.999`).getTime();
        if (!Number.isNaN(endInclusive) && paidAtTime > endInclusive) {
          return false;
        }
      }

      if (!search) {
        return true;
      }

      const fromLabel = memberName.get(settlement.fromMemberId) ?? settlement.fromMemberId;
      const toLabel = memberName.get(settlement.toMemberId) ?? settlement.toMemberId;
      const amountLabel = formatCurrency(settlement.amountCents, settlement.currency);
      const reviewerLabel = settlement.reviewedByMemberId
        ? memberName.get(settlement.reviewedByMemberId) ?? settlement.reviewedByMemberId
        : "";

      return [
        settlement.currency,
        settlement.notes ?? "",
        settlement.status,
        reviewerLabel,
        fromLabel,
        toLabel,
        amountLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [
    memberName,
    settlementCurrencyFilter,
    settlementEndDate,
    settlementMemberFilter,
    settlementSearch,
    settlementStartDate,
    sortedSettlements,
  ]);

  const settlementPageSize = 10;
  const settlementTotalPages = Math.max(1, Math.ceil(filteredSettlements.length / settlementPageSize));
  const settlementPageSafe = Math.min(settlementPage, settlementTotalPages);
  const settlementPageStart = (settlementPageSafe - 1) * settlementPageSize;
  const paginatedSettlements = filteredSettlements.slice(
    settlementPageStart,
    settlementPageStart + settlementPageSize
  );

  const filteredTransfers = useMemo(
    () =>
      transfers.filter((transfer) => {
        if (transferFromFilter && transfer.fromMemberId !== transferFromFilter) {
          return false;
        }

        if (transferToFilter && transfer.toMemberId !== transferToFilter) {
          return false;
        }

        return true;
      }),
    [transferFromFilter, transferToFilter, transfers]
  );

  const pendingTransferRequestKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const settlement of settlements) {
      if (settlement.status !== "pending") {
        continue;
      }

      keys.add(
        transferKey({
          fromMemberId: settlement.fromMemberId,
          toMemberId: settlement.toMemberId,
          currency: settlement.currency,
          amountCents: settlement.amountCents,
        })
      );
    }

    return keys;
  }, [settlements]);

  const requestableFilteredTransfers = useMemo(
    () =>
      filteredTransfers.filter((transfer) => {
        const key = transferKey(transfer);
        const isCurrentMemberReceiver = transfer.toMemberId === tripData?.membership.id;

        if (isCurrentMemberReceiver || pendingTransferRequestKeys.has(key)) {
          return false;
        }

        return canRequestSettlementForAnyMember || transfer.fromMemberId === tripData?.membership.id;
      }),
    [
      canRequestSettlementForAnyMember,
      filteredTransfers,
      pendingTransferRequestKeys,
      tripData?.membership.id,
    ]
  );

  const expenseCurrencies = useMemo(
    () => [...new Set(expenses.map((expense) => expense.currency))].sort((a, b) => a.localeCompare(b)),
    [expenses]
  );

  const filteredExpenses = useMemo(() => {
    const search = expenseSearch.trim().toLowerCase();
    const rows = expenses.filter((expense) => {
      if (expenseCategoryFilter && expense.category !== expenseCategoryFilter) {
        return false;
      }

      if (expenseCurrencyFilter && expense.currency !== expenseCurrencyFilter) {
        return false;
      }

      if (!search) {
        return true;
      }

      const creatorLabel = memberName.get(expense.createdByMemberId) ?? expense.createdByMemberId;

      return [
        expense.title,
        expense.notes ?? "",
        expense.category,
        expense.currency,
        expense.splitMode,
        creatorLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const sorted = [...rows];

    if (expenseSort === "oldest") {
      sorted.sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
      return sorted;
    }

    if (expenseSort === "amountDesc") {
      sorted.sort((left, right) => Math.abs(right.amountCents) - Math.abs(left.amountCents));
      return sorted;
    }

    if (expenseSort === "amountAsc") {
      sorted.sort((left, right) => Math.abs(left.amountCents) - Math.abs(right.amountCents));
      return sorted;
    }

    sorted.sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
    return sorted;
  }, [
    expenseCategoryFilter,
    expenseCurrencyFilter,
    expenseSearch,
    expenseSort,
    expenses,
    memberName,
  ]);

  const hasActiveExpenseFilters = Boolean(
    expenseSearch.trim() || expenseCategoryFilter || expenseCurrencyFilter || expenseSort !== "newest"
  );

  const groupedPersonSettlements = useMemo(() => {
    type IncomingRow = {
      currency: string;
      amountCents: number;
      approximate: boolean;
      unresolvedCount: number;
      transferCount: number;
    };

    type OutgoingRow = {
      toMemberId: string;
      currency: string;
      amountCents: number;
      approximate: boolean;
      unresolvedCount: number;
      transferCount: number;
      details: OweDetailModal["details"];
    };

    const preferredByMemberId = new Map(
      members.map((member) => [member.id, member.preferredSettlementCurrency])
    );

    const incomingByMember = new Map<string, Map<string, IncomingRow>>();
    const outgoingByMember = new Map<string, Map<string, OutgoingRow>>();

    for (const transfer of transfers) {
      const key = transferKey(transfer);
      const quote = transferFxByKey.get(key);
      const receiverPreferredCurrency = preferredByMemberId.get(transfer.toMemberId);
      const preferredCurrency = receiverPreferredCurrency || transfer.currency;

      let displayAmountCents: number | null = transfer.amountCents;
      let approximate = false;
      let conversionUnavailable = false;

      if (receiverPreferredCurrency && receiverPreferredCurrency !== transfer.currency) {
        if (quote) {
          displayAmountCents = quote.targetAmountCents;
          approximate = quote.source !== "identity";
        } else {
          displayAmountCents = null;
          conversionUnavailable = true;
        }
      }

      if (!incomingByMember.has(transfer.toMemberId)) {
        incomingByMember.set(transfer.toMemberId, new Map());
      }

      const incomingKey = preferredCurrency;
      const incomingRows = incomingByMember.get(transfer.toMemberId)!;
      const existingIncoming = incomingRows.get(incomingKey);

      if (existingIncoming) {
        existingIncoming.transferCount += 1;
        existingIncoming.approximate = existingIncoming.approximate || approximate;

        if (displayAmountCents !== null) {
          existingIncoming.amountCents += displayAmountCents;
        }

        if (conversionUnavailable) {
          existingIncoming.unresolvedCount += 1;
        }
      } else {
        incomingRows.set(incomingKey, {
          currency: preferredCurrency,
          amountCents: displayAmountCents ?? 0,
          approximate,
          unresolvedCount: conversionUnavailable ? 1 : 0,
          transferCount: 1,
        });
      }

      if (!outgoingByMember.has(transfer.fromMemberId)) {
        outgoingByMember.set(transfer.fromMemberId, new Map());
      }

      const outgoingRows = outgoingByMember.get(transfer.fromMemberId)!;
      const outgoingKey = `${transfer.toMemberId}:${preferredCurrency}`;
      const existingOutgoing = outgoingRows.get(outgoingKey);

      const detailRow: OweDetailModal["details"][number] = {
        sourceCurrency: transfer.currency,
        sourceAmountCents: transfer.amountCents,
        targetCurrency: preferredCurrency,
        targetAmountCents: displayAmountCents,
        approximate,
        quotedAt: quote?.quotedAt ?? null,
        rate: quote?.rate ?? null,
        conversionUnavailable,
      };

      if (existingOutgoing) {
        existingOutgoing.transferCount += 1;
        existingOutgoing.approximate = existingOutgoing.approximate || approximate;

        if (displayAmountCents !== null) {
          existingOutgoing.amountCents += displayAmountCents;
        }

        if (conversionUnavailable) {
          existingOutgoing.unresolvedCount += 1;
        }

        existingOutgoing.details.push(detailRow);
      } else {
        outgoingRows.set(outgoingKey, {
          toMemberId: transfer.toMemberId,
          currency: preferredCurrency,
          amountCents: displayAmountCents ?? 0,
          approximate,
          unresolvedCount: conversionUnavailable ? 1 : 0,
          transferCount: 1,
          details: [detailRow],
        });
      }
    }

    return members
      .map((member) => {
        const incomingRows = [...(incomingByMember.get(member.id)?.values() ?? [])].sort(
          (left, right) => right.amountCents - left.amountCents
        );
        const outgoingRows = [...(outgoingByMember.get(member.id)?.values() ?? [])].sort(
          (left, right) => right.amountCents - left.amountCents
        );

        return {
          memberId: member.id,
          incomingRows,
          outgoingRows,
        };
      });
  }, [members, transferFxByKey, transfers]);

  const categoryAnalytics = useMemo(
    () =>
      categoryCumulative ?? {
        currency: tripData?.trip.defaultCurrency ?? "USD",
        ranked: [] as CategoryCumulative["ranked"],
        totalSpentCents: 0,
        topSpentCents: 0,
        totalNetCents: 0,
        topNetCents: 0,
        approximateConversionCount: 0,
        unconvertedExpenseCount: 0,
      },
    [categoryCumulative, tripData?.trip.defaultCurrency]
  );

  const isActionLoading = useCallback(
    (key: string) => Boolean(actionLoading[key]),
    [actionLoading]
  );

  const withActionLoading = useCallback(
    async (key: string, run: () => Promise<void>, successMessage?: string) => {
      setActionLoading((current) => ({ ...current, [key]: true }));
      setError("");

      try {
        await run();
        if (successMessage) {
          setToast({ tone: "success", message: successMessage });
        }
      } finally {
        setActionLoading((current) => ({ ...current, [key]: false }));
      }
    },
    []
  );

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!receiptPreviewModal) {
      return;
    }

    const handleEscapeToClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReceiptPreviewModal(null);
      }
    };

    window.addEventListener("keydown", handleEscapeToClose);

    return () => {
      window.removeEventListener("keydown", handleEscapeToClose);
    };
  }, [receiptPreviewModal]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [trip, membersResponse, expensesResponse, balanceResponse, settlementsResponse, summaryResponse] =
        await Promise.all([
        api<TripData>(`/api/trips/${tripId}`),
        api<{ members: Member[] }>(`/api/trips/${tripId}/members`),
        api<{ expenses: Expense[]; deletedExpenses: DeletedExpense[] }>(`/api/trips/${tripId}/expenses`),
        api<{ balances: Balance[]; transfers: Transfer[]; transferFx: TransferFxQuote[] }>(
          `/api/trips/${tripId}/balances`
        ),
          api<{ settlements: Settlement[] }>(`/api/trips/${tripId}/settlements`),
          api<{
            summaries: CurrencySummary[];
            memberTripTotals: MemberTripTotal[];
            memberTripTotalsApprox: MemberTripTotalApprox[];
            categoryCumulative: CategoryCumulative;
          }>(
            `/api/trips/${tripId}/summary`
          ),
        ]);

      setTripData(trip);
      setMembers(membersResponse.members);
      const selfMember = membersResponse.members.find((member) => member.id === trip.membership.id);
      setPreferredSettlementCurrencyDraft(selfMember?.preferredSettlementCurrency ?? "");
      setPayers((current) => {
        if (membersResponse.members.length && current.length === 1 && !current[0].memberId) {
          return [{ ...current[0], memberId: membersResponse.members[0].id }];
        }
        return current;
      });
      setSplitRows((current) => {
        if (membersResponse.members.length && current.length === 1 && !current[0].memberId) {
          return [{ ...current[0], memberId: membersResponse.members[0].id }];
        }
        return current;
      });
      setEqualSplitMemberIds((current) =>
        current.length ? current : membersResponse.members.map((member) => member.id)
      );
      setSettlementFrom((current) => current || trip.membership.id || membersResponse.members[0]?.id || "");
      setSettlementTo((current) => {
        if (current) {
          return current;
        }

        const firstDifferentMember = membersResponse.members.find(
          (member) => member.id !== trip.membership.id
        );

        return firstDifferentMember?.id ?? "";
      });
      setExpenses(expensesResponse.expenses);
      setDeletedExpenses(expensesResponse.deletedExpenses);
      setBalances(balanceResponse.balances);
      setTransfers(balanceResponse.transfers);
      setTransferFx(balanceResponse.transferFx ?? []);
      setSettlements(settlementsResponse.settlements);
      setCurrencySummaries(summaryResponse.summaries);
      setMemberTripTotals(summaryResponse.memberTripTotals ?? []);
      setMemberTripTotalsApprox(summaryResponse.memberTripTotalsApprox ?? []);
      setCategoryCumulative(summaryResponse.categoryCumulative);
      setSimplifyTransfers(trip.trip.simplifyTransfers);
      setLockAfterSettlement(trip.trip.lockAfterSettlement);
    } catch (loadError) {
      setError(toUserFriendlyError(loadError, "Could not load trip details."));
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, [loadAll]);

  async function updateSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await withActionLoading(
        "update-settings",
        async () => {
          await api(`/api/trips/${tripId}`, {
            method: "PATCH",
            body: JSON.stringify({
              defaultCurrency: tripData?.trip.defaultCurrency ?? "USD",
              simplifyTransfers,
              lockAfterSettlement,
            }),
          });
          await refreshBalances(simplifyTransfers);
        },
        "Trip settings updated"
      );
    } catch (settingsError) {
      setError(toUserFriendlyError(settingsError, "Could not update settings."));
    }
  }

  async function savePreferredSettlementCurrency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await withActionLoading(
        "update-preferred-settlement-currency",
        async () => {
          await api(`/api/trips/${tripId}/members`, {
            method: "PATCH",
            body: JSON.stringify({
              preferredSettlementCurrency: preferredSettlementCurrencyDraft || null,
            }),
          });

          await loadAll();
        },
        preferredSettlementCurrencyDraft
          ? `Expected currency set to ${preferredSettlementCurrencyDraft}`
          : "Expected currency reset to original transfer currency"
      );
    } catch (preferenceError) {
      setError(toUserFriendlyError(preferenceError, "Could not update expected settlement currency."));
    }
  }

  function centsFromAmount(value: string) {
    return Math.round(Number(value) * 100);
  }

  const parsedExpenseCents = Number.isFinite(Number(expenseAmount)) ? centsFromAmount(expenseAmount) : NaN;

  const payerDraft = useMemo(
    () =>
      payers
        .filter((row) => row.memberId)
        .map((row) => ({
          memberId: row.memberId,
          amountCents: Number.isFinite(Number(row.amount)) ? centsFromAmount(row.amount) : NaN,
        })),
    [payers]
  );

  const payerTotalCents = useMemo(
    () => payerDraft.reduce((sum, row) => sum + (Number.isFinite(row.amountCents) ? row.amountCents : 0), 0),
    [payerDraft]
  );

  const splitRowsByMode = useMemo(() => {
    if (expenseSplitMode === "equal") {
      return equalSplitMemberIds.map((memberId) => ({ memberId, value: 1 }));
    }

    return splitRows
      .filter((row) => row.memberId)
      .map((row) => ({
        memberId: row.memberId,
        value: Number(row.value),
      }));
  }, [equalSplitMemberIds, expenseSplitMode, splitRows]);

  const expenseValidationMessage = useMemo(() => {
    if (!Number.isFinite(parsedExpenseCents) || parsedExpenseCents === 0) {
      return "Enter a valid non-zero expense amount";
    }

    if (!payerDraft.length) {
      return "Add at least one payer";
    }

    if (new Set(payerDraft.map((row) => row.memberId)).size !== payerDraft.length) {
      return "Each payer member should appear only once";
    }

    if (payerDraft.some((row) => !Number.isFinite(row.amountCents))) {
      return "All payer amounts must be valid numbers";
    }

    if (payerTotalCents !== parsedExpenseCents) {
      return "Payer total must match expense amount";
    }

    if (!splitRowsByMode.length) {
      return "Add split members";
    }

    if (new Set(splitRowsByMode.map((row) => row.memberId)).size !== splitRowsByMode.length) {
      return "Each split member should appear only once";
    }

    if (expenseSplitMode === "equal" && equalSplitMemberIds.length === 0) {
      return "Select at least one member for equal split";
    }

    if (expenseSplitMode === "percentage") {
      if (splitRowsByMode.some((row) => !Number.isFinite(row.value) || row.value <= 0)) {
        return "All percentage values must be positive numbers";
      }

      const totalPct = splitRowsByMode.reduce((sum, row) => sum + row.value, 0);

      if (Math.abs(totalPct - 100) > 0.01) {
        return "Percentage split must total 100%";
      }
    }

    if (expenseSplitMode === "exact") {
      if (splitRowsByMode.some((row) => !Number.isFinite(row.value))) {
        return "All exact split values must be valid numbers";
      }

      const exactTotal = splitRowsByMode.reduce((sum, row) => sum + centsFromAmount(String(row.value)), 0);

      if (exactTotal !== parsedExpenseCents) {
        return "Exact split total must match expense amount";
      }
    }

    if (expenseSplitMode === "shares") {
      if (splitRowsByMode.some((row) => !Number.isFinite(row.value) || row.value <= 0)) {
        return "All shares must be positive numbers";
      }
    }

    return null;
  }, [
    equalSplitMemberIds,
    expenseSplitMode,
    parsedExpenseCents,
    payerDraft,
    payerTotalCents,
    splitRowsByMode,
  ]);

  function distributeEvenly(totalCents: number, parts: number) {
    if (!parts || !Number.isFinite(totalCents)) {
      return [] as number[];
    }

    const sign = totalCents < 0 ? -1 : 1;
    const absolute = Math.abs(totalCents);
    const base = Math.floor(absolute / parts);
    const remainder = absolute % parts;

    return Array.from({ length: parts }, (_, index) => (base + (index < remainder ? 1 : 0)) * sign);
  }

  function autoFillPayers() {
    if (!Number.isFinite(parsedExpenseCents)) {
      setError("Enter expense amount first");
      return;
    }

    const activeIndexes = payers
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.memberId)
      .map(({ index }) => index);

    if (!activeIndexes.length) {
      setError("Select at least one payer member before auto-fill");
      return;
    }

    const distribution = distributeEvenly(parsedExpenseCents, activeIndexes.length);

    setPayers((current) => {
      const next = [...current];
      activeIndexes.forEach((index, offset) => {
        next[index] = { ...next[index], amount: (distribution[offset] / 100).toFixed(2) };
      });
      return next;
    });
  }

  function autoFillSplitValues() {
    if (expenseSplitMode === "equal") {
      setEqualSplitMemberIds(members.map((member) => member.id));
      return;
    }

    const activeIndexes = splitRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.memberId)
      .map(({ index }) => index);

    if (!activeIndexes.length) {
      setError("Select at least one split member before auto-fill");
      return;
    }

    if (expenseSplitMode === "percentage") {
      const equalValue = 100 / activeIndexes.length;
      setSplitRows((current) => {
        const next = [...current];
        activeIndexes.forEach((index) => {
          next[index] = { ...next[index], value: equalValue.toFixed(2) };
        });
        return next;
      });
      return;
    }

    if (expenseSplitMode === "shares") {
      setSplitRows((current) => {
        const next = [...current];
        activeIndexes.forEach((index) => {
          next[index] = { ...next[index], value: "1" };
        });
        return next;
      });
      return;
    }

    if (!Number.isFinite(parsedExpenseCents)) {
      setError("Enter expense amount first");
      return;
    }

    const distribution = distributeEvenly(parsedExpenseCents, activeIndexes.length);
    setSplitRows((current) => {
      const next = [...current];
      activeIndexes.forEach((index, offset) => {
        next[index] = { ...next[index], value: (distribution[offset] / 100).toFixed(2) };
      });
      return next;
    });
  }

  function resetExpenseForm() {
    setEditingExpenseId(null);
    setExpenseTitle("");
    setExpenseCategory("other");
    setExpenseNotes("");
    setExpenseAmount("");
    setExpenseOccurredAt(new Date().toISOString());
    setExpenseCurrency(tripData?.trip.defaultCurrency ?? "USD");
    setPayers([{ memberId: members[0]?.id ?? "", amount: "" }]);
    setSplitRows([{ memberId: members[0]?.id ?? "", value: "" }]);
    setEqualSplitMemberIds(members.map((member) => member.id));
    setReceiptFileForExpense(null);
    setShowExpenseForm(false);
  }

  function closeExpenseDetails() {
    setViewingExpenseId(null);
    setViewingExpenseDetail(null);
  }

  function closeOweDetailModal() {
    setOweDetailModal(null);
  }

  function openSettlementReceiptPreview(settlementId: string, receipt: SettlementReceipt) {
    setReceiptPreviewModal({
      src: `/api/trips/${tripId}/settlements/${settlementId}/receipts/${receipt.id}`,
      fileName: receipt.fileName,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
      uploadedByMemberId: receipt.uploadedByMemberId,
      createdAt: receipt.createdAt,
      contextLabel: "Settlement screenshot",
    });
  }

  function openExpenseReceiptPreview(expenseId: string, receipt: ExpenseReceipt) {
    setReceiptPreviewModal({
      src: `/api/trips/${tripId}/expenses/${expenseId}/receipts/${receipt.id}`,
      fileName: receipt.fileName,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
      uploadedByMemberId: receipt.uploadedByMemberId,
      createdAt: receipt.createdAt,
      contextLabel: "Expense receipt",
    });
  }

  function closeReceiptPreviewModal() {
    setReceiptPreviewModal(null);
  }

  function renderReceiptThumbnail(options: {
    src: string;
    fileName: string;
    mimeType: string;
    onOpen: () => void;
  }) {
    return (
      <button
        type="button"
        className="group h-14 w-14 overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm transition hover:shadow"
        onClick={options.onOpen}
        aria-label={`Open ${options.fileName}`}
      >
        {isImageReceiptMimeType(options.mimeType) ? (
          <Image
            src={options.src}
            alt=""
            width={56}
            height={56}
            unoptimized
            loading="lazy"
            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-muted">
            {options.mimeType === "application/pdf" ? "PDF" : "FILE"}
          </span>
        )}
      </button>
    );
  }

  function closeCategoryBreakdownModal() {
    setCategoryBreakdownModal(null);
  }

  async function openExpenseDetails(expenseId: string) {
    const actionKey = `view-expense-${expenseId}`;

    try {
      setActionLoading((current) => ({ ...current, [actionKey]: true }));
      setError("");
      const data = await api<ExpenseDetailResponse>(`/api/trips/${tripId}/expenses/${expenseId}`);

      setViewingExpenseId(expenseId);
      setViewingExpenseDetail(data);
    } catch (detailError) {
      setError(toUserFriendlyError(detailError, "Could not load expense details."));
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  }

  async function uploadReceiptForExpense(expenseId: string, file: File) {
    const presign = await api<{ uploadUrl: string; storageKey: string }>("/api/receipts/presign", {
      method: "POST",
      body: JSON.stringify({
        tripId,
        expenseId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });

    const uploadResponse = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error("Upload failed");
    }

    await api("/api/receipts/complete", {
      method: "POST",
      body: JSON.stringify({
        tripId,
        expenseId,
        storageKey: presign.storageKey,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (expenseValidationMessage) {
        throw new Error(expenseValidationMessage);
      }

      const amountCents = centsFromAmount(expenseAmount);

      if (!Number.isFinite(amountCents) || amountCents === 0) {
        throw new Error("Enter a valid non-zero amount");
      }

      const selectedPayers = payers
        .filter((row) => row.memberId && row.amount)
        .map((row) => ({
          memberId: row.memberId,
          amountCents: centsFromAmount(row.amount),
        }));

      if (!selectedPayers.length) {
        throw new Error("Add at least one payer");
      }

      if (selectedPayers.some((row) => !Number.isFinite(row.amountCents))) {
        throw new Error("Invalid payer amount");
      }

      let splits: Array<{ memberId: string; amountCents?: number; percentageBp?: number; shares?: number }> = [];

      if (expenseSplitMode === "equal") {
        splits = equalSplitMemberIds.map((memberId) => ({ memberId }));
      } else if (expenseSplitMode === "exact") {
        splits = splitRows
          .filter((row) => row.memberId && row.value)
          .map((row) => ({ memberId: row.memberId, amountCents: centsFromAmount(row.value) }));
      } else if (expenseSplitMode === "percentage") {
        splits = splitRows
          .filter((row) => row.memberId && row.value)
          .map((row) => ({ memberId: row.memberId, percentageBp: Math.round(Number(row.value) * 100) }));
      } else {
        splits = splitRows
          .filter((row) => row.memberId && row.value)
          .map((row) => ({ memberId: row.memberId, shares: Math.round(Number(row.value)) }));
      }

      if (!splits.length) {
        throw new Error("Add at least one split row");
      }

      const payload = {
        title: expenseTitle,
        category: expenseCategory,
        notes: expenseNotes,
        currency: expenseCurrency,
        amountCents,
        occurredAt: expenseOccurredAt,
        splitMode: expenseSplitMode,
        payers: selectedPayers,
        splits,
      };

      const endpoint = editingExpenseId
        ? `/api/trips/${tripId}/expenses/${editingExpenseId}`
        : `/api/trips/${tripId}/expenses`;

      const isEditMode = Boolean(editingExpenseId);
      const hasReceiptAttachment = Boolean(receiptFileForExpense);

      await withActionLoading(
        "save-expense",
        async () => {
          const response = await api<{ expenseId?: string; ok?: boolean }>(endpoint, {
            method: editingExpenseId ? "PATCH" : "POST",
            body: JSON.stringify({
              ...payload,
            }),
          });

          const savedExpenseId = editingExpenseId ?? response.expenseId;
          let receiptUploadFailed = false;

          if (receiptFileForExpense && savedExpenseId) {
            try {
              await uploadReceiptForExpense(savedExpenseId, receiptFileForExpense);
            } catch {
              receiptUploadFailed = true;
            }
          }

          resetExpenseForm();
          await loadAll();

          if (receiptUploadFailed) {
            setToast({
              tone: "info",
              message: isEditMode
                ? "Expense updated, but receipt upload failed. Please retry from Edit expense."
                : "Expense saved, but receipt upload failed. Please retry from Edit expense.",
            });
            return;
          }

          if (hasReceiptAttachment) {
            setToast({
              tone: "success",
              message: isEditMode ? "Expense updated and receipt uploaded" : "Expense saved and receipt uploaded",
            });
            return;
          }

          setToast({ tone: "success", message: isEditMode ? "Expense updated" : "Expense saved" });
        },
        undefined
      );
    } catch (expenseError) {
      setError(toUserFriendlyError(expenseError, "Could not save expense. Please try again."));
    }
  }

  async function startEditExpense(expenseId: string) {
    const actionKey = `load-expense-${expenseId}`;

    try {
      setActionLoading((current) => ({ ...current, [actionKey]: true }));
      setError("");
      const data = await api<ExpenseDetailResponse>(`/api/trips/${tripId}/expenses/${expenseId}`);

      closeExpenseDetails();
      setEditingExpenseId(expenseId);
      setExpenseTitle(data.expense.title);
      setExpenseCategory(data.expense.category);
      setExpenseNotes(data.expense.notes ?? "");
      setExpenseCurrency(data.expense.currency);
      setExpenseAmount((data.expense.amountCents / 100).toFixed(2));
      setExpenseOccurredAt(data.expense.occurredAt);
      setExpenseSplitMode(data.expense.splitMode);
      setShowExpenseForm(true);
      setPayers(
        data.payers.length
          ? data.payers.map((row) => ({
              memberId: row.memberId,
              amount: (row.amountCents / 100).toFixed(2),
            }))
          : [{ memberId: members[0]?.id ?? "", amount: "" }]
      );

      if (data.expense.splitMode === "equal") {
        setEqualSplitMemberIds(data.splits.map((row) => row.memberId));
        setSplitRows([{ memberId: members[0]?.id ?? "", value: "" }]);
      } else {
        setSplitRows(
          data.splits.map((row) => ({
            memberId: row.memberId,
            value:
              data.expense.splitMode === "percentage"
                ? ((row.percentageBp ?? 0) / 100).toFixed(2)
                : data.expense.splitMode === "shares"
                  ? String(row.shares ?? 0)
                  : ((row.amountCents ?? 0) / 100).toFixed(2),
          }))
        );
      }
    } catch (editError) {
      setError(toUserFriendlyError(editError, "Could not open this expense for editing."));
    } finally {
      setActionLoading((current) => ({ ...current, [actionKey]: false }));
    }
  }

  async function deleteExpense(expenseId: string) {
    if (!window.confirm("Delete this expense? This action cannot be undone.")) {
      return;
    }

    try {
      await withActionLoading(
        `delete-expense-${expenseId}`,
        async () => {
          await api(`/api/trips/${tripId}/expenses/${expenseId}`, {
            method: "DELETE",
          });

          if (editingExpenseId === expenseId) {
            resetExpenseForm();
          }

          if (viewingExpenseId === expenseId) {
            closeExpenseDetails();
          }

          await loadAll();
        },
        "Expense deleted"
      );
    } catch (deleteError) {
      setError(toUserFriendlyError(deleteError, "Could not delete this expense."));
    }
  }

  async function restoreExpense(expenseId: string) {
    try {
      await withActionLoading(
        `restore-expense-${expenseId}`,
        async () => {
          await api(`/api/trips/${tripId}/expenses/${expenseId}/restore`, {
            method: "POST",
          });

          await loadAll();
        },
        "Expense restored"
      );
    } catch (restoreError) {
      setError(toUserFriendlyError(restoreError, "Could not restore this expense."));
    }
  }

  async function uploadSettlementReceiptForRequest(settlementId: string, file: File) {
    const presign = await api<{ uploadUrl: string; storageKey: string }>(
      "/api/settlement-receipts/presign",
      {
        method: "POST",
        body: JSON.stringify({
          tripId,
          settlementId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      }
    );

    const uploadResponse = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error("Upload failed");
    }

    await api("/api/settlement-receipts/complete", {
      method: "POST",
      body: JSON.stringify({
        tripId,
        settlementId,
        storageKey: presign.storageKey,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
  }

  async function attachSettlementScreenshot(settlementId: string, file: File) {
    try {
      await withActionLoading(
        `attach-settlement-screenshot-${settlementId}`,
        async () => {
          await uploadSettlementReceiptForRequest(settlementId, file);
          await loadAll();
        },
        "Screenshot uploaded"
      );
    } catch (attachError) {
      setError(toUserFriendlyError(attachError, "Could not upload settlement screenshot."));
    }
  }

  async function handleSettlementScreenshotSelect(
    settlementId: string,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    await attachSettlementScreenshot(settlementId, file);
    event.target.value = "";
  }

  async function addSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idempotencyKey = createIdempotencyKey("manual-settlement");
    const hasScreenshotAttachment = Boolean(settlementReceiptFileForRequest);

    try {
      await withActionLoading(
        "add-settlement",
        async () => {
          const response = await api<{ settlementId?: string; duplicatePending?: boolean }>(
            `/api/trips/${tripId}/settlements`,
            {
              method: "POST",
              headers: {
                "Idempotency-Key": idempotencyKey,
              },
              body: JSON.stringify({
                fromMemberId: settlementFrom,
                toMemberId: settlementTo,
                currency: settlementCurrency,
                amountCents: centsFromAmount(settlementAmount),
                paidAt: new Date().toISOString(),
              }),
            }
          );

          let screenshotUploadFailed = false;

          if (settlementReceiptFileForRequest && response.settlementId) {
            try {
              await uploadSettlementReceiptForRequest(response.settlementId, settlementReceiptFileForRequest);
            } catch {
              screenshotUploadFailed = true;
            }
          }

          setSettlementAmount("");
          setSettlementReceiptFileForRequest(null);
          await loadAll();

          if (screenshotUploadFailed) {
            setToast({
              tone: "info",
              message:
                "Settlement request sent, but screenshot upload failed. You can attach it from Your Pending Requests.",
            });
            return;
          }

          if (hasScreenshotAttachment) {
            setToast({ tone: "success", message: "Settlement request sent with screenshot" });
            return;
          }

          if (response.duplicatePending) {
            setToast({ tone: "info", message: "Matching settlement request is already pending" });
            return;
          }

          setToast({ tone: "success", message: "Settlement request sent" });
        },
        undefined
      );
    } catch (settlementError) {
      setError(toUserFriendlyError(settlementError, "Could not request settlement."));
    }
  }

  async function reviewSettlementRequest(settlementId: string, action: "approve" | "reject") {
    const actionKey = `${action}-settlement-${settlementId}`;

    try {
      await withActionLoading(
        actionKey,
        async () => {
          await api(`/api/trips/${tripId}/settlements/${settlementId}`, {
            method: "PATCH",
            body: JSON.stringify({ action }),
          });

          await loadAll();
        },
        action === "approve" ? "Settlement approved" : "Settlement rejected"
      );
    } catch (reviewError) {
      setError(
        toUserFriendlyError(
          reviewError,
          action === "approve"
            ? "Could not approve this settlement request."
            : "Could not reject this settlement request."
        )
      );
    }
  }

  async function settleTransfer(transfer: Transfer, screenshotFile?: File | null) {
    const key = transferKey(transfer);

    if (pendingTransferRequestKeys.has(key)) {
      setError("Settlement request already pending for this transfer.");
      return;
    }

    if (
      transfer.toMemberId === tripData?.membership.id &&
      transfer.fromMemberId !== tripData?.membership.id
    ) {
      setError("Receiver cannot request settlement for this transfer.");
      return;
    }

    if (!canRequestSettlementForAnyMember && transfer.fromMemberId !== tripData?.membership.id) {
      setError("Only the paying member can request this settlement.");
      return;
    }

    setError("");
    setSettlingTransferKey(key);
    const idempotencyKey = createIdempotencyKey(`transfer-${key.replaceAll(":", "-")}`);

    try {
      const response = await createSettlementFromTransfer(transfer, idempotencyKey);
      let screenshotUploadFailed = false;

      if (screenshotFile && response.settlementId) {
        try {
          await uploadSettlementReceiptForRequest(response.settlementId, screenshotFile);
        } catch {
          screenshotUploadFailed = true;
        }
      }

      await loadAll();
      setSettlementReceiptFileByTransferKey((current) => ({
        ...current,
        [key]: null,
      }));

      if (screenshotUploadFailed) {
        setToast({
          tone: "info",
          message:
            "Settlement request sent, but screenshot upload failed. You can attach it from Your Pending Requests.",
        });
        return;
      }

      if (screenshotFile) {
        setToast({ tone: "success", message: "Settlement request sent with screenshot" });
        return;
      }

      if (response.duplicatePending) {
        setToast({ tone: "info", message: "Matching settlement request is already pending" });
        return;
      }

      setToast({ tone: "success", message: "Settlement request sent" });
    } catch (settleError) {
      setError(toUserFriendlyError(settleError, "Could not request this settlement."));
    } finally {
      setSettlingTransferKey(null);
    }
  }

  async function createSettlementFromTransfer(transfer: Transfer, idempotencyKey?: string) {
    return await api<{ settlementId?: string; duplicatePending?: boolean }>(`/api/trips/${tripId}/settlements`, {
      method: "POST",
      headers: idempotencyKey
        ? {
            "Idempotency-Key": idempotencyKey,
          }
        : undefined,
      body: JSON.stringify({
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        currency: transfer.currency,
        amountCents: transfer.amountCents,
        paidAt: new Date().toISOString(),
      }),
    });
  }

  async function settleAllVisibleTransfers() {
    if (!requestableFilteredTransfers.length) {
      return;
    }

    const totalsByCurrency = new Map<string, number>();

    for (const transfer of requestableFilteredTransfers) {
      totalsByCurrency.set(
        transfer.currency,
        (totalsByCurrency.get(transfer.currency) ?? 0) + transfer.amountCents
      );
    }

    const totalsPreview = [...totalsByCurrency.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amountCents]) => `- ${currency}: ${formatCurrency(amountCents, currency)}`)
      .join("\n");

    if (
      !window.confirm(
        `Request settlement approval for all ${requestableFilteredTransfers.length} visible transfers now?${totalsPreview ? `\n\nTotals:\n${totalsPreview}` : ""}`
      )
    ) {
      return;
    }

    setError("");
    setIsSettlingAll(true);

    try {
      const failures: string[] = [];
      let requestedCount = 0;

      for (const transfer of requestableFilteredTransfers) {
        try {
          const key = transferKey(transfer);
          const idempotencyKey = createIdempotencyKey(`bulk-${key.replaceAll(":", "-")}`);
          await createSettlementFromTransfer(transfer, idempotencyKey);
          requestedCount += 1;
        } catch (transferError) {
          const fromLabel = memberName.get(transfer.fromMemberId) ?? transfer.fromMemberId;
          const toLabel = memberName.get(transfer.toMemberId) ?? transfer.toMemberId;
          const reason = toUserFriendlyError(transferError, "Could not request this settlement");
          failures.push(
            `${fromLabel} -> ${toLabel} ${formatCurrency(transfer.amountCents, transfer.currency)} (${reason})`
          );
        }
      }

      if (requestedCount > 0) {
        await loadAll();
      }

      if (failures.length > 0) {
        const preview = failures.slice(0, 2).join(" | ");
        const more = failures.length > 2 ? ` and ${failures.length - 2} more` : "";
        setError(
          `Requested ${requestedCount}/${requestableFilteredTransfers.length}. Failed ${failures.length}: ${preview}${more}`
        );
      } else if (requestedCount > 0) {
        setToast({ tone: "success", message: `Requested ${requestedCount} settlements` });
      }
    } catch (settleAllError) {
      setError(
        toUserFriendlyError(settleAllError, "Could not request all visible settlements.")
      );
    } finally {
      setIsSettlingAll(false);
    }
  }

  async function undoLastSettlement() {
    if (!latestSettlement) {
      setError("No approved settlements to undo");
      return;
    }

    const fromLabel = memberName.get(latestSettlement.fromMemberId) ?? latestSettlement.fromMemberId;
    const toLabel = memberName.get(latestSettlement.toMemberId) ?? latestSettlement.toMemberId;
    const preview = `${fromLabel} -> ${toLabel} ${formatCurrency(
      latestSettlement.amountCents,
      latestSettlement.currency
    )} at ${new Date(latestSettlement.paidAt).toLocaleString()}`;

    if (!window.confirm(`Undo the most recent approved settlement?\n\n${preview}`)) {
      return;
    }

    try {
      setUndoingSettlement(true);
      await withActionLoading(
        "undo-settlement",
        async () => {
          await api(`/api/trips/${tripId}/settlements`, {
            method: "DELETE",
          });

          await loadAll();
        },
        "Last settlement undone"
      );
    } catch (undoError) {
      setError(toUserFriendlyError(undoError, "Could not undo the last settlement."));
    } finally {
      setUndoingSettlement(false);
    }
  }

  async function refreshBalances(useSimplify: boolean) {
    const response = await api<{ balances: Balance[]; transfers: Transfer[]; transferFx: TransferFxQuote[] }>(
      `/api/trips/${tripId}/balances?simplify=${useSimplify}`
    );

    setBalances(response.balances);
    setTransfers(response.transfers);
    setTransferFx(response.transferFx ?? []);
  }

  async function toggleSimplify(nextValue: boolean) {
    setSimplifyTransfers(nextValue);

    try {
      await withActionLoading(
        "toggle-simplify",
        async () => {
          await refreshBalances(nextValue);
        },
        nextValue ? "Simplified transfers enabled" : "Simplified transfers disabled"
      );
    } catch (toggleError) {
      setError(toUserFriendlyError(toggleError, "Could not refresh balances."));
      setSimplifyTransfers((current) => !current);
    }
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied`);
      setTimeout(() => setCopyMessage(""), 1800);
    } catch {
      setCopyMessage("Copy failed");
      setTimeout(() => setCopyMessage(""), 1800);
    }
  }

  const canShareJoin = tripData?.membership.role === "owner" || tripData?.membership.role === "admin";
  const canUndoSettlements = tripData?.membership.role === "owner" || tripData?.membership.role === "admin";

  function canManageExpense(expense: Expense) {
    if (!tripData) {
      return false;
    }

    return (
      tripData.membership.role === "owner" ||
      tripData.membership.role === "admin" ||
      tripData.membership.id === expense.createdByMemberId
    );
  }

  function clearExpenseFilters() {
    setExpenseSearch("");
    setExpenseCategoryFilter("");
    setExpenseCurrencyFilter("");
    setExpenseSort("newest");
  }

  function openAddExpenseForm() {
    closeExpenseDetails();
    setEditingExpenseId(null);
    setExpenseTitle("");
    setExpenseCategory("other");
    setExpenseNotes("");
    setExpenseCurrency(tripData?.trip.defaultCurrency ?? "USD");
    setExpenseAmount("");
    setExpenseOccurredAt(new Date().toISOString());
    setExpenseSplitMode("equal");
    setPayers([{ memberId: members[0]?.id ?? "", amount: "" }]);
    setSplitRows([{ memberId: members[0]?.id ?? "", value: "" }]);
    setEqualSplitMemberIds(members.map((member) => member.id));
    setReceiptFileForExpense(null);
    setShowExpenseForm(true);
  }

  if (loading && !tripData) {
    return (
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 md:px-10">
        <div className="mb-6 h-5 w-28 animate-pulse rounded bg-[var(--line)]" />

        <header className="mb-6 space-y-3">
          <div className="h-10 w-72 max-w-full animate-pulse rounded bg-[var(--line)]" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--line)]" />
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          <div className="h-9 w-24 animate-pulse rounded-xl bg-[var(--line)]" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-[var(--line)]" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-[var(--line)]" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-[var(--line)]" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card p-5 lg:col-span-3">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="h-8 w-64 animate-pulse rounded bg-[var(--line)]" />
              <div className="flex gap-2">
                <div className="h-9 w-40 animate-pulse rounded-xl bg-[var(--line)]" />
                <div className="h-9 w-36 animate-pulse rounded-xl bg-[var(--line)]" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="h-28 animate-pulse rounded-lg bg-[var(--line)]" />
              <div className="h-28 animate-pulse rounded-lg bg-[var(--line)]" />
              <div className="h-28 animate-pulse rounded-lg bg-[var(--line)]" />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="h-40 animate-pulse rounded-lg bg-[var(--line)]" />
              <div className="h-40 animate-pulse rounded-lg bg-[var(--line)]" />
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-10 md:py-8 ${
        activeTab === "expenses" ? "pb-24 md:pb-8" : ""
      }`}
    >
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/app" className="text-[var(--accent)] hover:underline">
          Back to trips
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl">{tripData?.trip.name || "Trip"}</h1>
          <p className="text-sm text-muted">{tripData?.trip.description || "No description"}</p>
        </div>
        {activeTab !== "expenses" ? (
          <button
            type="button"
            className="btn-primary w-full rounded-xl px-3 py-2 text-sm font-semibold sm:w-auto"
            onClick={openAddExpenseForm}
          >
            Add expense
          </button>
        ) : null}
      </header>

      <div className="mb-6 -mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2 px-1">
          {([
            ["overview", "Overview"],
            ["expenses", "Expenses"],
            ["members", "Members"],
            ["settings", "Settings"],
          ] as Array<[ViewTab, string]>).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${
                activeTab === tab
                  ? "bg-[var(--foreground)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--foreground)]"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {toast ? (
        <p
          className={`mb-4 rounded-xl border p-3 text-sm ${
            toast.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-blue-300 bg-blue-50 text-blue-900"
          }`}
        >
          {toast.message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {activeTab === "members" ? (
        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-3 text-2xl">Members</h2>
          <form
            className="mb-4 rounded-xl border border-[var(--line)] bg-white p-3"
            onSubmit={(event) => void savePreferredSettlementCurrency(event)}
          >
            <p className="text-sm font-semibold">Your expected settlement currency</p>
            <p className="mt-1 text-xs text-muted">
              When someone pays you back, we will show an approximate converted amount in this currency.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm sm:max-w-xs"
                value={preferredSettlementCurrencyDraft}
                onChange={(event) => setPreferredSettlementCurrencyDraft(event.target.value)}
              >
                <option value="">Use original transfer currency</option>
                {selectableCurrencies.map((currency) => (
                  <option key={`preferred-settlement-${currency}`} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="btn-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  isActionLoading("update-preferred-settlement-currency") ||
                  (currentMember?.preferredSettlementCurrency ?? "") === preferredSettlementCurrencyDraft
                }
              >
                {isActionLoading("update-preferred-settlement-currency") ? "Saving..." : "Save preference"}
              </button>
            </div>
          </form>

          <ul className="space-y-2 text-sm">
            {members.map((member) => {
              const spendRows = memberTripTotalsByMemberId.get(member.id) ?? [];
              const spendApprox = memberTripTotalsApproxByMemberId.get(member.id) ?? null;

              return (
                <li key={member.id} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2">
                  <p className="font-semibold">{member.displayName || member.email}</p>
                  <p className="text-muted">{member.email}</p>
                  <p className="text-xs text-muted">
                    Expected currency: {member.preferredSettlementCurrency ?? "Original transfer currency"}
                  </p>
                  <p className="text-xs text-muted">
                    Trip total (incl. unsettled): {spendRows.length
                      ? spendRows
                          .map((row) => formatCurrency(row.totalTripCents, row.currency))
                          .join(" • ")
                      : "No trip share yet"}
                  </p>
                  {member.preferredSettlementCurrency ? (
                    <p className="text-xs text-muted">
                      Approx in expected currency: {spendApprox
                        ? `${spendApprox.approximateConversionCount > 0 ? "~" : ""}${formatCurrency(
                            spendApprox.totalApproxCents,
                            spendApprox.targetCurrency
                          )}`
                        : "No trip share yet"}
                      {spendApprox?.unconvertedCurrencyCount
                        ? ` • ${spendApprox.unconvertedCurrencyCount} currency total${
                            spendApprox.unconvertedCurrencyCount === 1 ? "" : "s"
                          } pending FX`
                        : ""}
                    </p>
                  ) : null}
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {member.role} {member.joinedAt ? "• joined" : ""}
                  </p>
                </li>
              );
            })}
          </ul>

          {canShareJoin ? (
            <div className="mt-4 space-y-2 rounded-xl border border-[var(--line)] bg-white p-3">
              <h3 className="text-lg">Share join access</h3>
              <p className="text-xs text-muted">Share this code or link manually with members.</p>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2">
                <p className="text-xs text-muted">Trip code</p>
                <p className="text-xl font-semibold tracking-[0.12em]">{tripData?.trip.joinCode}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary w-full rounded-xl px-3 py-2 text-xs font-semibold"
                  onClick={() => void copyValue(tripData?.trip.joinCode ?? "", "Code")}
                >
                  Copy code
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full rounded-xl px-3 py-2 text-xs font-semibold"
                  onClick={() => void copyValue(joinLink, "Link")}
                >
                  Copy link
                </button>
              </div>
              <p className="break-all text-xs text-muted">{joinLink}</p>
              {copyMessage ? <p className="text-xs text-emerald-700">{copyMessage}</p> : null}
            </div>
          ) : null}
        </section>
        ) : null}

        {activeTab === "overview" ? (
        <section className="card p-5 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl">Balances and Settlements</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!requestableFilteredTransfers.length || isSettlingAll || Boolean(settlingTransferKey)}
                onClick={() => void settleAllVisibleTransfers()}
              >
                {isSettlingAll
                  ? "Requesting all..."
                  : `Request all visible (${requestableFilteredTransfers.length})`}
              </button>
              {canUndoSettlements ? (
                <button
                  type="button"
                  className="btn-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!approvedSettlements.length || undoingSettlement || isActionLoading("undo-settlement")}
                  onClick={() => void undoLastSettlement()}
                >
                  {undoingSettlement ? "Undoing..." : "Undo last approved settlement"}
                </button>
              ) : null}
              <a
                className="btn-secondary rounded-xl px-3 py-2 text-sm font-semibold"
                href={exportCsvHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Export CSV
              </a>
              <span className="text-xs text-muted">Timezone: {browserTimeZone}</span>
            </div>
          </div>

          {filteredTransfers.length > requestableFilteredTransfers.length ? (
            <p className="mb-3 text-xs text-muted">
              Some visible transfers can only be requested by the paying member.
            </p>
          ) : null}

          <div className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={simplifyTransfers}
              disabled={isActionLoading("toggle-simplify")}
              onChange={(event) => void toggleSimplify(event.target.checked)}
            />
            {isActionLoading("toggle-simplify") ? "Updating simplify setting..." : "Simplify transfers"}
          </div>

          <div className="mb-4 grid gap-2 md:grid-cols-3">
            {currencySummaries.length ? (
              currencySummaries.map((summary) => (
                <div key={summary.currency} className="rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted">{summary.currency}</p>
                  <p className="mt-1 text-muted">Total spent: {formatCurrency(summary.totalExpenseCents, summary.currency)}</p>
                  <p className="text-muted">You paid: {formatCurrency(summary.youPaidCents, summary.currency)}</p>
                  <p className="font-semibold">
                    {summary.yourNetCents > 0
                      ? `You are owed ${formatCurrency(summary.yourNetCents, summary.currency)}`
                      : summary.yourNetCents < 0
                        ? `You owe ${formatCurrency(Math.abs(summary.yourNetCents), summary.currency)}`
                        : `You are settled in ${summary.currency}`}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No currency summary available yet.</p>
            )}
          </div>

          {pendingIncomingSettlements.length || pendingOutgoingSettlements.length ? (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Pending Your Approval
                </p>
                {pendingIncomingSettlements.length ? (
                  <div className="mt-2 space-y-2">
                    {pendingIncomingSettlements.map((settlement) => {
                      const approveKey = `approve-settlement-${settlement.id}`;
                      const rejectKey = `reject-settlement-${settlement.id}`;
                      const isReviewing =
                        isActionLoading(approveKey) || isActionLoading(rejectKey);

                      return (
                        <div key={`incoming-pending-${settlement.id}`} className="rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 py-2">
                          <p>
                            <strong>{memberName.get(settlement.fromMemberId) ?? settlement.fromMemberId}</strong>{" "}
                            requested {formatCurrency(settlement.amountCents, settlement.currency)}
                          </p>
                          <p className="text-xs text-muted">
                            Claimed paid at {new Date(settlement.paidAt).toLocaleString()} • Requested at{" "}
                            {new Date(settlement.createdAt).toLocaleString()}
                          </p>
                          {settlement.receipts?.length ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment screenshot</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {settlement.receipts.map((receipt) => (
                                  <div key={`pending-incoming-receipt-${settlement.id}-${receipt.id}`}>
                                    {renderReceiptThumbnail({
                                      src: `/api/trips/${tripId}/settlements/${settlement.id}/receipts/${receipt.id}`,
                                      fileName: receipt.fileName,
                                      mimeType: receipt.mimeType,
                                      onOpen: () => openSettlementReceiptPreview(settlement.id, receipt),
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isReviewing}
                              onClick={() => void reviewSettlementRequest(settlement.id, "approve")}
                            >
                              {isActionLoading(approveKey) ? "Approving..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isReviewing}
                              onClick={() => void reviewSettlementRequest(settlement.id, "reject")}
                            >
                              {isActionLoading(rejectKey) ? "Rejecting..." : "Reject"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-muted">No pending requests for you.</p>
                )}
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Your Pending Requests
                </p>
                {pendingOutgoingSettlements.length ? (
                  <div className="mt-2 space-y-2">
                    {pendingOutgoingSettlements.map((settlement) => {
                      const attachKey = `attach-settlement-screenshot-${settlement.id}`;

                      return (
                        <div key={`outgoing-pending-${settlement.id}`} className="rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 py-2">
                          <p>
                            Waiting for <strong>{memberName.get(settlement.toMemberId) ?? settlement.toMemberId}</strong>{" "}
                            to approve {formatCurrency(settlement.amountCents, settlement.currency)}
                          </p>
                          <p className="text-xs text-muted">
                            Claimed paid at {new Date(settlement.paidAt).toLocaleString()} • Requested at{" "}
                            {new Date(settlement.createdAt).toLocaleString()}
                          </p>
                          {settlement.receipts?.length ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment screenshot</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {settlement.receipts.map((receipt) => (
                                  <div key={`pending-outgoing-receipt-${settlement.id}-${receipt.id}`}>
                                    {renderReceiptThumbnail({
                                      src: `/api/trips/${tripId}/settlements/${settlement.id}/receipts/${receipt.id}`,
                                      fileName: receipt.fileName,
                                      mimeType: receipt.mimeType,
                                      onOpen: () => openSettlementReceiptPreview(settlement.id, receipt),
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <label className="mt-2 block text-xs text-muted">
                            {settlement.receipts?.length ? "Add another screenshot (optional)" : "Attach payment screenshot (optional)"}
                            <input
                              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              disabled={isActionLoading(attachKey)}
                              onChange={(event) => void handleSettlementScreenshotSelect(settlement.id, event)}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-muted">You have no pending settlement requests.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="mb-4 grid gap-2 md:grid-cols-2">
            <label className="text-xs text-muted">
              From member
              <select
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={transferFromFilter}
                onChange={(event) => setTransferFromFilter(event.target.value)}
              >
                <option value="">All payers</option>
                {members.map((member) => (
                  <option key={`from-filter-${member.id}`} value={member.id}>
                    {member.displayName || member.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              To member
              <select
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={transferToFilter}
                onChange={(event) => setTransferToFilter(event.target.value)}
              >
                <option value="">All receivers</option>
                {members.map((member) => (
                  <option key={`to-filter-${member.id}`} value={member.id}>
                    {member.displayName || member.email}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-lg">Grouped by currency</h3>
              <div className="space-y-2 text-sm">
                {filteredTransfers.length ? (
                  filteredTransfers.map((transfer, index) => {
                    const key = transferKey(transfer);
                    const quote = transferFxByKey.get(key);
                    const isCurrentMemberReceiver = transfer.toMemberId === tripData?.membership.id;
                    const isAlreadyRequested = pendingTransferRequestKeys.has(key);
                    const selectedTransferReceiptFile = settlementReceiptFileByTransferKey[key] ?? null;
                    const canRequestTransfer =
                      !isCurrentMemberReceiver &&
                      !isAlreadyRequested &&
                      (canRequestSettlementForAnyMember ||
                        transfer.fromMemberId === tripData?.membership.id);

                    return (
                      <div
                        key={`${transfer.fromMemberId}-${transfer.toMemberId}-${index}`}
                        className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p>
                            <strong>{memberName.get(transfer.fromMemberId)}</strong> pays{" "}
                            <strong>{memberName.get(transfer.toMemberId)}</strong>{" "}
                            {formatCurrency(transfer.amountCents, transfer.currency)}
                          </p>
                          <button
                            type="button"
                            className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={settlingTransferKey === key || !canRequestTransfer}
                            onClick={() => void settleTransfer(transfer, selectedTransferReceiptFile)}
                          >
                            {settlingTransferKey === key
                              ? "Requesting..."
                              : isAlreadyRequested
                                ? "Requested"
                              : isCurrentMemberReceiver
                                ? "Waiting for payer"
                                : canRequestTransfer
                                ? "Request settle"
                                : "Only payer can request"}
                          </button>
                        </div>

                        {canRequestTransfer ? (
                          <label className="mt-2 block text-xs text-muted">
                            Payment screenshot (optional)
                            <input
                              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              disabled={settlingTransferKey === key}
                              onChange={(event) =>
                                setSettlementReceiptFileByTransferKey((current) => ({
                                  ...current,
                                  [key]: event.target.files?.[0] ?? null,
                                }))
                              }
                            />
                            {selectedTransferReceiptFile ? (
                              <span className="mt-1 block text-xs text-muted">
                                Selected: {selectedTransferReceiptFile.name} ({formatFileSize(selectedTransferReceiptFile.size)})
                              </span>
                            ) : null}
                          </label>
                        ) : isAlreadyRequested ? (
                          <p className="mt-2 text-xs text-muted">
                            Requested. You can attach a screenshot from Your Pending Requests below.
                          </p>
                        ) : null}

                        {quote ? (
                          <p className="mt-1 text-xs text-muted">
                            ~{formatCurrency(quote.targetAmountCents, quote.targetCurrency)} in expected currency ({quote.targetCurrency}) •
                            rate 1 {quote.sourceCurrency} = {formatFxRate(quote.rate)} {quote.targetCurrency} • as of{" "}
                            {new Date(quote.quotedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted">No pending transfers for this filter</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-lg">Grouped by person</h3>
              <p className="mb-2 text-xs text-muted">
                Always full trip view. This section does not change with From/To filters.
              </p>
              <div className="space-y-2 text-sm">
                {groupedPersonSettlements.length ? (
                  groupedPersonSettlements.map((entry) => {
                    const member = members.find((candidate) => candidate.id === entry.memberId);
                    const isFullySettled =
                      entry.incomingRows.length === 0 && entry.outgoingRows.length === 0;

                    return (
                      <div key={entry.memberId} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">{member?.displayName || member?.email || entry.memberId}</p>
                          {isFullySettled ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              All settled 🎉
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted">
                          Expected receive currency: {member?.preferredSettlementCurrency ?? "Original transfer currency"}
                        </p>

                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Expected to receive</p>
                            {entry.incomingRows.length ? (
                              <div className="mt-1 space-y-1">
                                {entry.incomingRows.map((row) => (
                                  <p key={`${entry.memberId}-incoming-${row.currency}`} className="text-muted">
                                    {row.approximate ? "~" : ""}
                                    {formatCurrency(row.amountCents, row.currency)}
                                    {row.transferCount > 1 ? ` (${row.transferCount} transfers)` : ""}
                                    {row.unresolvedCount > 0
                                      ? ` • ${row.unresolvedCount} transfer${
                                          row.unresolvedCount === 1 ? "" : "s"
                                        } pending FX`
                                      : ""}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                                {isFullySettled
                                  ? "No incoming or outgoing dues. You are fully settled ✨"
                                  : "No incoming settlements pending. Nice and clear ✅"}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Needs to pay</p>
                            {entry.outgoingRows.length ? (
                              <div className="mt-1 space-y-1">
                                {entry.outgoingRows.map((row) => (
                                  <button
                                    key={`${entry.memberId}-outgoing-${row.toMemberId}-${row.currency}`}
                                    type="button"
                                    className="w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-2 py-2 text-left"
                                    onClick={() =>
                                      setOweDetailModal({
                                        payerMemberId: entry.memberId,
                                        receiverMemberId: row.toMemberId,
                                        displayCurrency: row.currency,
                                        totalAmountCents: row.amountCents,
                                        approximate: row.approximate,
                                        unresolvedCount: row.unresolvedCount,
                                        details: row.details,
                                      })
                                    }
                                  >
                                    <p className="text-muted">
                                      To <strong>{memberName.get(row.toMemberId) ?? row.toMemberId}</strong>: {row.approximate ? "~" : ""}
                                      {formatCurrency(row.amountCents, row.currency)}
                                    </p>
                                    <p className="text-xs text-muted">
                                      {row.transferCount} transfer{row.transferCount === 1 ? "" : "s"} • Tap for breakdown
                                      {row.unresolvedCount > 0
                                        ? ` • ${row.unresolvedCount} pending FX conversion`
                                        : ""}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                                {isFullySettled
                                  ? "Nothing to pay. You are all caught up 💚"
                                  : "No outgoing settlements pending. Great job ✅"}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted">No pending transfers for this filter</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="mb-2 text-lg">Spend by Category</h3>
            <p className="mb-2 text-sm text-muted">
              Cumulative category totals in {categoryAnalytics.currency}, ranked by net spend.
              {categoryAnalytics.approximateConversionCount
                ? ` Includes approximate FX conversion for ${categoryAnalytics.approximateConversionCount} expense${
                    categoryAnalytics.approximateConversionCount === 1 ? "" : "s"
                  }.`
                : " No FX conversion needed for current totals."}
              {categoryAnalytics.unconvertedExpenseCount
                ? ` ${categoryAnalytics.unconvertedExpenseCount} expense${
                    categoryAnalytics.unconvertedExpenseCount === 1 ? "" : "s"
                  } could not be converted and were excluded.`
                : ""}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Category Leader</p>
                {categoryAnalytics.ranked.length ? (
                  <>
                    <p className="mt-1 font-semibold">
                      {formatCategoryLabel(categoryAnalytics.ranked[0].category)}
                    </p>
                    <p className="text-muted">
                      Net: {formatCurrency(categoryAnalytics.ranked[0].netCents, categoryAnalytics.currency)}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-muted">No spend data in {categoryAnalytics.currency}.</p>
                )}
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Tracked Categories</p>
                <p className="mt-1 text-lg font-semibold">{categoryAnalytics.ranked.length}</p>
                <p className="text-xs text-muted">In {categoryAnalytics.currency}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Total Net Spend</p>
                <p className="mt-1 text-lg font-semibold">
                  {formatCurrency(
                    categoryAnalytics.totalNetCents,
                    categoryAnalytics.currency
                  )}
                </p>
              </div>
            </div>

            {categoryAnalytics.ranked.length ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-[var(--line)] bg-white">
                <div className="grid grid-cols-[56px_1fr_auto_auto] gap-2 border-b border-[var(--line)] bg-[var(--background)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <p>Rank</p>
                  <p>Category</p>
                  <p className="text-right">Net</p>
                  <p className="text-right">Breakdown</p>
                </div>
                <div className="divide-y divide-[var(--line)]">
                  {categoryAnalytics.ranked.map((row, index) => {
                    return (
                      <div key={`leaderboard-${row.category}-${index}`} className="grid grid-cols-[56px_1fr_auto_auto] items-center gap-2 px-3 py-2 text-sm">
                        <p className="font-semibold text-muted">#{index + 1}</p>
                        <div>
                          <p className="font-medium">{formatCategoryLabel(row.category)}</p>
                          <p className="text-xs text-muted">
                            Spent {formatCurrency(row.spentCents, categoryAnalytics.currency)} • Refunds {formatCurrency(row.refundCents, categoryAnalytics.currency)}
                          </p>
                        </div>
                        <p className="text-right font-semibold">
                          {formatCurrency(row.netCents, categoryAnalytics.currency)}
                        </p>
                        <div className="text-right">
                          <button
                            type="button"
                            className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold"
                            onClick={() =>
                              setCategoryBreakdownModal({
                                category: row.category,
                                spentCents: row.spentCents,
                                refundCents: row.refundCents,
                                netCents: row.netCents,
                                currency: categoryAnalytics.currency,
                                sharePercent:
                                  categoryAnalytics.totalNetCents !== 0
                                    ? (row.netCents / categoryAnalytics.totalNetCents) * 100
                                    : 0,
                              })
                            }
                          >
                            View
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              ) : (
                <p className="text-sm text-muted">No category data yet.</p>
              )}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs text-muted">
              Submitting a settlement creates a pending request. The receiving member must approve it.
            </p>
          <form className="grid gap-2 md:grid-cols-4" onSubmit={(event) => void addSettlement(event)}>
            <select
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={settlementFrom}
              onChange={(event) => setSettlementFrom(event.target.value)}
              disabled={!canRequestSettlementForAnyMember}
              required
            >
              <option value="">From member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName || member.email}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={settlementTo}
              onChange={(event) => setSettlementTo(event.target.value)}
              required
            >
              <option value="">To member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName || member.email}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={settlementCurrency}
              onChange={(event) => setSettlementCurrency(event.target.value)}
              required
            >
              {selectableCurrencies.map((currency) => (
                <option key={`settlement-currency-${currency}`} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                placeholder="Amount"
                value={settlementAmount}
                onChange={(event) => setSettlementAmount(event.target.value)}
                required
              />
              <button
                className="btn-primary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isActionLoading("add-settlement")}
              >
                {isActionLoading("add-settlement") ? "Requesting..." : "Request"}
              </button>
            </div>
          </form>
          <label className="mt-2 block text-xs text-muted">
            Payment screenshot (optional)
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setSettlementReceiptFileForRequest(event.target.files?.[0] ?? null)}
            />
            {settlementReceiptFileForRequest ? (
              <span className="mt-1 block text-xs text-muted">
                Selected: {settlementReceiptFileForRequest.name} ({formatFileSize(settlementReceiptFileForRequest.size)})
              </span>
            ) : null}
          </label>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg">Settlement History</h3>
              <p className="text-xs text-muted">
                Showing {paginatedSettlements.length ? settlementPageStart + 1 : 0}-
                {Math.min(settlementPageStart + paginatedSettlements.length, filteredSettlements.length)} of{" "}
                {filteredSettlements.length} (total {settlements.length})
              </p>
            </div>

            <div className="mb-3 grid gap-2 md:grid-cols-5">
              <input
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm md:col-span-2"
                placeholder="Search member, amount, notes"
                value={settlementSearch}
                onChange={(event) => {
                  setSettlementSearch(event.target.value);
                  setSettlementPage(1);
                }}
              />
              <select
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={settlementCurrencyFilter}
                onChange={(event) => {
                  setSettlementCurrencyFilter(event.target.value);
                  setSettlementPage(1);
                }}
              >
                <option value="">All currencies</option>
                {settlementCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={settlementMemberFilter}
                onChange={(event) => {
                  setSettlementMemberFilter(event.target.value);
                  setSettlementPage(1);
                }}
              >
                <option value="">All members</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName || member.email}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-sm font-semibold"
                onClick={() => {
                  setSettlementSearch("");
                  setSettlementCurrencyFilter("");
                  setSettlementMemberFilter("");
                  setSettlementStartDate("");
                  setSettlementEndDate("");
                  setSettlementPage(1);
                }}
              >
                Clear filters
              </button>
            </div>

            <div className="mb-3 grid gap-2 md:grid-cols-2">
              <label className="text-xs text-muted">
                From date
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  type="date"
                  value={settlementStartDate}
                  onChange={(event) => {
                    setSettlementStartDate(event.target.value);
                    setSettlementPage(1);
                  }}
                />
              </label>
              <label className="text-xs text-muted">
                To date
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  type="date"
                  value={settlementEndDate}
                  onChange={(event) => {
                    setSettlementEndDate(event.target.value);
                    setSettlementPage(1);
                  }}
                />
              </label>
            </div>

            <div className="space-y-2 text-sm">
              {paginatedSettlements.length ? (
                paginatedSettlements.map((settlement) => {
                  const fromLabel = memberName.get(settlement.fromMemberId) ?? settlement.fromMemberId;
                  const toLabel = memberName.get(settlement.toMemberId) ?? settlement.toMemberId;
                  const reviewerLabel = settlement.reviewedByMemberId
                    ? memberName.get(settlement.reviewedByMemberId) ?? settlement.reviewedByMemberId
                    : null;

                  return (
                    <div key={settlement.id} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p>
                          <strong>{fromLabel}</strong>{" "}
                          {settlement.status === "approved"
                            ? "paid"
                            : settlement.status === "rejected"
                              ? "requested to pay"
                              : "requested payment to"}{" "}
                          <strong>{toLabel}</strong>{" "}
                          {formatCurrency(settlement.amountCents, settlement.currency)}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                            settlement.status === "approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : settlement.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {settlement.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        Claimed paid at {new Date(settlement.paidAt).toLocaleString()} • Requested at{" "}
                        {new Date(settlement.createdAt).toLocaleString()}
                      </p>
                      {settlement.reviewedAt ? (
                        <p className="text-xs text-muted">
                          {settlement.status === "approved" ? "Approved" : "Rejected"}
                          {reviewerLabel ? ` by ${reviewerLabel}` : ""} at{" "}
                          {new Date(settlement.reviewedAt).toLocaleString()}
                        </p>
                      ) : null}
                      {settlement.notes ? <p className="text-xs text-muted">Notes: {settlement.notes}</p> : null}
                      {settlement.receipts?.length ? (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment screenshot</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {settlement.receipts.map((receipt) => (
                              <div key={`history-settlement-receipt-${settlement.id}-${receipt.id}`}>
                                {renderReceiptThumbnail({
                                  src: `/api/trips/${tripId}/settlements/${settlement.id}/receipts/${receipt.id}`,
                                  fileName: receipt.fileName,
                                  mimeType: receipt.mimeType,
                                  onOpen: () => openSettlementReceiptPreview(settlement.id, receipt),
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-muted">No settlements match current filters.</p>
              )}
            </div>

            {filteredSettlements.length ? (
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <p className="text-muted">
                  Page {settlementPageSafe} of {settlementTotalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={settlementPageSafe <= 1}
                    onClick={() => setSettlementPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={settlementPageSafe >= settlementTotalPages}
                    onClick={() =>
                      setSettlementPage((current) => Math.min(settlementTotalPages, current + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
        ) : null}

        {activeTab === "settings" ? (
        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-3 text-2xl">Trip Settings</h2>
          <form className="space-y-3" onSubmit={(event) => void updateSettings(event)}>
            <label className="block text-sm">
              <span className="mb-1 block">Default currency</span>
              <select
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                value={tripData?.trip.defaultCurrency ?? "USD"}
                onChange={(event) =>
                  setTripData((current) =>
                    current
                      ? {
                          ...current,
                          trip: {
                            ...current.trip,
                            defaultCurrency: event.target.value,
                          },
                        }
                      : current
                  )
                }
              >
                {selectableCurrencies.map((currency) => (
                  <option key={`default-currency-${currency}`} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={simplifyTransfers}
                onChange={(event) => setSimplifyTransfers(event.target.checked)}
              />
              Default simplify transfers
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lockAfterSettlement}
                onChange={(event) => setLockAfterSettlement(event.target.checked)}
              />
              Lock expenses after first settlement
            </label>
            <button
              className="btn-secondary w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isActionLoading("update-settings")}
            >
              {isActionLoading("update-settings") ? "Updating settings..." : "Update settings"}
            </button>
          </form>
        </section>
        ) : null}

        {activeTab === "expenses" ? (
        <section className="card p-5 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl md:text-2xl">Expense Timeline</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted">
                Showing {filteredExpenses.length} of {expenses.length}
              </p>
              <button
                type="button"
                className="btn-primary hidden rounded-xl px-3 py-2 text-xs font-semibold sm:inline-block"
                onClick={openAddExpenseForm}
              >
                Add expense
              </button>
            </div>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-5">
            <input
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm md:col-span-2"
              placeholder="Search title, notes, member, currency"
              value={expenseSearch}
              onChange={(event) => setExpenseSearch(event.target.value)}
            />
            <select
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={expenseCategoryFilter}
              onChange={(event) => setExpenseCategoryFilter(event.target.value as ExpenseCategory | "")}
            >
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={`expense-filter-category-${category}`} value={category}>
                  {formatCategoryLabel(category)}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={expenseCurrencyFilter}
              onChange={(event) => setExpenseCurrencyFilter(event.target.value)}
            >
              <option value="">All currencies</option>
              {expenseCurrencies.map((currency) => (
                <option key={`expense-filter-currency-${currency}`} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={expenseSort}
                onChange={(event) =>
                  setExpenseSort(event.target.value as "newest" | "oldest" | "amountDesc" | "amountAsc")
                }
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="amountDesc">Largest amount</option>
                <option value="amountAsc">Smallest amount</option>
              </select>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!hasActiveExpenseFilters}
                onClick={clearExpenseFilters}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            {filteredExpenses.map((expense) => (
              <div key={expense.id} className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{expense.title}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-muted">{formatCurrency(expense.amountCents, expense.currency)}</p>
                    <button
                      type="button"
                      className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isActionLoading(`view-expense-${expense.id}`)}
                      onClick={() => void openExpenseDetails(expense.id)}
                    >
                      {isActionLoading(`view-expense-${expense.id}`) ? "Opening..." : "Details"}
                    </button>
                    {canManageExpense(expense) ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isActionLoading(`load-expense-${expense.id}`)}
                          onClick={() => void startEditExpense(expense.id)}
                        >
                          {isActionLoading(`load-expense-${expense.id}`) ? "Loading..." : "Edit"}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isActionLoading(`delete-expense-${expense.id}`)}
                          onClick={() => void deleteExpense(expense.id)}
                        >
                          {isActionLoading(`delete-expense-${expense.id}`) ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs uppercase tracking-wide text-muted">{expense.splitMode} split</p>
                <p className="mt-1 text-xs text-muted capitalize">Category: {expense.category}</p>
                {expense.notes ? <p className="mt-1 text-muted">{expense.notes}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  Added by {memberName.get(expense.createdByMemberId) ?? expense.createdByMemberId}
                </p>
                <p className="mt-1 text-xs text-muted">Occurred at {new Date(expense.occurredAt).toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted">Expense ID: {expense.id}</p>
              </div>
            ))}
            {!filteredExpenses.length ? (
              <p className="text-sm text-muted">
                {expenses.length && hasActiveExpenseFilters
                  ? "No expenses match current filters."
                  : "No expenses yet."}
              </p>
            ) : null}
          </div>
        </section>
        ) : null}

        {activeTab === "expenses" ? (
        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-3 text-2xl">Recently Deleted</h2>
          <div className="grid gap-2">
            {deletedExpenses.map((expense) => (
              <div key={`deleted-${expense.id}`} className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{expense.title}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-muted">{formatCurrency(expense.amountCents, expense.currency)}</p>
                    {canManageExpense(expense) ? (
                      <button
                        type="button"
                        className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isActionLoading(`restore-expense-${expense.id}`)}
                        onClick={() => void restoreExpense(expense.id)}
                      >
                        {isActionLoading(`restore-expense-${expense.id}`) ? "Restoring..." : "Restore"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs uppercase tracking-wide text-muted">{expense.splitMode} split</p>
                <p className="mt-1 text-xs text-muted capitalize">Category: {expense.category}</p>
                <p className="mt-1 text-xs text-muted">Deleted at {new Date(expense.deletedAt).toLocaleString()}</p>
              </div>
            ))}
            {!deletedExpenses.length ? <p className="text-sm text-muted">No deleted expenses.</p> : null}
          </div>
        </section>
        ) : null}
      </div>

      {activeTab === "expenses" && !showExpenseForm && !editingExpenseId && !viewingExpenseId ? (
        <div className="fixed inset-x-4 bottom-4 z-30 sm:hidden">
          <button
            type="button"
            className="btn-primary w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-lg"
            onClick={openAddExpenseForm}
          >
            Add expense
          </button>
        </div>
      ) : null}

      {oweDetailModal ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-4 md:py-10">
          <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-2xl">Payment Breakdown</h2>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                onClick={closeOweDetailModal}
              >
                Close
              </button>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
              <p>
                <strong>{memberName.get(oweDetailModal.payerMemberId) ?? oweDetailModal.payerMemberId}</strong> pays{" "}
                <strong>{memberName.get(oweDetailModal.receiverMemberId) ?? oweDetailModal.receiverMemberId}</strong>
              </p>
              <p className="mt-1 font-semibold">
                {oweDetailModal.approximate ? "~" : ""}
                {formatCurrency(oweDetailModal.totalAmountCents, oweDetailModal.displayCurrency)}
              </p>
              {oweDetailModal.unresolvedCount > 0 ? (
                <p className="mt-1 text-xs text-muted">
                  {oweDetailModal.unresolvedCount} transfer{oweDetailModal.unresolvedCount === 1 ? "" : "s"} could not be converted to receiver preferred currency.
                </p>
              ) : null}
            </div>

            <div className="mt-3 space-y-2 text-sm">
              {oweDetailModal.details.map((detail, index) => (
                <div key={`owe-detail-${index}`} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2">
                  <p>
                    Source: {formatCurrency(detail.sourceAmountCents, detail.sourceCurrency)}
                  </p>
                  {detail.conversionUnavailable ? (
                    <p className="text-xs text-muted">
                      Conversion unavailable to {detail.targetCurrency} for this transfer.
                    </p>
                  ) : (
                    <>
                      <p>
                        Target: {detail.approximate ? "~" : ""}
                        {formatCurrency(detail.targetAmountCents ?? 0, detail.targetCurrency)}
                      </p>
                      {detail.rate ? (
                        <p className="text-xs text-muted">
                          Rate: 1 {detail.sourceCurrency} = {formatFxRate(detail.rate)} {detail.targetCurrency}
                          {detail.quotedAt ? ` • ${new Date(detail.quotedAt).toLocaleString()}` : ""}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {categoryBreakdownModal ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-4 md:py-10">
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-2xl">Category Breakdown</h2>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                onClick={closeCategoryBreakdownModal}
              >
                Close
              </button>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
              <p className="font-semibold">{formatCategoryLabel(categoryBreakdownModal.category)}</p>
              <p className="text-xs text-muted">Currency: {categoryBreakdownModal.currency}</p>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Net Spend</p>
                <p className="font-semibold">{formatCurrency(categoryBreakdownModal.netCents, categoryBreakdownModal.currency)}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Share of Net</p>
                <p className="font-semibold">{Number.isFinite(categoryBreakdownModal.sharePercent) ? `${categoryBreakdownModal.sharePercent.toFixed(1)}%` : "0.0%"}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Gross Spend</p>
                <p className="font-semibold">{formatCurrency(categoryBreakdownModal.spentCents, categoryBreakdownModal.currency)}</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Refunds</p>
                <p className="font-semibold">{formatCurrency(categoryBreakdownModal.refundCents, categoryBreakdownModal.currency)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewingExpenseId && viewingExpenseDetail ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-4 md:py-10">
          <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-2xl">Expense Details</h2>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                onClick={closeExpenseDetails}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Title</p>
                <p className="font-semibold">{viewingExpenseDetail.expense.title}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted">Category</p>
                <p>{formatCategoryLabel(viewingExpenseDetail.expense.category)}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted">Amount</p>
                <p className="font-semibold">
                  {formatCurrency(
                    viewingExpenseDetail.expense.amountCents,
                    viewingExpenseDetail.expense.currency
                  )}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Split mode</p>
                <p className="capitalize">{viewingExpenseDetail.expense.splitMode}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted">Occurred at</p>
                <p>{new Date(viewingExpenseDetail.expense.occurredAt).toLocaleString()}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted">Created by</p>
                <p>
                  {memberName.get(viewingExpenseDetail.expense.createdByMemberId) ??
                    viewingExpenseDetail.expense.createdByMemberId}
                </p>
              </div>
            </div>

            {viewingExpenseDetail.expense.notes ? (
              <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Notes</p>
                <p>{viewingExpenseDetail.expense.notes}</p>
              </div>
            ) : null}

            <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
              <p className="mb-2 font-semibold">Payers</p>
              <div className="space-y-1">
                {viewingExpenseDetail.payers.map((payer) => (
                  <div key={`detail-payer-${payer.memberId}`} className="flex items-center justify-between gap-2">
                    <p>{memberName.get(payer.memberId) ?? payer.memberId}</p>
                    <p className="font-medium">
                      {formatCurrency(payer.amountCents, viewingExpenseDetail.expense.currency)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
              <p className="mb-2 font-semibold">Split details</p>
              {viewingExpenseDetail.expense.splitMode === "equal" ? (
                <p>
                  Shared equally among{" "}
                  {viewingExpenseDetail.splits
                    .map((split) => memberName.get(split.memberId) ?? split.memberId)
                    .join(", ")}
                </p>
              ) : (
                <div className="space-y-1">
                  {viewingExpenseDetail.splits.map((split) => {
                    let valueLabel = "";

                    if (viewingExpenseDetail.expense.splitMode === "percentage") {
                      valueLabel = `${((split.percentageBp ?? 0) / 100).toFixed(2)}%`;
                    } else if (viewingExpenseDetail.expense.splitMode === "shares") {
                      valueLabel = `${split.shares ?? 0} shares`;
                    } else {
                      valueLabel = formatCurrency(
                        split.amountCents ?? 0,
                        viewingExpenseDetail.expense.currency
                      );
                    }

                    return (
                      <div key={`detail-split-${split.memberId}`} className="flex items-center justify-between gap-2">
                        <p>{memberName.get(split.memberId) ?? split.memberId}</p>
                        <p className="font-medium">{valueLabel}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
              <p className="mb-2 font-semibold">Receipts</p>
              {viewingExpenseDetail.receipts.length ? (
                <>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                  {viewingExpenseDetail.receipts.map((receipt) => (
                    <div key={receipt.id}>
                      {renderReceiptThumbnail({
                        src: `/api/trips/${tripId}/expenses/${viewingExpenseId}/receipts/${receipt.id}`,
                        fileName: receipt.fileName,
                        mimeType: receipt.mimeType,
                        onOpen: () => openExpenseReceiptPreview(viewingExpenseId, receipt),
                      })}
                    </div>
                  ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">Tap any thumbnail to view full size.</p>
                </>
              ) : (
                <p className="text-muted">No receipts uploaded for this expense.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {receiptPreviewModal ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-4 md:py-10"
          onClick={closeReceiptPreviewModal}
        >
          <div
            className="card w-full max-w-5xl p-4 md:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{receiptPreviewModal.contextLabel}</p>
                <h2 className="text-lg font-semibold md:text-2xl">{receiptPreviewModal.fileName}</h2>
                <p className="text-xs text-muted">
                  {receiptPreviewModal.mimeType} • {formatFileSize(receiptPreviewModal.sizeBytes)} • uploaded by{" "}
                  {memberName.get(receiptPreviewModal.uploadedByMemberId) ?? receiptPreviewModal.uploadedByMemberId} •{" "}
                  {new Date(receiptPreviewModal.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                onClick={closeReceiptPreviewModal}
              >
                Close
              </button>
            </div>

            {isImageReceiptMimeType(receiptPreviewModal.mimeType) ? (
              <div className="flex h-[68vh] items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-black/80">
                <Image
                  src={receiptPreviewModal.src}
                  alt={receiptPreviewModal.fileName}
                  width={1600}
                  height={1200}
                  unoptimized
                  className="max-h-full max-w-full h-auto w-auto object-contain"
                />
              </div>
            ) : receiptPreviewModal.mimeType === "application/pdf" ? (
              <iframe
                title={`${receiptPreviewModal.fileName} preview`}
                src={receiptPreviewModal.src}
                className="h-[68vh] w-full rounded-xl border border-[var(--line)] bg-white"
              />
            ) : (
              <div className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-muted">
                <p>Inline preview is not available for this file type.</p>
                <a
                  className="mt-2 inline-flex rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--background)]"
                  href={receiptPreviewModal.src}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open file in new tab
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showExpenseForm || editingExpenseId ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-4 md:py-10">
          <div className="card max-h-[90vh] w-full max-w-4xl overflow-y-auto p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-2xl">{editingExpenseId ? "Edit Expense" : "Add Expense"}</h2>
              <button
                type="button"
                className="btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                onClick={resetExpenseForm}
              >
                {editingExpenseId ? "Cancel edit" : "Close"}
              </button>
            </div>

            <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void addExpense(event)}>
              <input
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                placeholder="Title"
                value={expenseTitle}
                onChange={(event) => setExpenseTitle(event.target.value)}
                required
              />
              <select
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                value={expenseCategory}
                onChange={(event) => setExpenseCategory(event.target.value as ExpenseCategory)}
                required
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={`expense-category-${category}`} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                value={expenseCurrency}
                onChange={(event) => setExpenseCurrency(event.target.value)}
                required
              >
                {selectableCurrencies.map((currency) => (
                  <option key={`expense-currency-${currency}`} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                placeholder="Amount (negative for refund)"
                value={expenseAmount}
                onChange={(event) => setExpenseAmount(event.target.value)}
                required
              />
              <input
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                type="datetime-local"
                value={toDateTimeLocalInputValue(expenseOccurredAt)}
                onChange={(event) => {
                  const iso = fromDateTimeLocalInputValue(event.target.value);
                  if (iso) {
                    setExpenseOccurredAt(iso);
                  }
                }}
                required
              />
              <select
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                value={expenseSplitMode}
                onChange={(event) => setExpenseSplitMode(event.target.value as typeof expenseSplitMode)}
              >
                <option value="equal">Equal</option>
                <option value="percentage">Percentage</option>
                <option value="exact">Exact amount</option>
                <option value="shares">Shares</option>
              </select>
              <textarea
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 md:col-span-2"
                placeholder="Notes"
                value={expenseNotes}
                onChange={(event) => setExpenseNotes(event.target.value)}
                rows={2}
              />

              <div className="rounded-xl border border-[var(--line)] bg-white p-3 md:col-span-2">
                <p className="mb-2 text-sm font-semibold">Receipt (optional)</p>
                <input
                  className="w-full text-sm"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setReceiptFileForExpense(event.target.files?.[0] ?? null)}
                />
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-white p-3 md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Payers</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold"
                      onClick={autoFillPayers}
                    >
                      Auto-fill
                    </button>
                    <button
                      type="button"
                      className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold"
                      onClick={() => setPayers((current) => [...current, emptyPayer()])}
                    >
                      Add payer
                    </button>
                  </div>
                </div>
                <p className="mb-2 text-xs text-muted">
                  Payer total: {Number.isFinite(payerTotalCents) ? formatCurrency(payerTotalCents, expenseCurrency || "USD") : "-"}
                </p>
                <div className="space-y-2">
                  {payers.map((row, index) => (
                    <div key={`payer-${index}`} className="grid grid-cols-12 gap-2">
                      <select
                        className="col-span-6 rounded-lg border border-[var(--line)] px-2 py-2 text-sm"
                        value={row.memberId}
                        onChange={(event) => {
                          const next = [...payers];
                          next[index] = { ...row, memberId: event.target.value };
                          setPayers(next);
                        }}
                        required
                      >
                        <option value="">Select member</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName || member.email}
                          </option>
                        ))}
                      </select>
                      <input
                        className="col-span-5 rounded-lg border border-[var(--line)] px-2 py-2 text-sm"
                        placeholder="Amount"
                        value={row.amount}
                        onChange={(event) => {
                          const next = [...payers];
                          next[index] = { ...row, amount: event.target.value };
                          setPayers(next);
                        }}
                        required
                      />
                      <button
                        type="button"
                        className="col-span-1 rounded-lg border border-[var(--line)] text-xs"
                        onClick={() => setPayers((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)))}
                      >
                        -
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-white p-3 md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Split members</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold"
                      onClick={autoFillSplitValues}
                    >
                      Auto-fill
                    </button>
                    {expenseSplitMode !== "equal" ? (
                      <button
                        type="button"
                        className="btn-secondary rounded-lg px-2 py-1 text-xs font-semibold"
                        onClick={() => setSplitRows((current) => [...current, emptySplit()])}
                      >
                        Add split row
                      </button>
                    ) : null}
                  </div>
                </div>

                {expenseSplitMode === "equal" ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {members.map((member) => {
                      const checked = equalSplitMemberIds.includes(member.id);
                      return (
                        <label key={member.id} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setEqualSplitMemberIds((current) => [...new Set([...current, member.id])]);
                              } else {
                                setEqualSplitMemberIds((current) => current.filter((id) => id !== member.id));
                              }
                            }}
                          />
                          {member.displayName || member.email}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {splitRows.map((row, index) => (
                      <div key={`split-${index}`} className="grid grid-cols-12 gap-2">
                        <select
                          className="col-span-6 rounded-lg border border-[var(--line)] px-2 py-2 text-sm"
                          value={row.memberId}
                          onChange={(event) => {
                            const next = [...splitRows];
                            next[index] = { ...row, memberId: event.target.value };
                            setSplitRows(next);
                          }}
                          required
                        >
                          <option value="">Select member</option>
                          {members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName || member.email}
                            </option>
                          ))}
                        </select>
                        <input
                          className="col-span-5 rounded-lg border border-[var(--line)] px-2 py-2 text-sm"
                          placeholder={
                            expenseSplitMode === "percentage"
                              ? "Percentage"
                              : expenseSplitMode === "shares"
                                ? "Shares"
                                : "Amount"
                          }
                          value={row.value}
                          onChange={(event) => {
                            const next = [...splitRows];
                            next[index] = { ...row, value: event.target.value };
                            setSplitRows(next);
                          }}
                          required
                        />
                        <button
                          type="button"
                          className="col-span-1 rounded-lg border border-[var(--line)] text-xs"
                          onClick={() => setSplitRows((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)))}
                        >
                          -
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {expenseValidationMessage ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2">
                  {expenseValidationMessage}
                </p>
              ) : (
                <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 md:col-span-2">
                  Expense data looks valid. You can save now.
                </p>
              )}

              <button
                className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
                disabled={Boolean(expenseValidationMessage) || isActionLoading("save-expense")}
              >
                {isActionLoading("save-expense")
                  ? editingExpenseId
                    ? "Updating expense..."
                    : "Saving expense..."
                  : editingExpenseId
                    ? "Update expense"
                    : "Save expense"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
