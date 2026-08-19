import { useAuth } from "@/hooks/use-auth";
import {
  storeOrderCustomerChatKey,
  useSendStoreOrderCustomerChatAdmin,
  useStoreOrderCustomerChatAdmin,
} from "@/hooks/use-store-chat";
import { StoreEmbeddedChatPanel } from "@/components/store/StoreEmbeddedChatPanel";

export function StoreAdminOrderCustomerChatPanel({
  storeId,
  orderId,
  branchName,
  customerName,
}: {
  storeId: number;
  orderId: number;
  branchName?: string | null;
  customerName?: string | null;
}) {
  const { user } = useAuth();
  const { data, isLoading, error } = useStoreOrderCustomerChatAdmin(storeId, orderId);
  const sendMutation = useSendStoreOrderCustomerChatAdmin(storeId, orderId);

  return (
    <StoreEmbeddedChatPanel
      title="Chat con el cliente"
      subtitle={
        customerName
          ? `${customerName} · ${branchName ?? "Sucursal del pedido"}`
          : branchName ?? "Atención al cliente del pedido"
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
      invalidateKeys={[storeOrderCustomerChatKey(storeId, orderId)]}
      storeId={storeId}
    />
  );
}
