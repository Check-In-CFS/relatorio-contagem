-- Desempenho da RLS — a lógica de acesso NÃO muda.
--
-- As policies chamavam auth.uid(), auth.role() e meu_perfil() uma vez POR
-- LINHA. Em contagens_santri_itens (~18 mil linhas por mês) uma contagem
-- simples estourava o statement_timeout de 8 s. Envolver a chamada em
-- (select ...) faz o Postgres avaliá-la uma única vez por consulta (InitPlan),
-- como recomenda a documentação da Supabase.

alter policy "profiles: leitura autenticada" on public.profiles
  using ((select auth.role()) = 'authenticated');
alter policy "profiles: admin gerencia" on public.profiles
  using ((select public.meu_perfil()) = 'administrador');
alter policy "profiles: usuario edita a si mesmo" on public.profiles
  using (id = (select auth.uid()));

alter policy "empresas: leitura autenticada" on public.empresas
  using ((select auth.role()) = 'authenticated');
alter policy "empresas: admin gerencia" on public.empresas
  using ((select public.meu_perfil()) = 'administrador');

alter policy "lojas: leitura autenticada" on public.lojas
  using ((select auth.role()) = 'authenticated');
alter policy "lojas: admin gerencia" on public.lojas
  using ((select public.meu_perfil()) = 'administrador');

alter policy "marcas: leitura autenticada" on public.marcas
  using ((select auth.role()) = 'authenticated');
alter policy "marcas: admin gerencia" on public.marcas
  using ((select public.meu_perfil()) = 'administrador');

alter policy "importacoes_marcas: leitura autenticada" on public.importacoes_marcas
  using ((select auth.role()) = 'authenticated');
alter policy "importacoes_marcas: admin gerencia" on public.importacoes_marcas
  using ((select public.meu_perfil()) = 'administrador');

alter policy "auditorias: auditor ve as proprias" on public.auditorias
  using (auditor_id = (select auth.uid()) or (select public.meu_perfil()) in ('gestor', 'administrador'));
alter policy "auditorias: auditor cria as proprias" on public.auditorias
  with check (auditor_id = (select auth.uid()));
alter policy "auditorias: auditor atualiza as proprias" on public.auditorias
  using (auditor_id = (select auth.uid()) or (select public.meu_perfil()) in ('gestor', 'administrador'));

alter policy "auditoria_marcas: segue a auditoria" on public.auditoria_marcas
  using (exists (
    select 1 from public.auditorias a
    where a.id = auditoria_id
      and (a.auditor_id = (select auth.uid()) or (select public.meu_perfil()) in ('gestor', 'administrador'))
  ));
alter policy "auditoria_marcas: auditor atualiza da sua auditoria" on public.auditoria_marcas
  using (exists (
    select 1 from public.auditorias a
    where a.id = auditoria_id
      and (a.auditor_id = (select auth.uid()) or (select public.meu_perfil()) in ('gestor', 'administrador'))
  ));
alter policy "auditoria_marcas: insercao pelo dono da auditoria" on public.auditoria_marcas
  with check (exists (
    select 1 from public.auditorias a
    where a.id = auditoria_id
      and (a.auditor_id = (select auth.uid()) or (select public.meu_perfil()) in ('gestor', 'administrador'))
  ));

alter policy "eventos_auditoria: segue a auditoria" on public.eventos_auditoria
  using (exists (
    select 1 from public.auditorias a
    where a.id = auditoria_id
      and (a.auditor_id = (select auth.uid()) or (select public.meu_perfil()) in ('gestor', 'administrador'))
  ));
alter policy "eventos_auditoria: insercao pelo dono da auditoria" on public.eventos_auditoria
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and (a.auditor_id = (select auth.uid()) or (select public.meu_perfil()) in ('gestor', 'administrador'))
    )
  );

alter policy "importacoes_contagem: leitura autenticada" on public.importacoes_contagem
  using ((select auth.role()) = 'authenticated');
alter policy "importacoes_contagem: admin/gestor gerencia" on public.importacoes_contagem
  using ((select public.meu_perfil()) in ('gestor', 'administrador'));

alter policy "contagens_santri: leitura autenticada" on public.contagens_santri
  using ((select auth.role()) = 'authenticated');
alter policy "contagens_santri: admin/gestor gerencia" on public.contagens_santri
  using ((select public.meu_perfil()) in ('gestor', 'administrador'));

alter policy "contagens_santri_itens: leitura autenticada" on public.contagens_santri_itens
  using ((select auth.role()) = 'authenticated');
alter policy "contagens_santri_itens: admin/gestor gerencia" on public.contagens_santri_itens
  using ((select public.meu_perfil()) in ('gestor', 'administrador'));

-- Chaves estrangeiras sem índice usadas em joins e nas policies.
create index if not exists idx_contagens_santri_itens_contagem
  on public.contagens_santri_itens (contagem_santri_id);
create index if not exists idx_auditoria_marcas_marca on public.auditoria_marcas (marca_id);
create index if not exists idx_eventos_auditoria_marca on public.eventos_auditoria (auditoria_marca_id);
create index if not exists idx_lojas_empresa on public.lojas (empresa_id);
create index if not exists idx_importacoes_contagem_loja on public.importacoes_contagem (loja_id);
