import { exigirPerfil } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirPerfil('gestor', 'administrador');
  return children;
}
