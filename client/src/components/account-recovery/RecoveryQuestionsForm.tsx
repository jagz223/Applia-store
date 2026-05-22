import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecoveryQuestionId } from "@shared/account-recovery";

export type RecoveryAnswerDraft = {
  questionId: RecoveryQuestionId | "";
  answer: string;
};

type RecoveryQuestionsFormProps = {
  value: [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft];
  onChange: (next: [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft]) => void;
  disabled?: boolean;
};

async function fetchQuestionOptions() {
  const res = await fetch("/api/auth/recovery-question-options");
  if (!res.ok) throw new Error("No se pudieron cargar las preguntas");
  const data = await res.json();
  return (data.questions ?? []) as { id: RecoveryQuestionId; label: string }[];
}

export function RecoveryQuestionsForm({ value, onChange, disabled }: RecoveryQuestionsFormProps) {
  const { data: options = [] } = useQuery({
    queryKey: ["/api/auth/recovery-question-options"],
    queryFn: fetchQuestionOptions,
    staleTime: 3600_000,
  });

  const takenIds = useMemo(() => new Set(value.map((v) => v.questionId).filter(Boolean)), [value]);

  const updateSlot = (index: 0 | 1 | 2, patch: Partial<RecoveryAnswerDraft>) => {
    const next = [...value] as [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-5">
      {([0, 1, 2] as const).map((slot) => (
        <div key={slot} className="space-y-2 rounded-lg border border-border/70 bg-muted/15 p-4">
          <p className="text-sm font-semibold text-foreground">Pregunta {slot + 1}</p>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Elige una pregunta</Label>
            <Select
              value={value[slot].questionId || undefined}
              onValueChange={(id) => updateSlot(slot, { questionId: id as RecoveryQuestionId })}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una pregunta…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => {
                  const usedElsewhere = takenIds.has(opt.id) && value[slot].questionId !== opt.id;
                  return (
                    <SelectItem key={opt.id} value={opt.id} disabled={usedElsewhere}>
                      {opt.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tu respuesta (guárdala en un lugar seguro)</Label>
            <Input
              value={value[slot].answer}
              onChange={(e) => updateSlot(slot, { answer: e.target.value })}
              placeholder="Escribe tu respuesta"
              disabled={disabled || !value[slot].questionId}
              autoComplete="off"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
