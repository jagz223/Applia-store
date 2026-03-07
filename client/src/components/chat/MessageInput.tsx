import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Image, Smile, Send } from "lucide-react";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isSending?: boolean;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled,
  isSending,
}: MessageInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-4 border-t border-border">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" className="shrink-0">
          <Paperclip className="w-5 h-5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="shrink-0 hidden sm:flex">
          <Image className="w-5 h-5" />
        </Button>
        <Input
          placeholder="Escribe un mensaje..."
          className="input-industrial flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <Button type="button" variant="ghost" size="icon" className="shrink-0">
          <Smile className="w-5 h-5" />
        </Button>
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
