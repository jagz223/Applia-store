import { useMemo, useState } from "react";
import { Building2, MessageSquare, MessageSquarePlus, Search, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useStoreOrders } from "@/hooks/use-store-orders";
import {
  storeChatSessionKey,
  storeChatsListKey,
  useSendStoreChatMessage,
  useStartStoreCustomerChat,
  useStoreChatSession,
  useStoreChatsList,
} from "@/hooks/use-store-chat";
import { StoreEmbeddedChatPanel } from "@/components/store/StoreEmbeddedChatPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";
import { formatListTime } from "@/lib/chat-format";
import type { StoreBranch } from "@shared/store-schema";
import {
  STORE_BRANCH_PAIR_CHAT_KIND,
  STORE_ORDER_CUSTOMER_CHAT_KIND,
  type StoreChatListItem,
} from "@shared/store-chat-schema";
import { useToast } from "@/hooks/use-toast";

function ChatListSection({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: StoreChatListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="px-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      {items.map((chat) => (
        <button
          key={chat.id}
          type="button"
          onClick={() => onSelect(chat.id)}
          className={cn(
            "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
            selectedId === chat.id
              ? "border-primary/40 bg-primary/10"
              : "border-transparent hover:bg-muted/60",
          )}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              {chat.kind === STORE_BRANCH_PAIR_CHAT_KIND ? (
                <Building2 className="h-4 w-4 text-primary" />
              ) : (
                <User className="h-4 w-4 text-secondary" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{chat.title}</span>
                {chat.lastMessageAt ? (
                  <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                    {formatListTime(chat.lastMessageAt)}
                  </span>
                ) : null}
              </span>
              {chat.subtitle ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{chat.subtitle}</span>
              ) : null}
              {chat.lastMessageText ? (
                <span className="mt-1 block truncate text-xs text-muted-foreground/90">{chat.lastMessageText}</span>
              ) : null}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export function StoreBranchCoordinationChatPanel({
  storeId,
  branches = [],
  employeeBranchId = null,
  canPickBranchForCustomerChat = false,
}: {
  storeId: number;
  branches?: StoreBranch[];
  employeeBranchId?: string | null;
  canPickBranchForCustomerChat?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [branchForNewChat, setBranchForNewChat] = useState("");

  const { data: chats = [], isLoading: listLoading, error: listError } = useStoreChatsList(storeId);
  const { data: session, isLoading: sessionLoading, error: sessionError } = useStoreChatSession(
    storeId,
    selectedId,
    selectedId != null,
  );
  const sendMutation = useSendStoreChatMessage(storeId, selectedId ?? 0);
  const startCustomerChat = useStartStoreCustomerChat(storeId);
  const { data: ordersData } = useStoreOrders(storeId, {}, storeId > 0 && newChatOpen);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle ?? "").toLowerCase().includes(q) ||
        (c.lastMessageText ?? "").toLowerCase().includes(q),
    );
  }, [chats, search]);

  const branchChats = filteredChats.filter((c) => c.kind === STORE_BRANCH_PAIR_CHAT_KIND);
  const customerChats = filteredChats.filter((c) => c.kind === STORE_ORDER_CUSTOMER_CHAT_KIND);

  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  const orderCandidates = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    const orders = ordersData?.orders ?? [];
    if (!q) return orders.slice(0, 12);
    return orders
      .filter(
        (o) =>
          String(o.id).includes(q) ||
          (o.customerName ?? "").toLowerCase().includes(q) ||
          (o.customerEmail ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [ordersData?.orders, orderQuery]);

  const branchChoices = useMemo(() => {
    if (employeeBranchId) {
      return branches.filter((b) => b.id === employeeBranchId);
    }
    return branches;
  }, [branches, employeeBranchId]);

  const needsBranchPick = canPickBranchForCustomerChat && branchChoices.length > 1;

  async function handleStartCustomerChat(orderId: number) {
    try {
      const branchId = needsBranchPick ? branchForNewChat.trim() : branchChoices[0]?.id;
      if (needsBranchPick && !branchId) {
        toast({
          variant: "destructive",
          title: "Selecciona una sucursal",
          description: "Indica desde qué sucursal quieres escribir al cliente.",
        });
        return;
      }
      const result = await startCustomerChat.mutateAsync({
        orderId,
        branchId: branchId || undefined,
      });
      setSelectedId(result.conversationId);
      setNewChatOpen(false);
      setOrderQuery("");
      setBranchForNewChat("");
    } catch (e) {
      const err = e as Error & { code?: string };
      toast({
        variant: "destructive",
        title: "No se pudo abrir el chat",
        description: err.message,
      });
    }
  }

  return (
    <Card className={storeAdminSectionCardClass}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <MessageSquare className="h-5 w-5" />
          Chat
        </CardTitle>
        <CardDescription>
          Coordinación entre sucursales (un chat por cada par) y atención a clientes por pedido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-[min(70vh,560px)] min-h-[420px] overflow-hidden rounded-2xl border border-border/70 bg-card/95">
          <aside className="flex w-full max-w-[19rem] shrink-0 flex-col border-r border-border/60 bg-muted/15">
            <div className="space-y-2 border-b border-border/60 p-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar chats…"
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setNewChatOpen(true)}
              >
                <MessageSquarePlus className="h-4 w-4" />
                Nuevo chat con cliente
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
              {listLoading ? (
                <p className="p-3 text-sm text-muted-foreground">Cargando chats…</p>
              ) : listError ? (
                <p className="p-3 text-sm text-destructive">{(listError as Error).message}</p>
              ) : filteredChats.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {branchChoices.length < 2
                    ? "Aún no hay chats. Los de clientes aparecen cuando escriben o los abres manualmente."
                    : "No hay chats todavía. Se crean automáticamente entre cada par de sucursales."}
                </p>
              ) : (
                <>
                  <ChatListSection
                    title="Entre sucursales"
                    items={branchChats}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                  <ChatListSection
                    title="Clientes"
                    items={customerChats}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </>
              )}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {selectedId == null ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 opacity-40" />
                <p className="text-sm">Selecciona un chat de la lista o inicia uno con un cliente.</p>
              </div>
            ) : (
              <StoreEmbeddedChatPanel
                storeId={storeId}
                title={selectedChat?.title}
                subtitle={selectedChat?.subtitle}
                session={session}
                isLoading={sessionLoading}
                error={sessionError as Error | null}
                chatLocked={session?.chatLocked}
                currentUserId={String(user?.id ?? "")}
                onSend={async (content) => {
                  await sendMutation.mutateAsync(content);
                }}
                isSending={sendMutation.isPending}
                invalidateKeys={[
                  storeChatSessionKey(storeId, selectedId),
                  storeChatsListKey(storeId),
                ]}
                className="h-full rounded-none border-0"
              />
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo chat con cliente</DialogTitle>
            <DialogDescription>
              Busca un pedido y abre la conversación. El cliente podrá responder desde Mis pedidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {needsBranchPick ? (
              <div className="space-y-2">
                <Label>Sucursal</Label>
                <Select value={branchForNewChat} onValueChange={setBranchForNewChat}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branchChoices.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Buscar pedido</Label>
              <Input
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                placeholder="Nº de pedido, nombre o correo"
              />
            </div>

            <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border/60 p-1">
              {orderCandidates.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No hay pedidos que coincidan.</p>
              ) : (
                orderCandidates.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    disabled={startCustomerChat.isPending}
                    onClick={() => void handleStartCustomerChat(order.id)}
                    className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-muted/60"
                  >
                    <span className="text-sm font-medium">
                      Pedido #{order.id}
                      {order.customerName ? ` · ${order.customerName}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {order.branchName ?? "Sin sucursal"}
                      {order.customerEmail ? ` · ${order.customerEmail}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewChatOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
