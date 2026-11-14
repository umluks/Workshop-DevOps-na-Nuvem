import {useEffect, useState} from 'react';
import {ArrowRight, History, RefreshCw} from 'lucide-react';
import type {RunHistoryPage, RunHistoryStatus, RunHistorySummary} from '../../backend/shared/types';

interface Props {
  api: string;
  apiKey: string;
  refreshToken: string;
  onSelect: (runId: string) => void;
  onConnect: () => void;
}

const labels: Record<RunHistoryStatus, string> = {
  preparing: 'Preparando', sending: 'Enviando', processing: 'Processando',
  completed: 'Concluído', completed_with_errors: 'Concluído com falhas',
  attention: 'Verificar execução', expired: 'Detalhes expirados',
};
export function isActiveRun(status: RunHistoryStatus): boolean {
  return status === 'preparing' || status === 'sending' || status === 'processing';
}

const formatCount = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR');
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
export function formatDuration(milliseconds?: number | null): string {
  if (milliseconds == null || !Number.isFinite(milliseconds)) return '—';
  if (milliseconds < 1000) return `${milliseconds.toLocaleString('pt-BR')} ms`;
  const seconds = milliseconds / 1000;
  const number = (value: number) => value.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1});
  return seconds < 60 ? `${number(seconds)} s` : `${Math.floor(seconds / 60)} min ${number(seconds % 60)} s`;
}

export default function RunHistory({api, apiKey, refreshToken, onSelect, onConnect}: Props) {
  const [runs, setRuns] = useState<RunHistorySummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {setPageCount(1); setRuns([]); setNextCursor(null);}, [api, apiKey]);

  useEffect(() => {
    if (!api || !apiKey) return;
    const abort = new AbortController();
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const readPage = async (cursor?: string): Promise<RunHistoryPage> => {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const result = await fetch(`${api.replace(/\/$/, '')}/runs${query}`, {
        headers: {'x-api-key': apiKey}, signal: abort.signal,
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.message || `HTTP ${result.status}`);
      return data;
    };
    const load = async () => {
      if (inFlight || abort.signal.aborted) return;
      inFlight = true;
      setLoading(true);
      let keepRefreshing = false;
      try {
        // Recarrega as páginas abertas sem duplicar linhas se novos testes chegaram.
        const pages: RunHistoryPage[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < pageCount; page++) {
          const data = await readPage(cursor);
          pages.push(data);
          if (!data.nextCursor) break;
          cursor = data.nextCursor;
        }
        if (abort.signal.aborted) return;
        const unique = [...new Map(pages.flatMap(page => page.runs).map(run => [run.runId, run])).values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setRuns(unique);
        setNextCursor(pages.at(-1)?.nextCursor ?? null);
        setError('');
        keepRefreshing = unique.some(run => isActiveRun(run.status) && !run.note);
      } catch (failure) {
        if (!abort.signal.aborted) setError((failure as Error).message);
      } finally {
        inFlight = false;
        if (!abort.signal.aborted) {
          setLoading(false);
          if (keepRefreshing) timer = setTimeout(load, 15_000);
        }
      }
    };
    void load();
    return () => {abort.abort(); clearTimeout(timer);};
  }, [api, apiKey, refreshToken, refreshVersion, pageCount]);

  return <section className="panel run-history" aria-labelledby="run-history-title">
    <div className="section-head">
      <div><h2 id="run-history-title"><History size={18}/> Histórico de execuções</h2>
        <p className="muted">Uma linha por teste · horários de Brasília · atualização automática durante o processamento</p></div>
      <button className="history-refresh" disabled={!apiKey || loading} onClick={() => setRefreshVersion(value => value + 1)}>
        <RefreshCw size={14}/>{loading ? 'Atualizando…' : 'Atualizar'}
      </button>
    </div>
    {!apiKey ? <div className="history-empty"><p>Conecte o laboratório para consultar as execuções salvas.</p>
      <button className="text-button" onClick={onConnect}>Configurar conexão <ArrowRight size={13}/></button></div> : <>
      {error && <p className="history-error" role="alert">Não foi possível atualizar o histórico: {error}</p>}
      <div className="history-scroll" aria-busy={loading}>
        <table>
          <caption className="sr-only">Resultados das execuções de carga, das mais recentes para as mais antigas.</caption>
          <thead><tr><th scope="col">Execução</th><th scope="col">Cenário</th><th scope="col">Enfileiradas</th>
            <th scope="col">Falhas no envio</th><th scope="col">Processadas</th><th scope="col">Tempo de processamento</th>
            <th scope="col">P95 por pedido</th><th scope="col">P99 por pedido</th>
            <th scope="col">Situação</th><th scope="col"><span className="sr-only">Relatório</span></th></tr></thead>
          <tbody>{runs.map(run => <tr key={run.runId}>
            <td><time dateTime={run.createdAt}>{dateFormat.format(new Date(run.createdAt))}</time><code title={run.runId}>{run.runId.slice(0, 8)}</code></td>
            <td>{formatCount(run.total)} pedidos
              <small>{run.sendMode === 'batch' ? 'SendMessageBatch · em lote' : run.sendMode === 'single' ? 'SendMessage · individual' : 'Modo de envio não registrado'}</small>
              <small>{run.duration} s de envio</small>
              {run.sendMode === 'batch' && run.httpRequests !== undefined && <small>{formatCount(run.httpRequests)} chamadas HTTP</small>}
            </td>
            <td className="history-accepted">{formatCount(run.accepted)}</td>
            <td className={(run.errors || 0) > 0 ? 'history-failed' : ''}>{formatCount(run.errors)}
              {(run.dropped || 0) > 0 && <small>{formatCount(run.dropped)} não enviadas</small>}</td>
            <td>{formatCount(run.processed)}{(run.rejected || 0) > 0 && <small>{formatCount(run.rejected)} sem estoque</small>}</td>
            <td title={run.note}>{formatDuration(run.processingMs)}{!run.complete && run.processingMs !== null && <small>parcial</small>}</td>
            <td>{formatDuration(run.orderLatency?.p95Ms)}
              {run.orderLatency && <small>{formatCount(run.orderLatency.samples)} medidos{!run.complete || run.orderLatency.samples !== run.processed ? ' · parcial' : ''}</small>}</td>
            <td>{formatDuration(run.orderLatency?.p99Ms)}</td>
            <td><span className={`history-status ${run.status}`}>{labels[run.status]}</span>{run.note && <small className="history-note">{run.note}</small>}</td>
            <td><button className="history-open" disabled={run.status === 'expired' || Date.now() - Date.parse(run.createdAt) > 7 * 86400_000}
              aria-label={`Abrir relatório de ${dateFormat.format(new Date(run.createdAt))}`}
              onClick={() => onSelect(run.runId)}>Abrir <ArrowRight size={13}/></button></td>
          </tr>)}{runs.length === 0 && <tr><td colSpan={10} className="history-empty">{loading ? 'Carregando execuções…' : 'Nenhuma execução registrada.'}</td></tr>}</tbody>
        </table>
      </div>
      <div className="history-footer"><p className="footnote">P95 e P99 estimam quanto 95% e 99% dos pedidos medidos esperaram do envio HTTP até a baixa de estoque confirmada. O tempo de processamento vai do início do teste até o último pedido. Os detalhes de pedidos ficam disponíveis por 7 dias.</p>
        {nextCursor && <button className="history-refresh" disabled={loading} onClick={() => setPageCount(count => count + 1)}>Carregar mais</button>}</div>
    </>}
  </section>;
}
