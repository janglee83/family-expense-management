import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import {
  familyKeys,
  useAddMember,
  useChangeMemberRole,
  useCreateFamily,
  useDeleteFamily,
  useFamilies,
  useFamilyDetail,
  useRemoveMember,
  useRenameFamily,
} from "./familyQueries";
import * as familyApi from "./familyApi";

vi.mock("./familyApi");

const FAMILY_RESPONSE_EXTRA_FIELDS = {
  family_type: "shared" as const,
  currency_code: "jpy" as const,
  monthly_income_enabled: false,
  monthly_income: null,
  savings_goal_amount: null,
};

const FAMILY_DETAIL = {
  id: "fam-1",
  name: "My Family",
  family_type: "shared" as const,
  currency_code: "jpy" as const,
  monthly_income_enabled: false,
  monthly_income: null,
  savings_goal_amount: null,
  members: [{ user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" as const }],
};

describe("familyQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useFamilies returns the list from listMyFamilies", async () => {
    vi.mocked(familyApi.listMyFamilies).mockResolvedValue([
      { id: "fam-1", name: "My Family", role: "owner", ...FAMILY_RESPONSE_EXTRA_FIELDS },
    ]);

    const { result } = renderHook(() => useFamilies(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it("useFamilyDetail returns the detail from getFamilyDetail", async () => {
    vi.mocked(familyApi.getFamilyDetail).mockResolvedValue(FAMILY_DETAIL);

    const { result } = renderHook(() => useFamilyDetail("fam-1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.id).toBe("fam-1"));
  });

  it("useCreateFamily invalidates familyKeys.list on success", async () => {
    vi.mocked(familyApi.listMyFamilies).mockResolvedValue([
      { id: "fam-1", name: "My Family", role: "owner", ...FAMILY_RESPONSE_EXTRA_FIELDS },
    ]);
    vi.mocked(familyApi.createFamily).mockResolvedValue({
      id: "fam-2",
      name: "New Family",
      role: "owner",
      ...FAMILY_RESPONSE_EXTRA_FIELDS,
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateFamily(), list: useFamilies() }),
      { wrapper },
    );

    await waitFor(() => expect(familyApi.listMyFamilies).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.create.mutateAsync({
        name: "New Family",
        family_type: "shared",
        currency_code: "jpy",
        monthly_income_enabled: false,
        member_emails: [],
      });
    });

    await waitFor(() => expect(familyApi.listMyFamilies).toHaveBeenCalledTimes(2));
  });

  it("useRenameFamily invalidates familyKeys.detail(familyId) on success", async () => {
    vi.mocked(familyApi.getFamilyDetail).mockResolvedValue(FAMILY_DETAIL);
    vi.mocked(familyApi.renameFamily).mockResolvedValue({
      id: "fam-1",
      name: "Renamed",
      role: "owner",
      ...FAMILY_RESPONSE_EXTRA_FIELDS,
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ rename: useRenameFamily("fam-1"), detail: useFamilyDetail("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(familyApi.getFamilyDetail).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.rename.mutateAsync("Renamed");
    });

    await waitFor(() => expect(familyApi.getFamilyDetail).toHaveBeenCalledTimes(2));
    expect(familyApi.renameFamily).toHaveBeenCalledWith("fam-1", "Renamed");
  });

  it("useDeleteFamily calls deleteFamily with the bound familyId", async () => {
    vi.mocked(familyApi.deleteFamily).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteFamily("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(familyApi.deleteFamily).toHaveBeenCalledWith("fam-1");
  });

  it("useAddMember calls addMember and invalidates familyKeys.detail(familyId)", async () => {
    vi.mocked(familyApi.getFamilyDetail).mockResolvedValue(FAMILY_DETAIL);
    vi.mocked(familyApi.addMember).mockResolvedValue({
      user_id: "u2",
      email: "b@example.com",
      display_name: "Bob",
      role: "member",
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ add: useAddMember("fam-1"), detail: useFamilyDetail("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(familyApi.getFamilyDetail).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.add.mutateAsync("b@example.com");
    });

    expect(familyApi.addMember).toHaveBeenCalledWith("fam-1", "b@example.com");
    await waitFor(() => expect(familyApi.getFamilyDetail).toHaveBeenCalledTimes(2));
  });

  it("useRemoveMember calls removeMember with the bound familyId and given userId", async () => {
    vi.mocked(familyApi.removeMember).mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveMember("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("u2");
    });

    expect(familyApi.removeMember).toHaveBeenCalledWith("fam-1", "u2");
  });

  it("useChangeMemberRole calls changeMemberRole with userId and role", async () => {
    vi.mocked(familyApi.changeMemberRole).mockResolvedValue({
      user_id: "u2",
      email: "b@example.com",
      display_name: "Bob",
      role: "admin",
    });
    const { result } = renderHook(() => useChangeMemberRole("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ userId: "u2", role: "admin" });
    });

    expect(familyApi.changeMemberRole).toHaveBeenCalledWith("fam-1", "u2", "admin");
  });

  it("familyKeys produces stable, family-scoped keys", () => {
    expect(familyKeys.list).toEqual(["families"]);
    expect(familyKeys.detail("fam-1")).toEqual(["families", "fam-1"]);
  });
});
