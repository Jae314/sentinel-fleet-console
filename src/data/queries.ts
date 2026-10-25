import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DATA_SOURCE, FILE_POLL_INTERVAL, getDataSource } from "./config";
import type { ActionMode, GuardrailConfig } from "./types";

const ds = () => getDataSource();
const ROOT = "gr";
const polling = { refetchInterval: DATA_SOURCE === "file" ? FILE_POLL_INTERVAL : false, refetchIntervalInBackground: true } as const;

export const useEndpoints = () => useQuery({ ...polling, queryKey: [ROOT, "endpoints"], queryFn: () => ds().getEndpoints() });
export const useDetections = () => useQuery({ ...polling, queryKey: [ROOT, "detections"], queryFn: () => ds().getDetections() });
export const useActions = () => useQuery({ ...polling, queryKey: [ROOT, "actions"], queryFn: () => ds().getActions() });
export const useTuningChanges = () => useQuery({ ...polling, queryKey: [ROOT, "tuning"], queryFn: () => ds().getTuningChanges() });
export const useRuns = () => useQuery({ ...polling, queryKey: [ROOT, "runs"], queryFn: () => ds().getRuns() });
export const useFleetStats = () =>
  useQuery({ queryKey: [ROOT, "stats"], queryFn: () => ds().getFleetStats(), refetchInterval: DATA_SOURCE === "file" ? FILE_POLL_INTERVAL : 15_000, refetchIntervalInBackground: true });
export const useGuardrails = () => useQuery({ queryKey: [ROOT, "guardrails"], queryFn: () => ds().getGuardrails() });
export const useBlockedAttempts = () => useQuery({ ...polling, queryKey: [ROOT, "blocked"], queryFn: () => ds().getBlockedAttempts() });

function useMut<V>(fn: (v: V) => Promise<unknown>, success?: (v: V) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: [ROOT] });
      if (success) toast.success(success(v));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export const useApprove = () => useMut((id: string) => ds().approveAction(id), (id) => DATA_SOURCE === "file" ? `${id}: approve decision sent` : `${id} approved`);
export const useValidateTuning = () => useMut((id: string) => ds().validateTuningChange(id));
export const useApplyTuning = () => useMut((id: string) => ds().applyTuningChange(id));
export const useRollbackTuning = () => useMut((id: string) => ds().rollbackTuningChange(id));
export const useReject = () => useMut((id: string) => ds().rejectAction(id), (id) => DATA_SOURCE === "file" ? `${id}: reject decision sent` : `${id} rejected`);
export const useRollback = () => useMut((id: string) => ds().rollbackAction(id), (id) => DATA_SOURCE === "file" ? `${id}: rollback decision sent` : `${id} rolled back`);
export const useSetMode = () => useMut((v: { id: string; mode: ActionMode }) => ds().setActionMode(v.id, v.mode));
export const useRequestAction = () =>
  useMut((detectionId: string) => ds().requestAction(detectionId), () => "Action sent to Response Center");
export const useUpdateGuardrails = () =>
  useMut((p: Partial<Pick<GuardrailConfig, "approvalThreshold" | "globalDryRun">>) => ds().updateGuardrails(p), () => "Guardrails updated");
