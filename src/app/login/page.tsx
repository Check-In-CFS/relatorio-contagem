import Image from 'next/image';
import { FormLogin } from './FormLogin';
import { Alerta } from '@/components/ui';

export default function LoginPage({ searchParams }: { searchParams: { erro?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image src="/logo.png" alt="" width={64} height={64} priority className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-2xl font-bold">Auditoria de Estoque</h1>
          <p className="mt-1 text-sm text-muted">Entre para acompanhar suas contagens.</p>
        </div>
        {searchParams.erro === 'inativo' && (
          <div className="mb-4">
            <Alerta>Seu usuário está desativado. Fale com o administrador.</Alerta>
          </div>
        )}
        <FormLogin />
      </div>
    </main>
  );
}
