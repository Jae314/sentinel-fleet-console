import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getDataSource } from "./config";
import type { ActionMode, GuardrailConfig } from "./types";

const ds = () => getDataSource();
const ROOT = "gr";

export const useEndpoints = () => useQuery({ queryKey: [ROOT, "endpoints"], queryFn: () => ds().getEndpoints() });
export const useDetections = () => useQuery({ queryKey: [ROOT, "detections"], queryFn: () => ds().getDetections() });
export const useActions = () => useQuery({ queryKey: [ROOT, "actions"], queryFn: () => ds().getActions() });
export const useFleetStats = () =>
  useQuery({ queryKey: [ROOT, "stats"], queryFn: () => ds().getFleetStats(), refetchInterval: 15_000 });
export const useGuardrails = () => useQuery({ queryKey: [ROOT, "guardrails"], queryFn: () => ds().getGuardrails() });
export const useBlockedAttempts = () => useQuery({ queryKey: [ROOT, "blocked"], queryFn: () => ds().getBlockedAttempts() });

function useMut<V>(fn: (v: V) => Promise<unknown>, success?: (v: V) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [ROOT] });
      if (success) toast.success(success(v));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export const useApprove = () => useMut((id: string) => ds().approveAction(id), (id) => `${id} approved`);
export const useReject = () => useMut((id: string) => ds().rejectAction(id), (id) => `${id} rejected`);
export const useRollback = () => useMut((id: string) => ds().rollbackAction(id), (id) => `${id} rolled back`);
export const useSetMode = () => useMut((v: { id: string; mode: ActionMode }) => ds().setActionMode(v.id, v.mode));
export const useRequestAction = () =>
  useMut((detectionId: string) => ds().requestAction(detectionId), () => "Action sent to Response Center");
export const useUpdateGuardrails = () =>
  useMut((p: Partial<Pick<GuardrailConfig, "approvalThreshold" | "globalDryRun">>) => ds().updateGuardrails(p), () => "Guardrails updated");
