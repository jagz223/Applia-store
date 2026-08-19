import { useAuth } from "@/hooks/use-auth";
import { isStoreOrderCustomerChatAvailable } from "@shared/store-chat-schema";
import type { StoreOrderStatus } from "@shared/store-order-schema";
import {
  myStoreOrderChatKey,
  useMyStoreOrderChat,
  useSendMyStoreOrderChat,
} from "@/hooks/use-store-chat";
import { StoreEmbeddedChatPanel } from "@/components/store/StoreEmbeddedChatPanel";

export function StoreMyOrderChatPanel({
  orderId,
  status,
  updatedAt,
  branchName,
}: {
  orderId: number;
  status: StoreOrderStatus;
  updatedAt: string | null;
  branchName?: string | null;
}) {
  const { user } = useAuth();
  const chatAvailable = isStoreOrderCustomerChatAvailable({
    status,
    updatedAt: updatedAt ?? new Date().toISOString(),
  });
  const { data, isLoading, error } = useMyStoreOrderChat(orderId, chatAvailable);
  const sendMutation = useSendMyStoreOrderChat(orderId);

  if (!chatAvailable) {
    return (
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        El chat con la sucursal no está disponible para este pedido (entregado hace más de 24 horas o
        cancelado).
      </div>
    );
  }

  return (
    <StoreEmbeddedChatPanel
      title="Comunícate con la sucursal"
      subtitle={
        branchName
          ? `Chat del pedido #${orderId} con ${branchName}. También puedes escribir por WhatsApp.`
          : `Chat del pedido #${orderId}. También puedes escribir por WhatsApp.`
      }
      session={data}
      isLoading={isLoading}
      error={error as Error | null}
      chatLocked={data?.chatLocked}
      currentUserId={String(user?.id ?? "")}
      onSend={async (content) => {
        await sendMutation.mutateAsync(content);
      }}
      isSending={sendMutation.isPending}
      invalidateKeys={[myStoreOrderChatKey(orderId)]}
    />
  );
}
