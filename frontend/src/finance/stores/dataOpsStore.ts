import { create } from "zustand";

interface DataOpsStore {
  selectedFile: File | null;
  skipDuplicates: boolean;
  undoToken: string;
  setSelectedFile: (file: File | null) => void;
  setSkipDuplicates: (value: boolean) => void;
  setUndoToken: (value: string) => void;
}

export const useDataOpsStore = create<DataOpsStore>((set) => ({
  selectedFile: null,
  skipDuplicates: true,
  undoToken: "",

  setSelectedFile: (file) => {
    set({ selectedFile: file });
  },

  setSkipDuplicates: (value) => {
    set({ skipDuplicates: value });
  },

  setUndoToken: (value) => {
    set({ undoToken: value });
  },
}));
