export type Perfil = 'auditor' | 'gestor' | 'administrador';
export type StatusAuditoria = 'em_andamento' | 'concluida' | 'cancelada';
export type StatusMarca = 'pendente' | 'em_contagem' | 'parcial' | 'concluida';
export type OrigemStatus = 'manual' | 'sugerido_importacao';

export const ROTULO_STATUS_MARCA: Record<StatusMarca, string> = {
  pendente: 'Pendente',
  em_contagem: 'Em contagem',
  parcial: 'Parcial',
  concluida: 'Concluída',
};

export const ROTULO_STATUS_MARCA_PLURAL: Record<StatusMarca, string> = {
  pendente: 'Pendentes',
  em_contagem: 'Em contagem',
  parcial: 'Parciais',
  concluida: 'Concluídas',
};

export const ROTULO_STATUS_AUDITORIA: Record<StatusAuditoria, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ROTULO_PERFIL: Record<Perfil, string> = {
  auditor: 'Auditor',
  gestor: 'Gestor',
  administrador: 'Administrador',
};

export type Profile = { id: string; nome: string; perfil: Perfil; ativo: boolean };
export type Empresa = { id: string; nome: string; ativo: boolean };
export type Loja = {
  id: string;
  empresa_id: string;
  nome: string;
  codigo_interno: string | null;
  ativo: boolean;
};
export type AuditoriaMarca = {
  id: string;
  marca_nome: string;
  marca_codigo: number | null;
  iniciada_em: string | null;
  status: StatusMarca;
  status_origem: OrigemStatus;
  observacao: string | null;
  atualizado_em: string;
};
