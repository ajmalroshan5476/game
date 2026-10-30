import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme/colors';
import {
  ArrowLeft,
  Clock,
  PlusCircle,
  ChevronDown,
  Check,
  Receipt,
  Home,
} from 'lucide-react-native';

interface ManageSalesScreenProps {
  onBack: () => void;
  onNavigateAddTicket: () => void;
}

export const ManageSalesScreen: React.FC<ManageSalesScreenProps> = ({
  onBack,
  onNavigateAddTicket,
}) => {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState<any>(null);

  // Filters (Replicated from Sales Report)
  const [selectedTicket, setSelectedTicket] = useState('ALL');
  const todayStr = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [ticketNumber, setTicketNumber] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedMode, setSelectedMode] = useState('ALL');

  // Modal Picker state
  const [pickerType, setPickerType] = useState<'ticket' | 'group' | 'mode' | null>(null);

  useEffect(() => {
    loadGamesAndSales();
  }, []);

  useEffect(() => {
    fetchSales();
  }, [selectedTicket, fromDate, toDate, selectedGroup, selectedMode]);

  const loadGamesAndSales = async () => {
    try {
      const gamesRes = await api.getGames();
      setGames(gamesRes.games || []);
    } catch {}
    await fetchSales();
  };

  const handleSyncDates = () => {
    setToDate(fromDate);
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

  const fetchSales = async () => {
    setLoading(true);
    const params: any = {
      fromDate,
      toDate,
    };
    if (selectedTicket && selectedTicket !== 'ALL') params.gameId = selectedTicket;
    if (ticketNumber.trim()) params.ticketNumber = ticketNumber.trim();
    if (selectedGroup && selectedGroup !== 'ALL' && selectedGroup !== 'Select') {
      params.group = selectedGroup;
    }
    if (selectedMode && selectedMode !== 'ALL') {
      params.mode = selectedMode;
    }

    try {
      const res = await api.getSalesReport(params);
      setSalesData(res);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch sales report');
    } finally {
      setLoading(false);
    }
  };

  const formatBillTime = (dateString?: string) => {
    if (!dateString) return '';
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Sales</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
          <Home size={22} color="#DC2626" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Quick Add Ticket CTA */}
        <TouchableOpacity
          style={styles.ctaBtn}
          activeOpacity={0.85}
          onPress={onNavigateAddTicket}
        >
          <PlusCircle size={20} color="#FFFFFF" />
          <Text style={styles.ctaBtnText}>New Ticket Entry</Text>
        </TouchableOpacity>

        {/* REPLICATED FILTER CARD (Exact layout like Sales Report) */}
        <View style={styles.filterCard}>
          {/* Row 1: Ticket / Game Dropdown */}
          <Text style={styles.fieldLabel}>Ticket</Text>
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

          {/* Row 2: Date Inputs with '=' button */}
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

            <TouchableOpacity
              style={styles.equalButton}
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

          {/* Row 3: Ticket Number */}
          <Text style={styles.fieldLabel}>Ticket Number</Text>
          <TextInput
            style={styles.textInput}
            value={ticketNumber}
            onChangeText={setTicketNumber}
            placeholder="Ticket Number (Optional)"
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

          {/* Generate Report Button */}
          <TouchableOpacity
            style={styles.submitButton}
            activeOpacity={0.85}
            onPress={fetchSales}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Generate Report</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Summary Banner */}
        {salesData && (
          <View style={styles.summaryBanner}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatLabel}>Total Bills</Text>
              <Text style={styles.summaryStatVal}>{salesData.summary?.total_bills || 0}</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatLabel}>Total Quantity</Text>
              <Text style={styles.summaryStatVal}>{salesData.summary?.total_quantity || 0}</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatLabel}>Total Sales</Text>
              <Text style={[styles.summaryStatVal, { color: colors.emeraldDark }]}>
                ₹{salesData.summary?.total_sales || 0}
              </Text>
            </View>
          </View>
        )}

        {/* Real-time Sales Ticket Results */}
        <Text style={styles.sectionTitle}>
          REAL-TIME SALES TICKETS ({salesData?.items?.length || 0})
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginVertical: 20 }} />
        ) : !salesData?.items || salesData.items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Receipt size={36} color="#94A3B8" />
            <Text style={styles.noData}>No sales tickets found for the selected filters.</Text>
          </View>
        ) : (
          salesData.items.map((item: any, idx: number) => {
            const billGame = formatBillGame(item);
            const billTime = formatBillTime(item.created_at);
            const billDate = formatBillDate(item.draw_date, item.created_at);
            const totalPriceStr = parseFloat(item.total_amount || 0).toFixed(2);
            const sortedEntries = getSortedEntries(item.entries);

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
          })
        )}

        {/* Active Game Draws Section */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          ACTIVE GAME DRAWS & CUTOFF TIMES
        </Text>
        {games.map((g) => {
          const nextDraw = g.draws?.[0];
          const isClosed = nextDraw
            ? new Date().getTime() >= new Date(nextDraw.cutoffTime).getTime()
            : true;

          return (
            <View key={g.id} style={styles.gameCard}>
              <View style={styles.gameCardTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.gameColorDot, { backgroundColor: g.color || colors.emerald }]} />
                  <Text style={styles.gameName}>{g.name}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    isClosed ? styles.statusPillClosed : styles.statusPillOpen,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isClosed ? '#DC2626' : colors.emeraldDark },
                    ]}
                  >
                    {isClosed ? 'CLOSED' : 'OPEN'}
                  </Text>
                </View>
              </View>

              {nextDraw && (
                <View style={styles.drawMetaRow}>
                  <Clock size={14} color="#64748B" />
                  <Text style={styles.drawMetaText}>
                    Draw: {nextDraw.drawTime} • Cutoff: {new Date(nextDraw.cutoffTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
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
              Select {pickerType === 'ticket' ? 'Game / Ticket' : pickerType === 'mode' ? 'Mode' : 'Group'}
            </Text>

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
              <ScrollView style={{ maxHeight: 200 }}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  scrollContent: {
    padding: 16,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.emerald,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 5,
    marginTop: 8,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  dropdownBtnText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  equalButton: {
    width: 36,
    height: 42,
    backgroundColor: '#FF5722',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  equalButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    color: '#0F172A',
  },
  submitButton: {
    backgroundColor: '#FF5722',
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-around',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  summaryStatVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noData: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 8,
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
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ticketCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ticketNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  ticketSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  ticketAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.emeraldDark,
  },
  ticketQty: {
    fontSize: 11,
    color: '#64748B',
  },
  entriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  numberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  numberBadgeNum: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.navyDark,
  },
  numberBadgeMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  gameCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gameCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  gameName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillOpen: {
    backgroundColor: '#ECFDF5',
  },
  statusPillClosed: {
    backgroundColor: '#FEF2F2',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  drawMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  drawMetaText: {
    fontSize: 12,
    color: '#64748B',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
});
