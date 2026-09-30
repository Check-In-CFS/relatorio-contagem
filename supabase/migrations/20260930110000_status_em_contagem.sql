-- Novo status intermediário: o auditor aperta "Iniciar" na marca antes de
-- informar se ela ficou parcial ou concluída.
-- Posição no enum importa: a importação usa a ordem para nunca rebaixar
-- (pendente < em_contagem < parcial < concluida).
-- Arquivo separado porque um valor novo de enum não pode ser usado na mesma
-- transação em que foi criado.
alter type public.status_marca add value if not exists 'em_contagem' after 'pendente';
