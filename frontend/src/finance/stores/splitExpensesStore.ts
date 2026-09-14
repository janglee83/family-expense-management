import { create } from "zustand";
import type {
  SplitExpenseGroup,
  SplitExpenseGroupPreview,
  SplitExpenseGroupSettlementPreview,
  SplitMethod,
} from "../financeApi";

interface GroupFormState {
  fromDate: string;
  toDate: string;
  method: SplitMethod;
  participantIds: string[];
  customAmountByParticipant: Record<string, string>;
  percentageByParticipant: Record<string, string>;
}

function currentIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface SplitExpensesStore {
  groupForm: GroupFormState;
  editingGroupId: string | null;
  groupPreview: SplitExpenseGroupPreview | null;
  settlementPreview: SplitExpenseGroupSettlementPreview | null;
  setGroupRange: (range: { fromDate: string; toDate: string }) => void;
  setGroupForm: (patch: Partial<Omit<GroupFormState, "fromDate" | "toDate">>) => void;
  toggleGroupParticipant: (userId: string) => void;
  setGroupCustomAmount: (userId: string, amount: string) => void;
  setGroupPercentage: (userId: string, percentage: string) => void;
  setGroupPreview: (preview: SplitExpenseGroupPreview | null) => void;
  setSettlementPreview: (preview: SplitExpenseGroupSettlementPreview | null) => void;
  startEditGroup: (group: SplitExpenseGroup) => void;
  cancelEditGroup: () => void;
}

const defaultGroupForm: GroupFormState = {
  fromDate: currentIsoDate(),
  toDate: currentIsoDate(),
  method: "equal",
  participantIds: [],
  customAmountByParticipant: {},
  percentageByParticipant: {},
};

export const useSplitExpensesStore = create<SplitExpensesStore>((set) => ({
  groupForm: defaultGroupForm,
  editingGroupId: null,
  groupPreview: null,
  settlementPreview: null,

  setGroupRange: (range) => {
    set((state) => ({
      groupForm: { ...state.groupForm, ...range },
      groupPreview: null,
      settlementPreview: null,
    }));
  },

  setGroupForm: (patch) => {
    set((state) => ({
      groupForm: { ...state.groupForm, ...patch },
      settlementPreview: null,
    }));
  },

  toggleGroupParticipant: (userId) => {
    set((state) => {
      const hasParticipant = state.groupForm.participantIds.includes(userId);
      return {
        groupForm: {
          ...state.groupForm,
          participantIds: hasParticipant
            ? state.groupForm.participantIds.filter((id) => id !== userId)
            : [...state.groupForm.participantIds, userId],
        },
        settlementPreview: null,
      };
    });
  },

  setGroupCustomAmount: (userId, amount) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        customAmountByParticipant: { ...state.groupForm.customAmountByParticipant, [userId]: amount },
      },
      settlementPreview: null,
    }));
  },

  setGroupPercentage: (userId, percentage) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        percentageByParticipant: { ...state.groupForm.percentageByParticipant, [userId]: percentage },
      },
      settlementPreview: null,
    }));
  },

  setGroupPreview: (preview) => {
    set({ groupPreview: preview });
  },

  setSettlementPreview: (preview) => {
    set({ settlementPreview: preview });
  },

  startEditGroup: (group) => {
    set({
      editingGroupId: group.id,
      groupPreview: { total_amount: group.total_amount, expenses: group.expenses },
      settlementPreview: null,
      groupForm: {
        fromDate: group.period_start,
        toDate: group.period_end,
        method: group.method,
        participantIds: group.participants.map((participant) => participant.participant_user_id),
        customAmountByParticipant: Object.fromEntries(
          group.participants.map((participant) => [participant.participant_user_id, String(participant.amount)]),
        ),
        percentageByParticipant: Object.fromEntries(
          group.participants
            .filter((participant) => participant.percentage !== null)
            .map((participant) => [participant.participant_user_id, String(participant.percentage)]),
        ),
      },
    });
  },

  cancelEditGroup: () => {
    set({ editingGroupId: null, groupForm: defaultGroupForm, groupPreview: null, settlementPreview: null });
  },
}));
