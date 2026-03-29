import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import { api } from '@/services/api';
import type { Product, StockAuditIssue, StockMovement } from '@/types';
import { fetchAllProducts } from '@/utils/fetchAllProducts';
import {
  AUDIT_ISSUES_PDF_REPORT_TITLE,
  saveAndShareAuditIssuesPdf,
} from '@/utils/auditIssuesPdfReport';
import { fetchAllStockAuditIssues } from '@/utils/fetchAllStockAuditIssues';
import { getErrorMessage } from '@/utils/errorMessage';

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase: 'Entrada',
  sale: 'Venda',
  return: 'Devolução',
  adjustment: 'Ajuste',
  damaged: 'Avariado',
  expired: 'Expirado',
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  photo_detected: 'Deteção por foto',
  name_review: 'Nome / documentação',
  quantity_review: 'Quantidade / embalagem',
  general_review: 'Revisão geral',
};

function labelIssueType(type: string): string {
  return ISSUE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

function labelStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Aberto';
    case 'reviewed':
      return 'Revisto';
    case 'corrected':
      return 'Corrigido';
    case 'approved':
      return 'Aprovado';
    default:
      return status;
  }
}

function isOpenStatus(status: string): boolean {
  return status === 'pending';
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatLocationLabel(location: string | null | undefined): string {
  if (!location?.trim()) return '—';
  const u = location.trim().toUpperCase();
  if (u === 'FRONT' || u === 'BACK') return u;
  return location.trim();
}

type StatusFilter = 'all' | 'open' | 'resolved';
type LocationFilter = 'all' | 'FRONT' | 'BACK';
type StockFilter = 'all' | 'zero' | 'positive';
type SortOrder = 'newest' | 'oldest';

type ReportPreset =
  | 'open'
  | 'resolved'
  | 'location_front'
  | 'location_back'
  | 'by_product'
  | 'zero_stock'
  | 'duplicate_ambiguous'
  | 'photo';

export function AuditIssuesPanel() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth >= 880;

  const [allIssues, setAllIssues] = useState<StockAuditIssue[]>([]);
  const [productById, setProductById] = useState<Record<number, Product>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [searchName, setSearchName] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [expandedReasonIds, setExpandedReasonIds] = useState<Set<number>>(() => new Set());

  const [detailIssue, setDetailIssue] = useState<StockAuditIssue | null>(null);
  const [detailMovements, setDetailMovements] = useState<StockMovement[]>([]);
  const [detailMovementsLoading, setDetailMovementsLoading] = useState(false);
  const [detailMovementsError, setDetailMovementsError] = useState<string | null>(null);
  const [reportsVisible, setReportsVisible] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [issues, products] = await Promise.all([
        fetchAllStockAuditIssues(),
        fetchAllProducts({}),
      ]);
      const map: Record<number, Product> = {};
      for (const p of products) {
        map[p.id] = p;
      }
      setAllIssues(issues);
      setProductById(map);
    } catch (e) {
      setError(getErrorMessage(e));
      setAllIssues([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const issueTypes = useMemo(() => {
    const s = new Set<string>();
    for (const i of allIssues) {
      if (i.issue_type) s.add(i.issue_type);
    }
    return Array.from(s).sort();
  }, [allIssues]);

  const stats = useMemo(() => {
    let open = 0;
    let resolved = 0;
    let front = 0;
    let back = 0;
    let zeroSuspicious = 0;
    for (const issue of allIssues) {
      if (isOpenStatus(issue.status)) open += 1;
      else resolved += 1;
      const prod = productById[issue.product_id];
      const loc = (prod?.location ?? '').trim().toUpperCase();
      if (loc === 'FRONT') front += 1;
      if (loc === 'BACK') back += 1;
      const stock = prod?.stock_quantity;
      if (isOpenStatus(issue.status) && stock === 0) zeroSuspicious += 1;
    }
    return {
      total: allIssues.length,
      open,
      resolved,
      front,
      back,
      zeroSuspicious,
    };
  }, [allIssues, productById]);

  const filteredIssues = useMemo(() => {
    const q = searchName.trim().toLowerCase();
    let list = allIssues.filter((issue) => {
      const prod = productById[issue.product_id];
      const name = (prod?.name ?? '').toLowerCase();
      if (q && !name.includes(q) && !String(issue.product_id).includes(q)) return false;
      if (statusFilter === 'open' && !isOpenStatus(issue.status)) return false;
      if (statusFilter === 'resolved' && isOpenStatus(issue.status)) return false;
      if (typeFilter === 'ambiguous_pack') {
        if (!['name_review', 'quantity_review'].includes(issue.issue_type)) return false;
      } else if (typeFilter !== 'all' && issue.issue_type !== typeFilter) return false;
      const loc = formatLocationLabel(prod?.location ?? null);
      if (locationFilter === 'FRONT' && loc !== 'FRONT') return false;
      if (locationFilter === 'BACK' && loc !== 'BACK') return false;
      const stock = prod?.stock_quantity;
      if (stockFilter === 'zero' && stock !== 0) return false;
      if (stockFilter === 'positive' && !(typeof stock === 'number' && stock > 0)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
    return list;
  }, [
    allIssues,
    productById,
    searchName,
    statusFilter,
    typeFilter,
    locationFilter,
    stockFilter,
    sortOrder,
  ]);

  const filterDescription = useMemo(() => {
    const parts: string[] = [];
    if (searchName.trim()) parts.push(`Pesquisa: "${searchName.trim()}"`);
    if (statusFilter === 'open') parts.push('Estado: abertos');
    else if (statusFilter === 'resolved') parts.push('Estado: resolvidos');
    else parts.push('Estado: todos');
    if (typeFilter === 'ambiguous_pack') parts.push('Tipo: nome ou quantidade (revisão)');
    else if (typeFilter !== 'all') parts.push(`Tipo: ${labelIssueType(typeFilter)}`);
    if (locationFilter !== 'all') parts.push(`Local: ${locationFilter}`);
    if (stockFilter === 'zero') parts.push('Stock: zero');
    else if (stockFilter === 'positive') parts.push('Stock: > 0');
    else parts.push('Stock: todos');
    parts.push(sortOrder === 'newest' ? 'Ordenação: mais recentes' : 'Ordenação: mais antigos');
    return parts.join(' · ');
  }, [searchName, statusFilter, typeFilter, locationFilter, stockFilter, sortOrder]);

  const handleResolveIssue = async (issueId: number) => {
    setResolvingId(issueId);
    setError(null);
    try {
      await api.stockAuditIssues.resolve(issueId);
      await loadData();
      setDetailIssue((cur) => (cur?.id === issueId ? null : cur));
    } catch (e) {
      const msg = getErrorMessage(e);
      setError(msg);
      Alert.alert('Erro', msg);
    } finally {
      setResolvingId(null);
    }
  };

  const openDetail = (issue: StockAuditIssue) => {
    setDetailIssue(issue);
    setDetailMovements([]);
    setDetailMovementsError(null);
  };

  useEffect(() => {
    if (!detailIssue) return;
    let cancelled = false;
    const run = async () => {
      setDetailMovementsLoading(true);
      setDetailMovementsError(null);
      try {
        const movs = await api.stockMovements.getProductHistory(detailIssue.product_id, {
          limit: 100,
        });
        if (!cancelled) setDetailMovements(movs);
      } catch (e) {
        if (!cancelled) {
          setDetailMovementsError(getErrorMessage(e));
          setDetailMovements([]);
        }
      } finally {
        if (!cancelled) setDetailMovementsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [detailIssue]);

  const relatedIssuesForProduct = useMemo(() => {
    if (!detailIssue) return [];
    return allIssues
      .filter((i) => i.product_id === detailIssue.product_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [allIssues, detailIssue]);

  const runPdfExport = async (rows: StockAuditIssue[], extraNotes?: string[]) => {
    setExportingPdf(true);
    try {
      const generatedAt = new Date().toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const tableBody = rows.map((issue) => {
        const prod = productById[issue.product_id];
        return [
          prod?.name ?? `#${issue.product_id}`,
          prod?.sku ?? '—',
          issue.issue_note?.trim() || '—',
          labelIssueType(issue.issue_type),
          prod?.stock_quantity != null ? String(prod.stock_quantity) : '—',
          formatLocationLabel(prod?.location ?? null),
          formatDateTime(issue.created_at),
          labelStatus(issue.status),
        ];
      });
      const systemName =
        (Constants.expoConfig?.name && String(Constants.expoConfig.name).trim()) || 'PharmaOS';
      const { shared } = await saveAndShareAuditIssuesPdf(
        {
          systemName,
          reportTitle: AUDIT_ISSUES_PDF_REPORT_TITLE,
          generatedAt,
          filterDescription,
          extraNotes,
          stats: {
            totalCatalog: stats.total,
            open: stats.open,
            resolved: stats.resolved,
            front: stats.front,
            back: stats.back,
            zeroOpen: stats.zeroSuspicious,
            rowsInReport: rows.length,
          },
          tableBody,
        },
        AUDIT_ISSUES_PDF_REPORT_TITLE,
      );
      if (!shared) {
        Alert.alert(
          'PDF gerado',
          'O relatório foi guardado em cache. A partilha não está disponível neste dispositivo.',
        );
      }
    } catch (e) {
      Alert.alert('Erro', getErrorMessage(e));
    } finally {
      setExportingPdf(false);
    }
  };

  const applyReportPreset = (preset: ReportPreset) => {
    setReportsVisible(false);
    switch (preset) {
      case 'open':
        setStatusFilter('open');
        setTypeFilter('all');
        setLocationFilter('all');
        setStockFilter('all');
        break;
      case 'resolved':
        setStatusFilter('resolved');
        setTypeFilter('all');
        setLocationFilter('all');
        setStockFilter('all');
        break;
      case 'location_front':
        setLocationFilter('FRONT');
        setStatusFilter('all');
        break;
      case 'location_back':
        setLocationFilter('BACK');
        setStatusFilter('all');
        break;
      case 'by_product':
        setStatusFilter('all');
        setTypeFilter('all');
        setLocationFilter('all');
        setStockFilter('all');
        setSearchName('');
        break;
      case 'zero_stock':
        setStockFilter('zero');
        setStatusFilter('open');
        break;
      case 'duplicate_ambiguous':
        setStatusFilter('open');
        setTypeFilter('ambiguous_pack');
        setLocationFilter('all');
        setStockFilter('all');
        setSearchName('');
        break;
      case 'photo':
        setTypeFilter('photo_detected');
        setStatusFilter('all');
        break;
      default:
        break;
    }
  };

  const exportByProductPdf = async () => {
    const rows = [...filteredIssues].sort((a, b) => {
      const na = (productById[a.product_id]?.name ?? '').localeCompare(
        productById[b.product_id]?.name ?? '',
        'pt',
      );
      if (na !== 0) return na;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    await runPdfExport(rows, ['Ordenação do relatório: por nome de produto (A-Z).']);
  };

  const toggleReasonExpanded = (id: number) => {
    setExpandedReasonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const Chip = ({
    label,
    active,
    onPress,
  }: {
    label: string;
    active?: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  function Badge({ text, tone }: { text: string; tone: 'neutral' | 'blue' | 'green' | 'amber' | 'slate' }) {
    const badgeStyle =
      tone === 'blue'
        ? styles.badge_blue
        : tone === 'green'
          ? styles.badge_green
          : tone === 'amber'
            ? styles.badge_amber
            : tone === 'slate'
              ? styles.badge_slate
              : styles.badge_neutral;
    const textStyle =
      tone === 'blue'
        ? styles.badgeText_blue
        : tone === 'green'
          ? styles.badgeText_green
          : tone === 'amber'
            ? styles.badgeText_amber
            : tone === 'slate'
              ? styles.badgeText_slate
              : styles.badgeText_neutral;
    return (
      <View style={[styles.badge, badgeStyle]}>
        <Text style={[styles.badgeText, textStyle]} numberOfLines={1}>
          {text}
        </Text>
      </View>
    );
  }

  const renderRowActions = (issue: StockAuditIssue) => (
    <View style={styles.actionsCol}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/produto',
            params: { id: String(issue.product_id) },
          })
        }
        style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
        <Text style={styles.actionBtnText}>Ver produto</Text>
      </Pressable>
      <Pressable
        onPress={() => openDetail(issue)}
        style={({ pressed }) => [styles.actionBtnSecondary, pressed && styles.actionBtnSecondaryPressed]}>
        <Text style={styles.actionBtnSecondaryText}>Ver detalhes</Text>
      </Pressable>
      {isOpenStatus(issue.status) && (
        <Pressable
          disabled={resolvingId === issue.id}
          onPress={() => handleResolveIssue(issue.id)}
          style={({ pressed }) => [
            styles.actionBtnResolve,
            resolvingId === issue.id && styles.actionBtnDisabled,
            pressed && resolvingId !== issue.id && styles.actionBtnResolvePressed,
          ]}>
          <Text style={styles.actionBtnResolveText}>{resolvingId === issue.id ? '…' : 'Resolver'}</Text>
        </Pressable>
      )}
    </View>
  );

  const detailProduct = detailIssue ? productById[detailIssue.product_id] : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Issues pendentes de revisão</Text>
        <Text style={styles.heroSubtitle}>
          Produtos com sinais suspeitos ou dados que exigem confirmação do auditor (foto, nome, quantidade ou revisão
          geral). Revista cada linha, abra o produto ou marque como revisto quando estiver corrigido.
        </Text>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total issues</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.statOpen]}>{stats.open}</Text>
          <Text style={styles.statLabel}>Abertos</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.statResolved]}>{stats.resolved}</Text>
          <Text style={styles.statLabel}>Resolvidos</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.front}</Text>
          <Text style={styles.statLabel}>FRONT</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.back}</Text>
          <Text style={styles.statLabel}>BACK</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.statWarn]}>{stats.zeroSuspicious}</Text>
          <Text style={styles.statLabel}>Abertos stock 0</Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <TextInput
          value={searchName}
          onChangeText={setSearchName}
          placeholder="Pesquisar por nome do produto…"
          placeholderTextColor="#64748b"
          style={styles.searchInput}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
          <Text style={styles.toolbarGroupLabel}>Estado</Text>
          <Chip label="Todos" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
          <Chip label="Abertos" active={statusFilter === 'open'} onPress={() => setStatusFilter('open')} />
          <Chip label="Resolvidos" active={statusFilter === 'resolved'} onPress={() => setStatusFilter('resolved')} />
          <Text style={styles.toolbarGroupLabel}>Local</Text>
          <Chip label="Todos" active={locationFilter === 'all'} onPress={() => setLocationFilter('all')} />
          <Chip label="FRONT" active={locationFilter === 'FRONT'} onPress={() => setLocationFilter('FRONT')} />
          <Chip label="BACK" active={locationFilter === 'BACK'} onPress={() => setLocationFilter('BACK')} />
          <Text style={styles.toolbarGroupLabel}>Stock</Text>
          <Chip label="Todos" active={stockFilter === 'all'} onPress={() => setStockFilter('all')} />
          <Chip label="= 0" active={stockFilter === 'zero'} onPress={() => setStockFilter('zero')} />
          <Chip label="&gt; 0" active={stockFilter === 'positive'} onPress={() => setStockFilter('positive')} />
          <Text style={styles.toolbarGroupLabel}>Ordem</Text>
          <Chip label="Recentes" active={sortOrder === 'newest'} onPress={() => setSortOrder('newest')} />
          <Chip label="Antigos" active={sortOrder === 'oldest'} onPress={() => setSortOrder('oldest')} />
        </ScrollView>
        {issueTypes.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
            <Text style={styles.toolbarGroupLabel}>Tipo</Text>
            <Chip label="Todos" active={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
            <Chip
              label="Nome / Qtd (ambíguo)"
              active={typeFilter === 'ambiguous_pack'}
              onPress={() => setTypeFilter('ambiguous_pack')}
            />
            {issueTypes.map((t) => (
              <Chip key={t} label={labelIssueType(t)} active={typeFilter === t} onPress={() => setTypeFilter(t)} />
            ))}
          </ScrollView>
        )}
        <View style={styles.toolbarButtons}>
          <Pressable
            onPress={() => void runPdfExport(filteredIssues)}
            disabled={exportingPdf || loading}
            style={({ pressed }) => [
              styles.toolBtn,
              (exportingPdf || loading) && styles.toolBtnDisabled,
              pressed && !exportingPdf && !loading && styles.toolBtnPressed,
            ]}>
            <Text style={styles.toolBtnText}>{exportingPdf ? 'A gerar…' : 'Exportar PDF'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setReportsVisible(true)}
            style={({ pressed }) => [styles.toolBtnSecondary, pressed && styles.toolBtnSecondaryPressed]}>
            <Text style={styles.toolBtnSecondaryText}>Relatórios</Text>
          </Pressable>
          <Pressable
            onPress={() => void loadData()}
            disabled={loading}
            style={({ pressed }) => [styles.toolBtnSecondary, pressed && !loading && styles.toolBtnSecondaryPressed]}>
            <Text style={styles.toolBtnSecondaryText}>{loading ? 'A carregar…' : 'Atualizar'}</Text>
          </Pressable>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>A carregar issues e produtos…</Text>
        </View>
      )}
      {error && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {!loading && !error && filteredIssues.length === 0 && (
        <Text style={styles.emptyText}>Nenhum issue corresponde aos filtros.</Text>
      )}

      {!loading && filteredIssues.length > 0 && isWideLayout && (
        <View style={styles.tableWrap}>
          <ScrollView
            nestedScrollEnabled
            stickyHeaderIndices={[0]}
            style={styles.tableScroll}
            showsVerticalScrollIndicator>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <Text style={[styles.th, styles.colProduct]}>Produto</Text>
              <Text style={[styles.th, styles.colReason]}>Motivo</Text>
              <Text style={[styles.th, styles.colType]}>Tipo</Text>
              <Text style={[styles.th, styles.colStock]}>Stock</Text>
              <Text style={[styles.th, styles.colLoc]}>Local</Text>
              <Text style={[styles.th, styles.colDate]}>Criado em</Text>
              <Text style={[styles.th, styles.colState]}>Estado</Text>
              <Text style={[styles.th, styles.colActions]}>Acções</Text>
            </View>
            {filteredIssues.map((issue, index) => {
              const prod = productById[issue.product_id];
              const name = prod?.name ?? `#${issue.product_id}`;
              const note = issue.issue_note?.trim() ?? '';
              const reasonExpanded = expandedReasonIds.has(issue.id);
              const loc = formatLocationLabel(prod?.location ?? null);
              const stockVal = prod?.stock_quantity;
              return (
                <View
                  key={issue.id}
                  style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                  <View style={styles.colProduct}>
                    <Text style={styles.productName}>{name}</Text>
                    {prod?.sku ? <Text style={styles.productSku}>SKU {prod.sku}</Text> : null}
                  </View>
                  <View style={styles.colReason}>
                    <Text style={styles.reasonText} numberOfLines={reasonExpanded ? undefined : 2}>
                      {note || '—'}
                    </Text>
                    {note.length > 90 && (
                      <Pressable onPress={() => toggleReasonExpanded(issue.id)} hitSlop={8}>
                        <Text style={styles.verMais}>{reasonExpanded ? 'Ver menos' : 'Ver mais'}</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.colType}>
                    <Badge text={labelIssueType(issue.issue_type)} tone="slate" />
                  </View>
                  <View style={styles.colStock}>
                    <Text style={styles.stockValue}>{stockVal != null ? stockVal : '—'}</Text>
                  </View>
                  <View style={styles.colLoc}>
                    <Badge
                      text={loc}
                      tone={loc === 'FRONT' ? 'blue' : loc === 'BACK' ? 'amber' : 'neutral'}
                    />
                  </View>
                  <Text style={styles.colDateText}>{formatDateTime(issue.created_at)}</Text>
                  <View style={styles.colState}>
                    <Badge
                      text={labelStatus(issue.status)}
                      tone={isOpenStatus(issue.status) ? 'amber' : 'green'}
                    />
                  </View>
                  <View style={styles.colActions}>{renderRowActions(issue)}</View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!loading && filteredIssues.length > 0 && !isWideLayout && (
        <View style={styles.cardList}>
          {filteredIssues.map((issue) => {
            const prod = productById[issue.product_id];
            const name = prod?.name ?? `#${issue.product_id}`;
            const note = issue.issue_note?.trim() ?? '';
            const reasonExpanded = expandedReasonIds.has(issue.id);
            const loc = formatLocationLabel(prod?.location ?? null);
            const stockVal = prod?.stock_quantity;
            return (
              <View key={issue.id} style={styles.issueCard}>
                <View style={styles.issueCardTop}>
                  <Text style={styles.issueCardTitle}>{name}</Text>
                  <Text style={styles.issueCardStock}>{stockVal != null ? stockVal : '—'}</Text>
                </View>
                {prod?.sku ? <Text style={styles.issueCardSku}>SKU {prod.sku}</Text> : null}
                <View style={styles.issueCardChips}>
                  <Badge text={labelIssueType(issue.issue_type)} tone="slate" />
                  <Badge
                    text={loc}
                    tone={loc === 'FRONT' ? 'blue' : loc === 'BACK' ? 'amber' : 'neutral'}
                  />
                  <Badge
                    text={labelStatus(issue.status)}
                    tone={isOpenStatus(issue.status) ? 'amber' : 'green'}
                  />
                </View>
                <Text style={styles.issueCardMeta}>{formatDateTime(issue.created_at)}</Text>
                <Text style={styles.issueCardReason} numberOfLines={reasonExpanded ? undefined : 3}>
                  {note || '—'}
                </Text>
                {note.length > 120 && (
                  <Pressable onPress={() => toggleReasonExpanded(issue.id)}>
                    <Text style={styles.verMais}>{reasonExpanded ? 'Ver menos' : 'Ver mais'}</Text>
                  </Pressable>
                )}
                <View style={styles.issueCardActions}>{renderRowActions(issue)}</View>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={reportsVisible} transparent animationType="fade" onRequestClose={() => setReportsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReportsVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Relatórios de auditoria</Text>
            <Text style={styles.modalHint}>
              Escolha um relatório: aplicamos filtros à lista abaixo ou geramos PDF específico. Nenhum dado é alterado no
              servidor.
            </Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator>
              <Pressable
                style={styles.reportRow}
                onPress={() => {
                  setReportsVisible(false);
                  void runPdfExport(allIssues, [
                    'Nota: conjunto exportado = todos os issues carregados (independente dos filtros da grelha).',
                  ]);
                }}>
                <Text style={styles.reportRowTitle}>Resumo global (PDF)</Text>
                <Text style={styles.reportRowDesc}>Todos os issues + totais no cabeçalho</Text>
              </Pressable>
              <Pressable style={styles.reportRow} onPress={() => applyReportPreset('open')}>
                <Text style={styles.reportRowTitle}>Issues abertos</Text>
                <Text style={styles.reportRowDesc}>Filtro: estado aberto</Text>
              </Pressable>
              <Pressable style={styles.reportRow} onPress={() => applyReportPreset('resolved')}>
                <Text style={styles.reportRowTitle}>Issues resolvidos</Text>
                <Text style={styles.reportRowDesc}>Filtro: já revistos / corrigidos</Text>
              </Pressable>
              <Pressable style={styles.reportRow} onPress={() => applyReportPreset('location_front')}>
                <Text style={styles.reportRowTitle}>Por local — FRONT</Text>
                <Text style={styles.reportRowDesc}>Produtos com local FRONT</Text>
              </Pressable>
              <Pressable style={styles.reportRow} onPress={() => applyReportPreset('location_back')}>
                <Text style={styles.reportRowTitle}>Por local — BACK</Text>
                <Text style={styles.reportRowDesc}>Produtos com local BACK</Text>
              </Pressable>
              <Pressable
                style={styles.reportRow}
                onPress={() => {
                  setReportsVisible(false);
                  void exportByProductPdf();
                }}>
                <Text style={styles.reportRowTitle}>Issues por produto (PDF)</Text>
                <Text style={styles.reportRowDesc}>Lista ordenada por nome de produto</Text>
              </Pressable>
              <Pressable style={styles.reportRow} onPress={() => applyReportPreset('zero_stock')}>
                <Text style={styles.reportRowTitle}>Stock zero suspeito</Text>
                <Text style={styles.reportRowDesc}>Abertos com stock = 0</Text>
              </Pressable>
              <Pressable style={styles.reportRow} onPress={() => applyReportPreset('duplicate_ambiguous')}>
                <Text style={styles.reportRowTitle}>Revisão duplicados / ambíguos</Text>
                <Text style={styles.reportRowDesc}>Abre issues abertos; filtre por tipo nome/quantidade</Text>
              </Pressable>
              <Pressable style={styles.reportRow} onPress={() => applyReportPreset('photo')}>
                <Text style={styles.reportRowTitle}>Deteção por foto</Text>
                <Text style={styles.reportRowDesc}>Filtro: tipo photo_detected</Text>
              </Pressable>
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setReportsVisible(false)}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={detailIssue != null} transparent animationType="slide" onRequestClose={() => setDetailIssue(null)}>
        <View style={styles.detailOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDetailIssue(null)} />
          <Pressable style={styles.detailDrawer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailDrawerHandle} />
            <ScrollView showsVerticalScrollIndicator style={styles.detailScroll}>
              {detailIssue && (
                <>
                  <Text style={styles.detailTitle}>Detalhe do issue #{detailIssue.id}</Text>
                  <Text style={styles.detailProductName}>{detailProduct?.name ?? `#${detailIssue.product_id}`}</Text>
                  {detailProduct?.sku ? <Text style={styles.detailMuted}>SKU {detailProduct.sku}</Text> : null}
                  <View style={styles.detailChips}>
                    <Badge text={labelIssueType(detailIssue.issue_type)} tone="slate" />
                    <Badge
                      text={labelStatus(detailIssue.status)}
                      tone={isOpenStatus(detailIssue.status) ? 'amber' : 'green'}
                    />
                  </View>
                  <Text style={styles.detailSection}>Motivo (texto completo)</Text>
                  <Text style={styles.detailBody}>{detailIssue.issue_note?.trim() || '—'}</Text>
                  <Text style={styles.detailSection}>Stock e local</Text>
                  <Text style={styles.detailBody}>
                    Stock:{' '}
                    <Text style={styles.detailEm}>
                      {detailProduct?.stock_quantity != null ? detailProduct.stock_quantity : '—'}
                    </Text>
                    {' · '}
                    Local: {formatLocationLabel(detailProduct?.location ?? null)}
                  </Text>
                  <Text style={styles.detailSection}>Datas</Text>
                  <Text style={styles.detailBody}>Criado: {formatDateTime(detailIssue.created_at)}</Text>
                  {detailIssue.reviewed_at ? (
                    <Text style={styles.detailBody}>Revisto em: {formatDateTime(detailIssue.reviewed_at)}</Text>
                  ) : null}
                  {detailProduct && (
                    <>
                      <Text style={styles.detailSection}>Produto (campos úteis)</Text>
                      <Text style={styles.detailBody}>
                        Categoria: {detailProduct.category ?? '—'}
                        {'\n'}
                        Marca: {detailProduct.brand ?? '—'}
                        {'\n'}
                        Preço: {detailProduct.selling_price}
                        {detailProduct.source_type ? `\nOrigem: ${detailProduct.source_type}` : ''}
                      </Text>
                    </>
                  )}
                  <Text style={styles.detailSection}>Movimentos de stock (recentes)</Text>
                  {detailMovementsLoading && <ActivityIndicator color="#38bdf8" />}
                  {detailMovementsError && <Text style={styles.detailError}>{detailMovementsError}</Text>}
                  {!detailMovementsLoading &&
                    detailMovements.map((m) => (
                      <View key={m.id} style={styles.movementRow}>
                        <Text style={styles.movementLine}>
                          {formatDateTime(m.created_at)} · {MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type} ·{' '}
                          {m.quantity > 0 ? '+' : ''}
                          {m.quantity} ({m.previous_stock} → {m.new_stock})
                        </Text>
                        {m.reason ? <Text style={styles.movementReason}>{m.reason}</Text> : null}
                      </View>
                    ))}
                  {!detailMovementsLoading && detailMovements.length === 0 && !detailMovementsError && (
                    <Text style={styles.detailMuted}>Sem movimentos registados.</Text>
                  )}
                  <Text style={styles.detailSection}>Histórico de issues (mesmo produto)</Text>
                  {relatedIssuesForProduct.map((i) => (
                    <View key={i.id} style={styles.historyIssueRow}>
                      <Text style={styles.historyIssueLine}>
                        #{i.id} · {labelIssueType(i.issue_type)} · {labelStatus(i.status)}
                      </Text>
                      <Text style={styles.detailMuted}>{formatDateTime(i.created_at)}</Text>
                    </View>
                  ))}
                  <View style={styles.detailActions}>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/produto',
                          params: { id: String(detailIssue.product_id) },
                        })
                      }>
                      <Text style={styles.actionBtnText}>Ver produto</Text>
                    </Pressable>
                    {isOpenStatus(detailIssue.status) && (
                      <Pressable
                        style={styles.actionBtnResolve}
                        disabled={resolvingId === detailIssue.id}
                        onPress={() => handleResolveIssue(detailIssue.id)}>
                        <Text style={styles.actionBtnResolveText}>
                          {resolvingId === detailIssue.id ? 'A resolver…' : 'Resolver'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
            <Pressable style={styles.detailCloseFooter} onPress={() => setDetailIssue(null)}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
    marginTop: 4,
  },
  hero: {
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#94a3b8',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    minWidth: 100,
    flexGrow: 1,
    flexBasis: '28%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e2e8f0',
  },
  statOpen: { color: '#fbbf24' },
  statResolved: { color: '#4ade80' },
  statWarn: { color: '#fb923c' },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  toolbar: {
    gap: 10,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: '#f1f5f9',
    backgroundColor: '#020617',
  },
  toolbarScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    flexWrap: 'nowrap',
  },
  toolbarGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginRight: 4,
    textTransform: 'uppercase',
  },
  toolbarButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  toolBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: '#1d4ed8',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  toolBtnPressed: { opacity: 0.9 },
  toolBtnDisabled: { opacity: 0.5 },
  toolBtnText: { fontSize: 13, fontWeight: '700', color: '#eff6ff' },
  toolBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  toolBtnSecondaryPressed: { backgroundColor: '#334155' },
  toolBtnSecondaryText: { fontSize: 13, fontWeight: '700', color: '#e2e8f0' },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    maxWidth: 200,
  },
  chipActive: {
    borderColor: '#38bdf8',
    backgroundColor: '#0c4a6e',
  },
  chipPressed: { opacity: 0.85 },
  chipText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  chipTextActive: { color: '#e0f2fe' },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  loadingText: { color: '#94a3b8', fontSize: 13 },
  errorBanner: {
    padding: 12,
    borderRadius: 4,
    backgroundColor: '#450a0a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  errorBannerText: { color: '#fecaca', fontSize: 13 },
  emptyText: { color: '#94a3b8', fontSize: 14, paddingVertical: 16 },
  tableWrap: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    overflow: 'hidden',
    maxHeight: Platform.OS === 'web' ? 560 : 480,
    backgroundColor: '#020617',
  },
  tableScroll: {
    flexGrow: 0,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    minHeight: 56,
    backgroundColor: '#020617',
  },
  tableRowAlt: {
    backgroundColor: '#0f172a',
  },
  tableHeaderRow: {
    backgroundColor: '#1e293b',
    borderBottomColor: '#475569',
    minHeight: 44,
    zIndex: 2,
  },
  th: {
    fontSize: 10,
    fontWeight: '800',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  colProduct: { width: '18%', flexShrink: 0, borderRightWidth: 1, borderRightColor: '#334155', padding: 10 },
  colReason: { width: '20%', flexShrink: 0, borderRightWidth: 1, borderRightColor: '#334155', padding: 10 },
  colType: { width: '11%', flexShrink: 0, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#334155', padding: 8 },
  colStock: { width: '7%', flexShrink: 0, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: '#334155', padding: 8 },
  colLoc: { width: '7%', flexShrink: 0, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#334155', padding: 8 },
  colDate: { width: '13%', flexShrink: 0, borderRightWidth: 1, borderRightColor: '#334155', padding: 10 },
  colDateText: {
    width: '13%',
    flexShrink: 0,
    fontSize: 12,
    color: '#cbd5e1',
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  colState: { width: '9%', flexShrink: 0, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#334155', padding: 8 },
  colActions: { width: '15%', flexShrink: 0, padding: 8, justifyContent: 'center' },
  productName: { fontSize: 15, fontWeight: '700', color: '#f8fafc', lineHeight: 20 },
  productSku: { marginTop: 4, fontSize: 11, color: '#64748b', fontWeight: '600' },
  reasonText: { fontSize: 13, color: '#cbd5e1', lineHeight: 18 },
  verMais: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#38bdf8' },
  stockValue: { fontSize: 18, fontWeight: '800', color: '#fbbf24' },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    maxWidth: '100%',
  },
  badge_neutral: { backgroundColor: '#1e293b', borderColor: '#475569' },
  badge_blue: { backgroundColor: '#172554', borderColor: '#3b82f6' },
  badge_green: { backgroundColor: '#14532d', borderColor: '#22c55e' },
  badge_amber: { backgroundColor: '#422006', borderColor: '#d97706' },
  badge_slate: { backgroundColor: '#1e293b', borderColor: '#64748b' },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  badgeText_neutral: { color: '#e2e8f0' },
  badgeText_blue: { color: '#bfdbfe' },
  badgeText_green: { color: '#bbf7d0' },
  badgeText_amber: { color: '#fde68a' },
  badgeText_slate: { color: '#cbd5e1' },
  actionsCol: { gap: 6 },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#1e3a8a',
    borderWidth: 1,
    borderColor: '#3b82f6',
    alignItems: 'center',
  },
  actionBtnPressed: { opacity: 0.88 },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#dbeafe' },
  actionBtnSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
  },
  actionBtnSecondaryPressed: { backgroundColor: '#334155' },
  actionBtnSecondaryText: { fontSize: 11, fontWeight: '700', color: '#e2e8f0' },
  actionBtnResolve: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#14532d',
    borderWidth: 1,
    borderColor: '#22c55e',
    alignItems: 'center',
  },
  actionBtnResolvePressed: { opacity: 0.9 },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnResolveText: { fontSize: 11, fontWeight: '700', color: '#dcfce7' },
  cardList: { gap: 12 },
  issueCard: {
    padding: 14,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  issueCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  issueCardTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#f8fafc', lineHeight: 22 },
  issueCardStock: { fontSize: 22, fontWeight: '900', color: '#fbbf24' },
  issueCardSku: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  issueCardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  issueCardMeta: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  issueCardReason: { fontSize: 13, color: '#cbd5e1', lineHeight: 20 },
  issueCardActions: { marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 16,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  modalSheet: {
    maxHeight: '85%' as const,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#f1f5f9' },
  modalHint: { marginTop: 8, fontSize: 12, color: '#94a3b8', lineHeight: 18 },
  modalScroll: { maxHeight: 360, marginTop: 12 },
  reportRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  reportRowTitle: { fontSize: 14, fontWeight: '700', color: '#e2e8f0' },
  reportRowDesc: { marginTop: 4, fontSize: 12, color: '#94a3b8' },
  modalClose: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: '#1e293b',
  },
  modalCloseText: { fontSize: 14, fontWeight: '700', color: '#e2e8f0' },
  detailDrawer: {
    width: '100%' as const,
    maxWidth: 440,
    maxHeight: '100%' as const,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailDrawerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    marginTop: 8,
    marginBottom: 4,
  },
  detailScroll: { paddingHorizontal: 16, paddingBottom: 16 },
  detailTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  detailProductName: { marginTop: 8, fontSize: 18, fontWeight: '800', color: '#f8fafc', lineHeight: 24 },
  detailMuted: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  detailChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  detailSection: {
    marginTop: 16,
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailBody: { marginTop: 6, fontSize: 14, color: '#e2e8f0', lineHeight: 22 },
  detailEm: { fontWeight: '900', color: '#fbbf24' },
  detailError: { color: '#fecaca', marginTop: 8 },
  movementRow: {
    marginTop: 8,
    padding: 10,
    borderRadius: 4,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  movementLine: { fontSize: 12, color: '#cbd5e1', fontWeight: '600' },
  movementReason: { marginTop: 4, fontSize: 12, color: '#94a3b8' },
  historyIssueRow: {
    marginTop: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  historyIssueLine: { fontSize: 13, fontWeight: '600', color: '#e2e8f0' },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  detailCloseFooter: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    backgroundColor: '#020617',
  },
});
