import { useFieldArray, useFormContext, type Control, type FieldValues, type Path } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Plus, X } from "lucide-react";

type ProviderSkillsFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  description?: string;
};

export function ProviderSkillsField<T extends FieldValues>({
  control,
  name,
  label = "Habilidades",
  description = "Añade una por línea. Máximo 20, hasta 60 caracteres cada una. No se permiten palabras ofensivas.",
}: ProviderSkillsFieldProps<T>) {
  const { fields, append, remove } = useFieldArray({ control, name: name as never });
  const { formState } = useFormContext<T>();
  const err = formState.errors[name as keyof typeof formState.errors] as { message?: string } | undefined;

  return (
    <FormItem className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <FormLabel>{label}</FormLabel>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">{description}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5 rounded-full shrink-0"
          onClick={() => append("" as never)}
        >
          <Plus className="h-4 w-4" />
          Añadir
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center">
          Pulsa <strong className="text-foreground">+ Añadir</strong> para escribir una habilidad.
        </p>
      ) : (
        <ul className="space-y-2">
          {fields.map((field, index) => (
            <li key={field.id} className="flex gap-2 items-start">
              <FormField
                control={control}
                name={`${name}.${index}` as Path<T>}
                render={({ field: input }) => (
                  <FormItem className="flex-1 space-y-0">
                    <FormControl>
                      <Input
                        placeholder={`Habilidad ${index + 1}`}
                        maxLength={60}
                        className="rounded-xl"
                        {...input}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
                aria-label={`Quitar habilidad ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {err?.message ? (
        <p className="text-sm font-medium text-destructive">{err.message}</p>
      ) : null}
    </FormItem>
  );
}
