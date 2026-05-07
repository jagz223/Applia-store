import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  /** Clases en el contenedor exterior (p. ej. quitar borde si el padre ya lo dibuja). */
  className?: string;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled,
  isSending,
  placeholder,
  className,
}: MessageInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-[4.25rem] flex-col justify-center border-t border-border p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Input
          placeholder={placeholder || "Escribe un mensaje..."}
          className="input-industrial flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <Button
          type="button"
          className="shrink-0 bg-primary hover:bg-primary/90"
          onClick={onSend}
          disabled={disabled || !value.trim() || isSending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
