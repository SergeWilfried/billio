import { useApp } from '@/context/AppContext';
import { canDelete, canManageOrg, canWrite } from '@/lib/permissions';

/** The current user's permissions (see src/lib/permissions.ts). */
export function usePermissions() {
  const { userRole } = useApp();
  return {
    writable:  canWrite(userRole),
    deletable: canDelete(userRole),
    managesOrg: canManageOrg(userRole),
  };
}
