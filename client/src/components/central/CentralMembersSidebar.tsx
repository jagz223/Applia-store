import { CentralMembersPanel } from "@/components/central/CentralMembersPanel";

type CentralMembersSidebarProps = {
  companyId: string;
};

/** @deprecated Usar `CentralMembersPanel` directamente. */
export function CentralMembersSidebar({ companyId }: CentralMembersSidebarProps) {
  return <CentralMembersPanel companyId={companyId} variant="sidebar" />;
}
