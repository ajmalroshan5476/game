import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  StatusBar,
} from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EditTicketModal } from '../components/EditTicketModal';
import { colors } from '../theme/colors';
import {
  ArrowLeft,
  Home,
  ChevronDown,
  Check,
  TrendingUp,
  Award,
  Layers,
  Hash,
  DollarSign,
  Receipt,
  CheckSquare,
  Square,
  Filter,
  User,
  Clock,
  Trash2,
  Edit3,
  History,
  AlertCircle,
  Calendar,
} from 'lucide-react-native';

export type ReportType = 'sales' | 'winnings' | 'bill-wise' | 'number-wise' | 'net-pay' | 'ticket-history';

// Helper to format date cleanly: YYYY-MM-DD
const formatBillDate = (drawDate?: any, createdAt?: any) => {
  if (drawDate) {
    if (typeof drawDate === 'string') {
      return drawDate.split('T')[0];
    }
    try {
      return new Date(drawDate).toISOString().split('T')[0];
    } catch {
      return String(drawDate);
    }
  }
  if (createdAt) {
    if (typeof createdAt === 'string') {
      return createdAt.split('T')[0];
    }
    try {
      return new Date(createdAt).toISOString().split('T')[0];
    } catch {
      return String(createdAt);
    }
  }
  return '';
};

// Helper to sort entries: numbers descending, BOX before SUPER
const getSortedEntries = (entries: any[]) => {
  if (!entries || !Array.isArray(entries)) return [];
  return [...entries].sort((a, b) => {
    const numA = parseInt(a.number, 10);
    const numB = parseInt(b.number, 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numB - numA;
    }
    if (a.number !== b.number) {
      return String(b.number).localeCompare(String(a.number));
    }
    const isBoxA = a.is_box || (a.mode || '').toUpperCase() === 'BOX';
    const isBoxB = b.is_box || (b.mode || '').toUpperCase() === 'BOX';
    if (isBoxA && !isBoxB) return -1;
    if (!isBoxA && isBoxB) return 1;
    return 0;
  });
};

// Helper to format date/time like screenshot: 'Oct 30, 9:02 AM'
const formatBillTime = (dateString: string) => {
  try {
    const d = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
  } catch {
    return dateString;
  }
};

const formatBillGame = (item: any) => {
  if (item.game_code && item.game_code !== 'ALL') return item.game_code;
  const name = item.game_name || '';
  const numMatch = name.match(/(\d+)/);
  const num = numMatch ? numMatch[1] : '1';
  if (name.toUpperCase().includes('LSK')) return `LSK${num}`;
  return `DEAR${num}`;
};

const formatEntryCategory = (entry: any, item: any) => {
  const gCode = formatBillGame(item);
  const numMatch = gCode.match(/(\d+)/);
  const drawNum = numMatch ? numMatch[1] : '1';
  const isLsk = gCode.includes('LSK');
  const prefix = isLsk ? 'LSK' : 'DEAR';
  const boxPrefix = isLsk ? 'L-BOX' : 'D-BOX';

  const mode = (entry.mode || '').toUpperCase();
  if (mode === 'BOX' || entry.is_box) {
    return `${boxPrefix}-${drawNum}`;
  } else if (mode === 'SUPER' || mode === 'MAIN') {
    return `${prefix}-${drawNum}`;
  } else if (['AB', 'BC', 'AC', 'A', 'B', 'C'].includes(mode)) {
    return `${prefix}-${mode}-${drawNum}`;
  }
  return `${prefix}-${drawNum}`;
};

interface SalesBillCardProps {
  item: any;
  idx: number;
}

const SalesBillCard: React.FC<SalesBillCardProps> = React.memo(({ item, idx }) => {
  const billGame = useMemo(() => formatBillGame(item), [item]);
  const billTime = useMemo(() => formatBillTime(item.created_at), [item.created_at]);
  const billDate = useMemo(() => formatBillDate(item.draw_date, item.created_at), [item.draw_date, item.created_at]);
  const totalPriceStr = useMemo(() => parseFloat(item.total_amount || 0).toFixed(2), [item.total_amount]);
  const sortedEntries = useMemo(() => getSortedEntries(item.entries), [item.entries]);

  return (
    <View key={item.id || idx}>
      {idx > 0 && <View style={styles.billDivider} />}
      <View style={styles.billDetailedContainer}>
        {/* Screenshot Blue Header Bar */}
        <View style={styles.billBlueHeader}>
          {/* Left Column */}
          <View style={{ flex: 1.2 }}>
            <Text style={styles.billHeaderNumber}>Bill #{item.ticket_number},</Text>
            <Text style={styles.billHeaderTime}>{billTime}</Text>
          </View>

          {/* Center Column */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.billHeaderGame}>{billGame}</Text>
            <Text style={styles.billHeaderCount}>Count: {item.total_quantity}</Text>
          </View>

          {/* Right Column */}
          <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
            <Text style={styles.billHeaderDate}>{billDate}</Text>
            <Text style={styles.billHeaderPrice}>Price: {totalPriceStr}</Text>
            <Text style={styles.billHeaderComm}>Commition: 0.00</Text>
          </View>
        </View>

        {/* Screenshot Table Rows */}
        <View style={styles.billTable}>
          {sortedEntries.length === 0 ? (
            <View style={styles.billTableRow}>
              <Text style={[styles.billTableCell, { flex: 1, textAlign: 'center', color: '#94A3B8' }]}>
                No entries recorded for this bill
              </Text>
            </View>
          ) : (
            sortedEntries.map((entry: any, eIdx: number) => {
              const catLabel = formatEntryCategory(entry, item);
              const entryPrice = entry.total_price
                ? parseFloat(entry.total_price).toFixed(2)
                : entry.unit_price
                ? (entry.quantity * parseFloat(entry.unit_price)).toFixed(2)
                : (entry.quantity * 10).toFixed(2);

              return (
                <View key={eIdx} style={styles.billTableRow}>
                  <Text style={[styles.billTableCell, styles.billColCat]}>{catLabel}</Text>
                  <Text style={[styles.billTableCell, styles.billColNum]}>{entry.number}</Text>
                  <Text style={[styles.billTableCell, styles.billColCount]}>{entry.quantity}</Text>
                  <Text style={[styles.billTableCell, styles.billColPrice]}>{entryPrice}</Text>
                </View>
              );
            })
          )}
        </View>
      </View>
    </View>
  );
});

interface TicketHistoryBillCardProps {
  item: any;
  idx: number;
  isAdmin: boolean;
  cancellingTicketNum: string | null;
  onEditTicket: (t: any) => void;
  onCancelTicket: (t: any) => void;
}

const TicketHistoryBillCard: React.FC<TicketHistoryBillCardProps> = React.memo(({
  item,
  idx,
  isAdmin,
  cancellingTicketNum,
  onEditTicket,
  onCancelTicket,
}) => {
  const billGame = useMemo(() => formatBillGame(item), [item]);
  const billTime = useMemo(() => formatBillTime(item.created_at), [item.created_at]);
  const billDate = useMemo(() => formatBillDate(item.draw_date, item.created_at), [item.draw_date, item.created_at]);
  const totalPriceStr = useMemo(() => parseFloat(item.total_amount || 0).toFixed(2), [item.total_amount]);
  const sortedEntries = useMemo(() => getSortedEntries(item.entries), [item.entries]);
  const isCancelled = item.status === 'CANCELLED';
  const isResulted = item.draw_status === 'RESULTED';
  const isCutoff = item.isCutoffPassed;
  const canModify = !isCancelled && !isResulted && (isAdmin || !isCutoff);

  return (
    <View key={item.id || idx}>
      {idx > 0 && <View style={styles.billDivider} />}
      <View style={styles.billDetailedContainer}>
        {/* Blue Header Bar matching screenshot */}
        <View style={styles.billBlueHeader}>
          <View style={{ flex: 1.2 }}>
            <Text style={styles.billHeaderNumber}>Bill #{item.ticket_number},</Text>
            <Text style={styles.billHeaderTime}>{billTime}</Text>
            {item.seller_username && (
              <Text style={styles.ticketHistorySeller}>Seller: {item.seller_username}</Text>
            )}
          </View>

          <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
            <View
              style={[
                styles.billGameBadge,
                item.game_color ? { backgroundColor: item.game_color } : {},
              ]}
            >
              <Text style={styles.billGameBadgeText}>{billGame}</Text>
            </View>
            <View
              style={[
                styles.statusBadgeSmall,
                isCancelled ? styles.statusBadgeCancelled : styles.statusBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeSmallText,
                  isCancelled ? { color: '#DC2626' } : { color: '#059669' },
                ]}
              >
                {item.status}
              </Text>
            </View>
          </View>
        </View>

        {/* Customer Row */}
        {item.customer_name ? (
          <View style={styles.billCustomerRow}>
            <Text style={styles.billCustomerLabel}>Customer: </Text>
            <Text style={styles.billCustomerName}>{item.customer_name}</Text>
          </View>
        ) : null}

        {/* Entries Table */}
        <View style={styles.billTableHead}>
          <Text style={[styles.billColHead, { flex: 1.2 }]}>Category</Text>
          <Text style={[styles.billColHead, { flex: 1 }]}>Number</Text>
          <Text style={[styles.billColHead, { flex: 0.8, textAlign: 'center' }]}>Count</Text>
          <Text style={[styles.billColHead, { flex: 1, textAlign: 'right' }]}>Total (₹)</Text>
        </View>

        {sortedEntries.map((entry: any, eIdx: number) => {
          const entryCategory = formatEntryCategory(entry, item);
          const entryPriceStr = parseFloat(entry.total_price || 0).toFixed(2);
          return (
            <View key={entry.id || eIdx} style={styles.billTableRow}>
              <Text style={[styles.billColCell, { flex: 1.2 }]}>{entryCategory}</Text>
              <Text style={[styles.billColCell, styles.billCellBold, { flex: 1 }]}>{entry.number}</Text>
              <Text style={[styles.billColCell, { flex: 0.8, textAlign: 'center' }]}>{entry.quantity}</Text>
              <Text style={[styles.billColCell, styles.billCellBold, { flex: 1, textAlign: 'right' }]}>
                {entryPriceStr}
              </Text>
            </View>
          );
        })}

        {/* Card Footer: Totals and Actions */}
        <View style={styles.ticketHistoryFooter}>
          <View style={{ flex: 1 }}>
            <Text style={styles.billFooterMeta}>
              Total Count: <Text style={styles.billCellBold}>{item.total_quantity}</Text>
            </Text>
            <Text style={styles.billFooterTotal}>
              Total: ₹{totalPriceStr}
            </Text>
          </View>

          {/* Admin Actions: Edit & Cancel */}
          {canModify && (
            <View style={styles.ticketHistoryActionRow}>
              <TouchableOpacity
                style={styles.historyEditBtn}
                activeOpacity={0.8}
                onPress={() => onEditTicket(item)}
              >
                <Edit3 size={13} color="#FFFFFF" />
                <Text style={styles.historyActionBtnText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.historyCancelBtn}
                activeOpacity={0.8}
                disabled={cancellingTicketNum === item.ticket_number}
                onPress={() => onCancelTicket(item)}
              >
                {cancellingTicketNum === item.ticket_number ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Trash2 size={13} color="#FFFFFF" />
                    <Text style={styles.historyActionBtnText}>Cancel</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

interface ReportsScreenProps {
  onBack: () => void;
  initialTab?: ReportType;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ onBack, initialTab }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [reportType, setReportType] = useState<ReportType>(initialTab || 'sales');

  // Filter States
  const [games, setGames] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState('ALL'); // Game / Ticket filter
  const todayStr = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [singleDate, setSingleDate] = useState(todayStr);
  const [ticketNumber, setTicketNumber] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedMode, setSelectedMode] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [groupWithoutTicketName, setGroupWithoutTicketName] = useState(false);

  // Admin User Filter
  const [users, setUsers] = useState<any[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>('ALL');

  // Dropdown Modals
  const [pickerType, setPickerType] = useState<'ticket' | 'group' | 'mode' | 'user' | 'status' | null>(null);

  // Toggle filters visibility (open by default so users choose what they want before loading)
  const [showFilters, setShowFilters] = useState(true);

  // Report Data & Tab Cache (Instant 0ms switching with SWR)
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const reportsCacheRef = React.useRef<Record<string, any>>({});

  // Ticket Editing & Cancellation States
  const [editingTicket, setEditingTicket] = useState<any | null>(null);
  const [userPrices, setUserPrices] = useState<any[]>([]);
  const [cancellingTicketNum, setCancellingTicketNum] = useState<string | null>(null);

  useEffect(() => {
    loadGames();
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  // When switching between report tabs, restore cached data if already generated, or keep clean
  useEffect(() => {
    const baseParams: any = {};
    if (selectedTicket && selectedTicket !== 'ALL') baseParams.gameId = selectedTicket;
    if (ticketNumber.trim()) baseParams.ticketNumber = ticketNumber.trim();
    if (selectedGroup && selectedGroup !== 'ALL' && selectedGroup !== 'Select') baseParams.group = selectedGroup;
    if (selectedMode && selectedMode !== 'ALL') baseParams.mode = selectedMode;
    if (targetUserId && targetUserId !== 'ALL') baseParams.targetUserId = targetUserId;
    if (selectedStatus && selectedStatus !== 'ALL') baseParams.status = selectedStatus;
    if (reportType === 'sales' || reportType === 'winnings' || reportType === 'ticket-history') {
      baseParams.fromDate = fromDate;
      baseParams.toDate = toDate;
    } else if (reportType === 'bill-wise' || reportType === 'number-wise') {
      baseParams.date = singleDate;
    } else if (reportType === 'net-pay') {
      baseParams.fromDate = fromDate;
      baseParams.toDate = toDate;
    }

    const cacheKey = `${reportType}:${JSON.stringify(baseParams)}`;
    if (reportsCacheRef.current[cacheKey]) {
      setData(reportsCacheRef.current[cacheKey]);
    } else {
      setData(null);
    }
  }, [reportType]);

  const loadGames = async () => {
    try {
      const res = await api.getGames();
      setGames(res.games || []);
    } catch {}
  };

  const loadUsers = async () => {
    try {
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (err) {
      console.warn('Failed to load users for filter:', err);
    }
  };

  const handleSyncDates = () => {
    // Clicking the '=' button syncs To date to From date or sets both to Today
    setToDate(fromDate);
  };

  const handleSetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setFromDate(today);
    setToDate(today);
    setSingleDate(today);
  };

  const handleSetYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yStr = y.toISOString().split('T')[0];
    setFromDate(yStr);
    setToDate(yStr);
    setSingleDate(yStr);
  };

  const getModeOptions = (grp: string) => {
    if (grp === '1') return ['ALL', 'A', 'B', 'C'];
    if (grp === '2') return ['ALL', 'AB', 'AC', 'BC'];
    if (grp === '3') return ['ALL', 'BOX', 'SUPER'];
    return ['ALL', 'A', 'B', 'C', 'AB', 'AC', 'BC', 'BOX', 'SUPER'];
  };

  const handleSelectGroup = (grp: string) => {
    setSelectedGroup(grp);
    const validModes = getModeOptions(grp);
    if (!validModes.includes(selectedMode)) {
      setSelectedMode('ALL');
    }
    setPickerType(null);
  };

  const fetchReport = async (forceRefresh = false) => {
    const baseParams: any = {};
    if (selectedTicket && selectedTicket !== 'ALL') baseParams.gameId = selectedTicket;
    if (ticketNumber.trim()) baseParams.ticketNumber = ticketNumber.trim();
    if (selectedGroup && selectedGroup !== 'ALL' && selectedGroup !== 'Select') {
      baseParams.group = selectedGroup;
    }
    if (selectedMode && selectedMode !== 'ALL') {
      baseParams.mode = selectedMode;
    }
    if (targetUserId && targetUserId !== 'ALL') {
      baseParams.targetUserId = targetUserId;
    }
    if (selectedStatus && selectedStatus !== 'ALL') {
      baseParams.status = selectedStatus;
    }

    if (reportType === 'sales' || reportType === 'winnings' || reportType === 'ticket-history') {
      baseParams.fromDate = fromDate;
      baseParams.toDate = toDate;
    } else if (reportType === 'bill-wise') {
      baseParams.date = singleDate;
    } else if (reportType === 'number-wise') {
      baseParams.date = singleDate;
      if (groupWithoutTicketName) baseParams.groupWithoutTicketName = 'true';
    } else if (reportType === 'net-pay') {
      baseParams.fromDate = fromDate;
      baseParams.toDate = toDate;
      baseParams.date = fromDate || singleDate;
    }

    const cacheKey = `${reportType}:${JSON.stringify(baseParams)}`;
    const existingCache = reportsCacheRef.current[cacheKey];

    // If cached data exists and not forcing refresh, render instantly with zero buffering!
    if (existingCache && !forceRefresh) {
      setData(existingCache);
      setLoading(false);
      return;
    }

    // Tab switch or new filter without cache: clear stale tab data and show loading spinner
    if (!existingCache) {
      setData(null);
      setLoading(true);
    }

    try {
      let res: any = null;
      if (reportType === 'sales') {
        res = await api.getSalesReport(baseParams, forceRefresh);
      } else if (reportType === 'winnings') {
        res = await api.getWinningsReport(baseParams, forceRefresh);
      } else if (reportType === 'bill-wise') {
        res = await api.getBillWiseReport(baseParams, forceRefresh);
      } else if (reportType === 'number-wise') {
        res = await api.getNumberWiseReport(baseParams, forceRefresh);
      } else if (reportType === 'net-pay') {
        res = await api.getNetPayReport(baseParams, forceRefresh);
      } else if (reportType === 'ticket-history') {
        baseParams.limit = 100;
        res = await api.getTickets(baseParams, forceRefresh);
      }

      if (res) {
        reportsCacheRef.current[cacheKey] = res;
        setData(res);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelHistoryTicket = (t: any) => {
    if (!t) return;
    Alert.alert(
      'Confirm Cancellation',
      `Cancel Ticket #${t.ticket_number}?\n\nThis will release booked number allocations and reverse sales liability for seller ${t.seller_username || ''}.`,
      [
        { text: 'No, Keep Ticket', style: 'cancel' },
        {
          text: 'Yes, Cancel Ticket',
          style: 'destructive',
          onPress: async () => {
            setCancellingTicketNum(t.ticket_number);
            try {
              await api.cancelTicket(t.ticket_number);
              Alert.alert('Success', `Ticket #${t.ticket_number} has been cancelled.`);
              fetchReport(true);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel ticket');
            } finally {
              setCancellingTicketNum(null);
            }
          },
        },
      ]
    );
  };

  const handleEditTicket = useCallback(async (item: any) => {
    try {
      const pRes = await api.getUserPrices(item.user_id);
      setUserPrices(pRes.prices || []);
    } catch {}
    setEditingTicket(item);
  }, []);

  // Screen Title based on screenshot
  const getHeaderTitle = () => {
    switch (reportType) {
      case 'sales':
        return 'Sales Report Detailed';
      case 'winnings':
        return 'Winning Report';
      case 'bill-wise':
        return 'Winning Report (Bill Wise)';
      case 'number-wise':
        return 'Number Wise Report';
      case 'net-pay':
        return 'Net Pay';
      case 'ticket-history':
        return 'Ticket History';
    }
  };

  const isOrangeButton = reportType === 'sales' || reportType === 'winnings' || reportType === 'bill-wise' || reportType === 'ticket-history';
  const buttonColor = isOrangeButton ? '#FF5722' : '#007BFF';
  const buttonText = reportType === 'bill-wise' || reportType === 'ticket-history' ? 'Search' : 'Generate Report';

  return (
    <View style={styles.container}>
      {/* Top Header replicating reference screenshots */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setShowFilters(!showFilters)}
            accessibilityLabel="Filter Options"
          >
            <Filter size={20} color={showFilters ? '#0080FF' : '#475569'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
            <Home size={22} color="#E53935" fill="#E53935" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sub-tab switcher to switch between the report screens */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {[
            { id: 'sales', label: 'Sales' },
            { id: 'winnings', label: 'Winning' },
            { id: 'bill-wise', label: 'Bill Wise' },
            { id: 'number-wise', label: 'Number Wise' },
            { id: 'net-pay', label: 'Net Pay' },
            ...(isAdmin ? [{ id: 'ticket-history', label: 'Ticket History' }] : []),
          ].map((t) => {
            const active = reportType === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabItem, active && styles.tabItemActive]}
                onPress={() => setReportType(t.id as ReportType)}
              >
                <Text style={[styles.tabItemText, active && styles.tabItemTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* REPLICATED FILTER CARD (Exact layout from screenshots - toggleable) */}
        {showFilters && (
          <View style={styles.filterCard}>
            {/* Row 0: Users Under Admin (Seller) for Admin */}
            {isAdmin && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>User Under Admin (Seller)</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setPickerType('user')}
                >
                  <Text style={styles.dropdownBtnText}>
                    {targetUserId === 'ALL'
                      ? 'ALL (All Users)'
                      : users.find((u) => u.id === targetUserId)?.username || targetUserId}
                  </Text>
                  <ChevronDown size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
            )}

            {/* Row 1: Ticket / Game Dropdown */}
            <Text style={styles.fieldLabel}>
              {reportType === 'bill-wise' ? 'Draw Time' : 'Ticket'}
            </Text>
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setPickerType('ticket')}
            >
              <Text style={styles.dropdownBtnText}>
                {selectedTicket === 'ALL'
                  ? 'ALL'
                  : games.find((g) => g.id === selectedTicket || g.name === selectedTicket)?.name || selectedTicket}
              </Text>
              <ChevronDown size={18} color="#64748B" />
            </TouchableOpacity>

            {/* Row 2: Date Inputs */}
            {reportType === 'bill-wise' || reportType === 'number-wise' ? (
              // Single Date layout
              <View style={styles.dateBlockSingle}>
                <Text style={styles.fieldLabel}>Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={singleDate}
                  onChangeText={setSingleDate}
                  placeholder="2026-10-25"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            ) : (
              // From / To layout with '=' button in between
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>From</Text>
                  <TextInput
                    style={[styles.textInput, { textAlign: 'center' }]}
                    value={fromDate}
                    onChangeText={setFromDate}
                    placeholder="2026-10-25"
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                {/* '=' Sync Button matching screenshot */}
                <TouchableOpacity
                  style={[
                    styles.equalButton,
                    { backgroundColor: reportType === 'net-pay' ? '#007BFF' : '#FF5722' },
                  ]}
                  activeOpacity={0.8}
                  onPress={handleSyncDates}
                >
                  <Text style={styles.equalButtonText}>=</Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>To</Text>
                  <TextInput
                    style={[styles.textInput, { textAlign: 'center' }]}
                    value={toDate}
                    onChangeText={setToDate}
                    placeholder="2026-10-25"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            )}

            {/* Quick Date Presets */}
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                style={[
                  styles.quickDateBtn,
                  fromDate === todayStr && toDate === todayStr && styles.quickDateBtnActive,
                ]}
                onPress={handleSetToday}
              >
                <Text
                  style={[
                    styles.quickDateBtnText,
                    fromDate === todayStr && toDate === todayStr && styles.quickDateBtnTextActive,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickDateBtn}
                onPress={handleSetYesterday}
              >
                <Text style={styles.quickDateBtnText}>Yesterday</Text>
              </TouchableOpacity>
            </View>

            {/* Row 3: Ticket Number (Optional) */}
            <Text style={styles.fieldLabel}>Ticket Number / Search</Text>
            <TextInput
              style={styles.textInput}
              value={ticketNumber}
              onChangeText={setTicketNumber}
              placeholder={reportType === 'bill-wise' ? 'Optional' : 'Ticket Number or Customer'}
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
            />

            {/* Row 4: Group & Mode */}
            <View style={styles.twoColRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Group</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setPickerType('group')}
                >
                  <Text style={styles.dropdownBtnText}>{selectedGroup}</Text>
                  <ChevronDown size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Mode</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setPickerType('mode')}
                >
                  <Text style={styles.dropdownBtnText}>{selectedMode}</Text>
                  <ChevronDown size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Row 5: Status filter for Ticket History */}
            {reportType === 'ticket-history' && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>Ticket Status</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setPickerType('status')}
                >
                  <Text style={styles.dropdownBtnText}>
                    {selectedStatus === 'ALL' ? 'ALL Status' : selectedStatus}
                  </Text>
                  <ChevronDown size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
            )}

            {/* Optional Checkbox for Number Wise Report */}
            {reportType === 'number-wise' && (
              <TouchableOpacity
                style={styles.checkboxRow}
                activeOpacity={0.8}
                onPress={() => setGroupWithoutTicketName(!groupWithoutTicketName)}
              >
                {groupWithoutTicketName ? (
                  <CheckSquare size={18} color="#007BFF" />
                ) : (
                  <Square size={18} color="#94A3B8" />
                )}
                <Text style={styles.checkboxLabel}>Group without ticket name</Text>
              </TouchableOpacity>
            )}

            {/* Main Action Button (Generate Report / Search) */}
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: buttonColor }]}
              activeOpacity={0.85}
              onPress={() => {
                fetchReport(true);
              }}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>{buttonText}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* REAL-TIME DATA DISPLAY AREA */}
        <View style={styles.resultsArea}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.emerald} style={{ marginTop: 24 }} />
          ) : !data ? (
            <View style={styles.promptCard}>
              <Filter size={32} color={buttonColor} style={{ marginBottom: 10 }} />
              <Text style={styles.promptTitle}>Ready to Generate Report</Text>
              <Text style={styles.promptSubtitle}>
                Select your desired game, date range, or seller above and tap "{buttonText}" to load data.
              </Text>
            </View>
          ) : (
            <>
              {/* 1. SALES REPORT REAL-TIME DATA (Pixel-perfect replication of reference screenshot) */}
              {reportType === 'sales' && data && (
                <View style={{ width: '100%' }}>
                  {showFilters && (
                    <View style={styles.summaryBanner}>
                      <View style={styles.summaryStat}>
                        <Text style={styles.summaryStatLabel}>Total Bills</Text>
                        <Text style={styles.summaryStatVal}>{data.summary?.total_bills || 0}</Text>
                      </View>
                      <View style={styles.summaryStat}>
                        <Text style={styles.summaryStatLabel}>Total Quantity</Text>
                        <Text style={styles.summaryStatVal}>{data.summary?.total_quantity || 0}</Text>
                      </View>
                      <View style={styles.summaryStat}>
                        <Text style={styles.summaryStatLabel}>Total Sales</Text>
                        <Text style={[styles.summaryStatVal, { color: colors.emeraldDark }]}>
                          ₹{data.summary?.total_sales || 0}
                        </Text>
                      </View>
                    </View>
                  )}

                  {(!data.items || data.items.length === 0) ? (
                    <Text style={styles.noData}>No sales tickets found for the selected filters.</Text>
                  ) : (
                    data.items.map((item: any, idx: number) => (
                      <SalesBillCard key={item.id || idx} item={item} idx={idx} />
                    ))
                  )}
                </View>
              )}

              {/* 2. WINNING REPORT REAL-TIME DATA */}
              {reportType === 'winnings' && data && (
                <View>
                  <View style={styles.summaryBanner}>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatLabel}>Winning Entries</Text>
                      <Text style={styles.summaryStatVal}>{data.summary?.totalWinningEntries || 0}</Text>
                    </View>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatLabel}>Total Prize</Text>
                      <Text style={[styles.summaryStatVal, { color: colors.emeraldDark }]}>
                        ₹{data.summary?.totalPrize || 0}
                      </Text>
                    </View>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatLabel}>Super Commission</Text>
                      <Text style={[styles.summaryStatVal, { color: '#2563EB' }]}>
                        ₹{data.summary?.totalCommission || 0}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.resultsHeading}>
                    MATCHING WINNING ENTRIES ({data.items?.length || 0})
                  </Text>

                  {(!data.items || data.items.length === 0) ? (
                    <Text style={styles.noData}>No winning tickets recorded for these dates.</Text>
                  ) : (
                    <View style={styles.excelTableContainer}>
                      {/* Excel Header */}
                      <View style={styles.excelTableHeader}>
                        <Text style={[styles.excelHeaderCell, { flex: 0.8 }]}>WIN NUM</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1 }]}>POS</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 0.8 }]}>MODE</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.1 }]}>BILL #</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 0.6 }]}>QTY</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.1 }]}>PRIZE</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1, borderRightWidth: 0 }]}>SUPER</Text>
                      </View>
                      {/* Excel Rows */}
                      {data.items.map((w: any, idx: number) => (
                        <View key={w.id || idx} style={styles.excelTableRow}>
                          <Text style={[styles.excelTableCell, { flex: 0.8, fontWeight: '800' }]}>{w.winning_number}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1, color: colors.emeraldDark, fontWeight: '700' }]}>{w.prize_position}</Text>
                          <Text style={[styles.excelTableCell, { flex: 0.8 }]}>{w.mode}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.1, fontSize: 11 }]}>{w.ticket_number}</Text>
                          <Text style={[styles.excelTableCell, { flex: 0.6 }]}>{w.quantity}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.1, fontWeight: '700', color: '#047857' }]}>₹{w.prize_amount}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1, borderRightWidth: 0, color: '#2563EB', fontWeight: '700' }]}>₹{w.commission_amount}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* 3. WINNING REPORT (BILL WISE) - Excel Table */}
              {reportType === 'bill-wise' && data && (
                <View>
                  <Text style={styles.resultsHeading}>
                    WINNING BILLS ({data.length || 0})
                  </Text>
                  {(!Array.isArray(data) || data.length === 0) ? (
                    <Text style={styles.noData}>No winning bills found.</Text>
                  ) : (
                    <View style={styles.excelTableContainer}>
                      <View style={styles.excelTableHeader}>
                        <Text style={[styles.excelHeaderCell, { flex: 1.2 }]}>BILL #</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.5 }]}>GAME & DRAW</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 0.7 }]}>HITS</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.2 }]}>PRIZE (₹)</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.1, borderRightWidth: 0 }]}>COMM (₹)</Text>
                      </View>
                      {data.map((b: any, idx: number) => (
                        <View key={b.ticket_id || idx} style={styles.excelTableRow}>
                          <Text style={[styles.excelTableCell, { flex: 1.2, fontWeight: '800' }]}>{b.ticket_number}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.5, fontSize: 11 }]}>{b.game_name} ({b.draw_time})</Text>
                          <Text style={[styles.excelTableCell, { flex: 0.7, fontWeight: '700' }]}>{b.winning_entries_count}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.2, fontWeight: '700', color: '#047857' }]}>₹{b.total_bill_prize}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.1, borderRightWidth: 0, color: '#2563EB', fontWeight: '700' }]}>₹{b.total_bill_commission}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* 4. NUMBER WISE REPORT - Excel Table */}
              {reportType === 'number-wise' && data && (
                <View>
                  <Text style={styles.resultsHeading}>
                    NUMBER BOOKING TOTALS ({data.length || 0})
                  </Text>
                  {(!Array.isArray(data) || data.length === 0) ? (
                    <Text style={styles.noData}>No numbers booked for selected criteria.</Text>
                  ) : (
                    <View style={styles.excelTableContainer}>
                      <View style={styles.excelTableHeader}>
                        <Text style={[styles.excelHeaderCell, { flex: 1 }]}>NUMBER</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.2 }]}>TICKETS</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.2 }]}>UNITS SOLD</Text>
                        <Text style={[styles.excelHeaderCell, { flex: 1.4, borderRightWidth: 0 }]}>TOTAL SALES (₹)</Text>
                      </View>
                      {data.map((n: any, idx: number) => (
                        <View key={idx} style={styles.excelTableRow}>
                          <Text style={[styles.excelTableCell, { flex: 1, fontWeight: '900', fontSize: 15 }]}>{n.number}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.2 }]}>{n.booking_count}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.2, fontWeight: '700' }]}>{n.total_quantity}</Text>
                          <Text style={[styles.excelTableCell, { flex: 1.4, borderRightWidth: 0, fontWeight: '800', color: '#047857' }]}>₹{n.total_amount}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* 5. NET PAY REPORT - Excel Table with Daily Tally */}
              {reportType === 'net-pay' && data && (() => {
                const netPayItems: any[] = Array.isArray(data) ? data : (data?.items || []);
                const netPaySummary = !Array.isArray(data) && data?.summary ? data.summary : {
                  totalSales: netPayItems.reduce((acc: number, i: any) => acc + (parseFloat(i.totalSales) || 0), 0),
                  totalPrizes: netPayItems.reduce((acc: number, i: any) => acc + (parseFloat(i.totalPrizes) || 0), 0),
                  totalCommission: netPayItems.reduce((acc: number, i: any) => acc + (parseFloat(i.totalCommission) || 0), 0),
                  netPay: netPayItems.reduce((acc: number, i: any) => acc + (parseFloat(i.netPay) || 0), 0),
                };

                return (
                  <View style={{ width: '100%' }}>
                    {/* Quick Filter Bar for Net Pay */}
                    <View style={styles.quickFilterBar}>
                      <TouchableOpacity
                        style={styles.quickFilterPill}
                        onPress={() => setPickerType('ticket')}
                      >
                        <Text style={styles.quickFilterPillLabel}>GAME:</Text>
                        <Text style={styles.quickFilterPillValue}>
                          {selectedTicket === 'ALL'
                            ? 'ALL GAMES'
                            : games.find((g) => g.id === selectedTicket || g.name === selectedTicket)?.name || selectedTicket}
                        </Text>
                        <ChevronDown size={14} color="#007BFF" />
                      </TouchableOpacity>

                      <View style={styles.quickDateButtonGroup}>
                        <TouchableOpacity
                          style={[
                            styles.quickDatePill,
                            fromDate === todayStr && toDate === todayStr && styles.quickDatePillActive,
                          ]}
                          onPress={handleSetToday}
                        >
                          <Text
                            style={[
                              styles.quickDatePillText,
                              fromDate === todayStr && toDate === todayStr && styles.quickDatePillTextActive,
                            ]}
                          >
                            Today
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.quickDatePill}
                          onPress={handleSetYesterday}
                        >
                          <Text style={styles.quickDatePillText}>Yesterday</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.quickDatePill}
                          onPress={() => setShowFilters(true)}
                        >
                          <Calendar size={13} color="#475569" />
                          <Text style={styles.quickDatePillText}>
                            {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Prominent Daily Net Pay Tally Card */}
                    <View style={styles.netPayTallyCard}>
                      <View style={styles.netPayTallyHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.netPayTallyTitle}>
                            {!isAdmin
                              ? (selectedTicket === 'ALL' ? 'MY DAILY NET PAY (ALL GAMES)' : `${selectedTicket} NET PAY`)
                              : (selectedTicket === 'ALL' ? 'DAILY NET PAY TALLY (ALL GAMES)' : `${selectedTicket} NET PAY TALLY`)}
                          </Text>
                          <Text style={styles.netPayTallySubtitle}>
                            Date: {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}
                            {!isAdmin
                              ? ` • User: ${user?.username || 'You'}`
                              : (targetUserId !== 'ALL' && users.find((u) => u.id === targetUserId)
                                ? ` • Seller: ${users.find((u) => u.id === targetUserId)?.username}`
                                : ' • All Users')}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.netPayBadge,
                            { backgroundColor: netPaySummary.netPay >= 0 ? '#DCFCE7' : '#FEE2E2' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.netPayBadgeText,
                              { color: netPaySummary.netPay >= 0 ? '#15803D' : '#B91C1C' },
                            ]}
                          >
                            {netPaySummary.netPay >= 0 ? 'RECEIVABLE' : 'PAYABLE'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.netPayGrid}>
                        <View style={styles.netPayGridItem}>
                          <Text style={styles.netPayGridLabel}>TOTAL SALES</Text>
                          <Text style={styles.netPayGridValue}>
                            ₹{Number(netPaySummary.totalSales || 0).toFixed(2)}
                          </Text>
                        </View>
                        <View style={styles.netPayGridItem}>
                          <Text style={styles.netPayGridLabel}>TOTAL PRIZES</Text>
                          <Text style={[styles.netPayGridValue, { color: '#047857' }]}>
                            ₹{Number(netPaySummary.totalPrizes || 0).toFixed(2)}
                          </Text>
                        </View>
                        <View style={styles.netPayGridItem}>
                          <Text style={styles.netPayGridLabel}>SUPER COMM</Text>
                          <Text style={[styles.netPayGridValue, { color: '#2563EB' }]}>
                            ₹{Number(netPaySummary.totalCommission || 0).toFixed(2)}
                          </Text>
                        </View>
                        <View style={[styles.netPayGridItem, styles.netPayGridItemHighlight]}>
                          <Text style={styles.netPayGridLabel}>DAY NET PAY</Text>
                          <Text
                            style={[
                              styles.netPayGridValue,
                              {
                                color: netPaySummary.netPay >= 0 ? '#15803D' : '#B91C1C',
                                fontSize: 15,
                                fontWeight: '900',
                              },
                            ]}
                          >
                            ₹{Number(netPaySummary.netPay || 0).toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.resultsHeading}>
                      SETTLEMENT BREAKDOWN BY GAME ({netPayItems.length || 0})
                    </Text>

                    {netPayItems.length === 0 ? (
                      <View style={styles.noDataBox}>
                        <Text style={styles.noData}>
                          No settlement transactions found for {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}.
                        </Text>
                        <Text style={styles.noDataSub}>
                          Select another date or game using the controls above.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.excelTableContainer}>
                        <View style={styles.excelTableHeader}>
                          <Text style={[styles.excelHeaderCell, { flex: 1.4 }]}>GAME</Text>
                          <Text style={[styles.excelHeaderCell, { flex: 1.1 }]}>SALES</Text>
                          <Text style={[styles.excelHeaderCell, { flex: 1.1 }]}>PRIZES</Text>
                          <Text style={[styles.excelHeaderCell, { flex: 1 }]}>COMM</Text>
                          <Text style={[styles.excelHeaderCell, { flex: 1.3, borderRightWidth: 0 }]}>NET PAY</Text>
                        </View>

                        {netPayItems.map((np: any, idx: number) => {
                          const isPositive = np.netPay >= 0;
                          return (
                            <View key={idx} style={styles.excelTableRow}>
                              <Text style={[styles.excelTableCell, { flex: 1.4, fontWeight: '700' }]}>{np.gameName}</Text>
                              <Text style={[styles.excelTableCell, { flex: 1.1 }]}>₹{Number(np.totalSales || 0).toFixed(2)}</Text>
                              <Text style={[styles.excelTableCell, { flex: 1.1, color: '#047857' }]}>₹{Number(np.totalPrizes || 0).toFixed(2)}</Text>
                              <Text style={[styles.excelTableCell, { flex: 1, color: '#2563EB' }]}>₹{Number(np.totalCommission || 0).toFixed(2)}</Text>
                              <Text
                                style={[
                                  styles.excelTableCell,
                                  {
                                    flex: 1.3,
                                    borderRightWidth: 0,
                                    fontWeight: '900',
                                    color: isPositive ? colors.emeraldDark : colors.danger,
                                  },
                                ]}
                              >
                                ₹{Number(np.netPay || 0).toFixed(2)}
                              </Text>
                            </View>
                          );
                        })}

                        {/* Tallied row for ALL games */}
                        {selectedTicket === 'ALL' && netPayItems.length > 0 && (
                          <View
                            style={[
                              styles.excelTableRow,
                              { backgroundColor: '#F1F5F9', borderTopWidth: 2, borderTopColor: '#94A3B8' },
                            ]}
                          >
                            <Text style={[styles.excelTableCell, { flex: 1.4, fontWeight: '900', color: '#0F172A' }]}>
                              TOTAL / ALL GAMES
                            </Text>
                            <Text style={[styles.excelTableCell, { flex: 1.1, fontWeight: '900', color: '#0F172A' }]}>
                              ₹{Number(netPaySummary.totalSales || 0).toFixed(2)}
                            </Text>
                            <Text style={[styles.excelTableCell, { flex: 1.1, fontWeight: '900', color: '#047857' }]}>
                              ₹{Number(netPaySummary.totalPrizes || 0).toFixed(2)}
                            </Text>
                            <Text style={[styles.excelTableCell, { flex: 1, fontWeight: '900', color: '#2563EB' }]}>
                              ₹{Number(netPaySummary.totalCommission || 0).toFixed(2)}
                            </Text>
                            <Text
                              style={[
                                styles.excelTableCell,
                                {
                                  flex: 1.3,
                                  borderRightWidth: 0,
                                  fontWeight: '900',
                                  color: netPaySummary.netPay >= 0 ? '#15803D' : '#B91C1C',
                                },
                              ]}
                            >
                              ₹{Number(netPaySummary.netPay || 0).toFixed(2)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* 6. TICKET HISTORY REPORT (Admin with Date, Game, Users under admin, etc.) */}
              {reportType === 'ticket-history' && data && (
                <View style={{ width: '100%' }}>
                  {/* Summary Banner */}
                  <View style={styles.summaryBanner}>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatLabel}>Total Tickets</Text>
                      <Text style={styles.summaryStatVal}>
                        {data.summary?.total_bills ?? (data.tickets?.length || 0)}
                      </Text>
                    </View>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatLabel}>Total Units</Text>
                      <Text style={styles.summaryStatVal}>
                        {data.summary?.total_quantity ?? 0}
                      </Text>
                    </View>
                    <View style={styles.summaryStat}>
                      <Text style={styles.summaryStatLabel}>Total Sales</Text>
                      <Text style={[styles.summaryStatVal, { color: colors.emeraldDark }]}>
                        ₹{data.summary?.total_sales ?? 0}
                      </Text>
                    </View>
                  </View>

                  {/* Filter Metadata Pill */}
                  <View style={styles.filterMetaPill}>
                    <Text style={styles.filterMetaText}>
                      Date: {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}
                      {targetUserId !== 'ALL' && users.find((u) => u.id === targetUserId)
                        ? ` • User: ${users.find((u) => u.id === targetUserId)?.username}`
                        : ' • All Users Under Admin'}
                      {selectedTicket !== 'ALL' ? ` • Game: ${selectedTicket}` : ''}
                      {selectedMode !== 'ALL' ? ` • Mode: ${selectedMode}` : ''}
                      {selectedGroup !== 'ALL' ? ` • Group: ${selectedGroup}` : ''}
                      {selectedStatus !== 'ALL' ? ` • Status: ${selectedStatus}` : ''}
                    </Text>
                  </View>

                  {(!data.tickets || data.tickets.length === 0) ? (
                    <Text style={styles.noData}>
                      No tickets entered by the selected user/filters in this period.
                    </Text>
                  ) : (
                    data.tickets.map((item: any, idx: number) => (
                      <TicketHistoryBillCard
                        key={item.id || idx}
                        item={item}
                        idx={idx}
                        isAdmin={isAdmin}
                        cancellingTicketNum={cancellingTicketNum}
                        onEditTicket={handleEditTicket}
                        onCancelTicket={handleCancelHistoryTicket}
                      />
                    ))
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* DROPDOWN PICKER MODALS */}
      <Modal visible={!!pickerType} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPickerType(null)}
        >
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>
              Select {pickerType === 'ticket' ? 'Game / Ticket' : pickerType === 'mode' ? 'Mode' : pickerType === 'group' ? 'Group' : pickerType === 'user' ? 'User Under Admin' : 'Status'}
            </Text>

            {pickerType === 'user' && (
              <ScrollView style={{ maxHeight: 280 }}>
                <TouchableOpacity
                  style={styles.pickerOption}
                  onPress={() => {
                    setTargetUserId('ALL');
                    setPickerType(null);
                  }}
                >
                  <Text style={styles.pickerOptionText}>ALL (All Users)</Text>
                  {targetUserId === 'ALL' && <Check size={16} color={colors.emerald} />}
                </TouchableOpacity>
                {users.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.pickerOption}
                    onPress={() => {
                      setTargetUserId(u.id);
                      setPickerType(null);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{u.username}</Text>
                    {targetUserId === u.id && <Check size={16} color={colors.emerald} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {pickerType === 'status' && (
              <ScrollView style={{ maxHeight: 200 }}>
                {[
                  { value: 'ALL', label: 'ALL Status' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'CANCELLED', label: 'Cancelled' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={styles.pickerOption}
                    onPress={() => {
                      setSelectedStatus(item.value);
                      setPickerType(null);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{item.label}</Text>
                    {selectedStatus === item.value && <Check size={16} color={colors.emerald} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {pickerType === 'ticket' && (
              <ScrollView style={{ maxHeight: 250 }}>
                {['ALL', ...games.map((g) => g.name)].map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={styles.pickerOption}
                    onPress={() => {
                      setSelectedTicket(name);
                      setPickerType(null);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{name}</Text>
                    {selectedTicket === name && <Check size={16} color={colors.emerald} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {pickerType === 'group' && (
              <ScrollView style={{ maxHeight: 240 }}>
                {[
                  { value: 'ALL', label: 'ALL Groups' },
                  { value: '1', label: '1 (1 Digit)' },
                  { value: '2', label: '2 (2 Digit)' },
                  { value: '3', label: '3 (3 Digit)' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={styles.pickerOption}
                    onPress={() => handleSelectGroup(item.value)}
                  >
                    <Text style={styles.pickerOptionText}>{item.label}</Text>
                    {selectedGroup === item.value && <Check size={16} color={colors.emerald} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {pickerType === 'mode' && (
              <ScrollView style={{ maxHeight: 260 }}>
                {getModeOptions(selectedGroup).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.pickerOption}
                    onPress={() => {
                      setSelectedMode(m);
                      setPickerType(null);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{m}</Text>
                    {selectedMode === m && <Check size={16} color={colors.emerald} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Ticket Modal for Ticket History */}
      <EditTicketModal
        visible={!!editingTicket}
        ticket={editingTicket}
        userPrices={userPrices}
        onClose={() => setEditingTicket(null)}
        onSuccess={(updatedTicket) => {
          setEditingTicket(null);
          Alert.alert('Ticket Updated', `Ticket #${updatedTicket.ticket_number} updated successfully.`);
          fetchReport();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 20 : 48) : 38,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  tabItemActive: {
    backgroundColor: '#0F172A',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  tabItemTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 40,
    width: '100%',
    alignSelf: 'center',
  },
  // REPLICATED FILTER CARD STYLES
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 10,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  dropdownBtnText: {
    fontSize: 14,
    color: '#111827',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  equalButton: {
    width: 44,
    height: 42,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  equalButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  dateBlockSingle: {
    marginTop: 4,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#374151',
  },
  submitButton: {
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  promptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    marginHorizontal: 16,
    marginVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  promptTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    textAlign: 'center',
  },
  promptSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  // REAL-TIME RESULTS STYLES
  resultsArea: {
    marginBottom: 30,
    width: '100%',
  },
  resultsHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 10,
    letterSpacing: 0.5,
    marginHorizontal: 16,
  },
  summaryBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginHorizontal: 16,
    marginBottom: 14,
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryStatLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  summaryStatVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  noData: {
    textAlign: 'center',
    color: '#9CA3AF',
    paddingVertical: 24,
    fontSize: 13,
  },
  billDetailedContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  billDivider: {
    height: 12,
    backgroundColor: '#EAEEF5',
    width: '100%',
  },
  billBlueHeader: {
    backgroundColor: '#0080FF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  billHeaderNumber: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  billHeaderTime: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 4,
  },
  billHeaderGame: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  billHeaderCount: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  billHeaderDate: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  billHeaderPrice: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'right',
  },
  billHeaderComm: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 3,
    textAlign: 'right',
  },
  billTable: {
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  billTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    minHeight: 44,
  },
  billTableCell: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    color: '#1E293B',
    fontSize: 14,
    textAlign: 'center',
  },
  billColCat: {
    flex: 1.3,
    textAlign: 'center',
    fontWeight: '500',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  billColNum: {
    flex: 0.9,
    textAlign: 'center',
    fontWeight: '500',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  billColCount: {
    flex: 0.9,
    textAlign: 'center',
    fontWeight: '500',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  billColPrice: {
    flex: 1.0,
    textAlign: 'center',
    fontWeight: '500',
    borderRightWidth: 0,
  },
  excelTableContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  excelTableHeader: {
    backgroundColor: '#0084FF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  excelHeaderCell: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 4,
  },
  excelTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  excelTableCell: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    color: '#1E293B',
    fontSize: 12,
    textAlign: 'center',
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ticketCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ticketNum: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  ticketSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  ticketAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.emeraldDark,
  },
  ticketQty: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  entriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  numberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  numberBadgeNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  numberBadgeMeta: {
    fontSize: 11,
    color: '#4B5563',
  },
  winningBadgeNum: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  winningPosText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.emeraldDark,
  },
  winningModeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  numberRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  numberColNum: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    width: 60,
  },
  numberColQty: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  numberColSub: {
    fontSize: 11,
    color: '#6B7280',
  },
  numberColPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.emeraldDark,
  },
  netPayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  netPayTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  netPayGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  netPayCol: {
    alignItems: 'center',
  },
  netPayLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  netPayVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  netPayBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  netPayBottomLabel: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  netPayBottomVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  // DAILY NET PAY TALLY CARD STYLES
  netPayTallyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    }),
  },
  netPayTallyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  netPayTallyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  netPayTallySubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  netPayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  netPayBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  netPayGridItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  netPayGridItemHighlight: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1.5,
  },
  netPayGridLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  netPayGridValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  // QUICK FILTER BAR STYLES FOR NET PAY
  quickFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  quickFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  quickFilterPillLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  quickFilterPillValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  quickDateButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  quickDatePillActive: {
    backgroundColor: '#007BFF',
    borderColor: '#007BFF',
  },
  quickDatePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickDatePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  quickDateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickDateBtnActive: {
    backgroundColor: '#007BFF',
    borderColor: '#007BFF',
  },
  quickDateBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickDateBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  noDataBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 24,
    marginHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noDataSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'center',
  },
  // TICKET HISTORY STYLES
  filterMetaPill: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
  filterMetaText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  ticketHistorySeller: {
    fontSize: 11,
    color: '#E2E8F0',
    fontWeight: '700',
    marginTop: 2,
  },
  statusBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  statusBadgeSmallText: {
    fontSize: 10,
    fontWeight: '800',
  },
  ticketHistoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  ticketHistoryActionRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  historyEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  historyCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  historyActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // MODAL STYLES
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 18,
    maxWidth: 360,
    width: '100%',
    alignSelf: 'center',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#1F2937',
  },
  billGameBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    marginBottom: 4,
  },
  billGameBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusBadgeCancelled: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  billCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  billCustomerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  billCustomerName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  billTableHead: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  billColHead: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  billColCell: {
    fontSize: 12,
    color: '#334155',
  },
  billCellBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  billFooterMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  billFooterTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00A86B',
    marginTop: 2,
  },
});
