import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { api } from '../api/client';
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
} from 'lucide-react-native';

interface ReportsScreenProps {
  onBack: () => void;
}

type ReportType = 'sales' | 'winnings' | 'bill-wise' | 'number-wise' | 'net-pay';

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ onBack }) => {
  const [reportType, setReportType] = useState<ReportType>('sales');

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
  const [groupWithoutTicketName, setGroupWithoutTicketName] = useState(false);

  // Dropdown Modals
  const [pickerType, setPickerType] = useState<'ticket' | 'group' | 'mode' | null>(null);

  // Report Data
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [reportType, selectedTicket, fromDate, toDate, singleDate, selectedGroup, selectedMode, groupWithoutTicketName]);

  const loadGames = async () => {
    try {
      const res = await api.getGames();
      setGames(res.games || []);
    } catch {}
  };

  const handleSyncDates = () => {
    // Clicking the '=' button syncs To date to From date or sets both to Today
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

  const fetchReport = async () => {
    setLoading(true);
    setData(null);

    const baseParams: any = {};
    if (selectedTicket && selectedTicket !== 'ALL') baseParams.gameId = selectedTicket;
    if (ticketNumber.trim()) baseParams.ticketNumber = ticketNumber.trim();
    if (selectedGroup && selectedGroup !== 'ALL' && selectedGroup !== 'Select') {
      baseParams.group = selectedGroup;
    }
    if (selectedMode && selectedMode !== 'ALL') {
      baseParams.mode = selectedMode;
    }

    try {
      if (reportType === 'sales') {
        baseParams.fromDate = fromDate;
        baseParams.toDate = toDate;
        const res = await api.getSalesReport(baseParams);
        setData(res);
      } else if (reportType === 'winnings') {
        baseParams.fromDate = fromDate;
        baseParams.toDate = toDate;
        const res = await api.getWinningsReport(baseParams);
        setData(res);
      } else if (reportType === 'bill-wise') {
        baseParams.date = singleDate;
        const res = await api.getBillWiseReport(baseParams);
        setData(res);
      } else if (reportType === 'number-wise') {
        baseParams.date = singleDate;
        if (groupWithoutTicketName) baseParams.groupWithoutTicketName = 'true';
        const res = await api.getNumberWiseReport(baseParams);
        setData(res);
      } else if (reportType === 'net-pay') {
        baseParams.fromDate = fromDate;
        baseParams.toDate = toDate;
        const res = await api.getNetPayReport(baseParams);
        setData(res);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  // Screen Title based on screenshot
  const getHeaderTitle = () => {
    switch (reportType) {
      case 'sales':
        return 'Sales Report hm2';
      case 'winnings':
        return 'Winning Report';
      case 'bill-wise':
        return 'Winning Report (Bill Wise)';
      case 'number-wise':
        return 'Number Wise Report';
      case 'net-pay':
        return 'Net Pay';
    }
  };

  const isOrangeButton = reportType === 'sales' || reportType === 'winnings' || reportType === 'bill-wise';
  const buttonColor = isOrangeButton ? '#FF5722' : '#007BFF';
  const buttonText = reportType === 'bill-wise' ? 'Search' : 'Generate Report';

  return (
    <View style={styles.container}>
      {/* Top Header replicating reference screenshots */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
          <Home size={22} color="#DC2626" />
        </TouchableOpacity>
      </View>

      {/* Sub-tab switcher to switch between the 5 report screens */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {[
            { id: 'sales', label: 'Sales' },
            { id: 'winnings', label: 'Winning' },
            { id: 'bill-wise', label: 'Bill Wise' },
            { id: 'number-wise', label: 'Number Wise' },
            { id: 'net-pay', label: 'Net Pay' },
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
        {/* REPLICATED FILTER CARD (Exact layout from screenshots) */}
        <View style={styles.filterCard}>
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

          {/* Row 3: Ticket Number (Optional) */}
          <Text style={styles.fieldLabel}>Ticket Number</Text>
          <TextInput
            style={styles.textInput}
            value={ticketNumber}
            onChangeText={setTicketNumber}
            placeholder={reportType === 'bill-wise' ? 'Optional' : 'Ticket Number'}
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
            onPress={fetchReport}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>{buttonText}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* REAL-TIME DATA DISPLAY AREA */}
        <View style={styles.resultsArea}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.emerald} style={{ marginTop: 24 }} />
          ) : (
            <>
              {/* 1. SALES REPORT REAL-TIME DATA */}
              {reportType === 'sales' && data && (
                <View>
                  {/* Real-time Summary Banner */}
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

                  <Text style={styles.resultsHeading}>
                    REAL-TIME SALES TICKETS ({data.items?.length || 0})
                  </Text>

                  {(!data.items || data.items.length === 0) ? (
                    <Text style={styles.noData}>No sales tickets found for the selected filters.</Text>
                  ) : (
                    data.items.map((item: any) => (
                      <View key={item.id} style={styles.ticketCard}>
                        <View style={styles.ticketCardTop}>
                          <View>
                            <Text style={styles.ticketNum}>{item.ticket_number}</Text>
                            <Text style={styles.ticketSub}>
                              {item.game_name} ({item.draw_time})
                              {item.customer_name ? ` • Customer: ${item.customer_name}` : ''}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.ticketAmount}>₹{item.total_amount}</Text>
                            <Text style={styles.ticketQty}>{item.total_quantity} units</Text>
                          </View>
                        </View>

                        {/* Real-time booked numbers pill list */}
                        {item.entries && item.entries.length > 0 && (
                          <View style={styles.entriesRow}>
                            {item.entries.map((e: any, idx: number) => (
                              <View key={idx} style={styles.numberBadge}>
                                <Text style={styles.numberBadgeNum}>{e.number}</Text>
                                <Text style={styles.numberBadgeMeta}>
                                  [{e.mode}] x{e.quantity}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
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
                    data.items.map((w: any) => (
                      <View key={w.id} style={styles.ticketCard}>
                        <View style={styles.ticketCardTop}>
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.winningBadgeNum}>{w.winning_number}</Text>
                              <Text style={styles.winningPosText}>{w.prize_position}</Text>
                              <Text style={styles.winningModeText}>[{w.mode}]</Text>
                            </View>
                            <Text style={styles.ticketSub}>
                              Bill: {w.ticket_number} • Qty: {w.quantity}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.ticketAmount}>Prize: ₹{w.prize_amount}</Text>
                            <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '700' }}>
                              Super: +₹{w.commission_amount}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* 3. WINNING REPORT (BILL WISE) */}
              {reportType === 'bill-wise' && data && (
                <View>
                  <Text style={styles.resultsHeading}>
                    WINNING BILLS ({data.length || 0})
                  </Text>
                  {(!Array.isArray(data) || data.length === 0) ? (
                    <Text style={styles.noData}>No winning bills found.</Text>
                  ) : (
                    data.map((b: any) => (
                      <View key={b.ticket_id} style={styles.ticketCard}>
                        <View style={styles.ticketCardTop}>
                          <View>
                            <Text style={styles.ticketNum}>{b.ticket_number}</Text>
                            <Text style={styles.ticketSub}>
                              {b.game_name} ({b.draw_time}) • {b.winning_entries_count} winning hits
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.ticketAmount}>Prize: ₹{b.total_bill_prize}</Text>
                            <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '700' }}>
                              Commission: ₹{b.total_bill_commission}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* 4. NUMBER WISE REPORT */}
              {reportType === 'number-wise' && data && (
                <View>
                  <Text style={styles.resultsHeading}>
                    NUMBER BOOKING TOTALS ({data.length || 0})
                  </Text>
                  {(!Array.isArray(data) || data.length === 0) ? (
                    <Text style={styles.noData}>No numbers booked for selected criteria.</Text>
                  ) : (
                    data.map((n: any, idx: number) => (
                      <View key={idx} style={styles.numberRowCard}>
                        <Text style={styles.numberColNum}>{n.number}</Text>
                        <View style={{ flex: 1, paddingHorizontal: 12 }}>
                          <Text style={styles.numberColQty}>{n.total_quantity} Units Sold</Text>
                          <Text style={styles.numberColSub}>{n.booking_count} total tickets</Text>
                        </View>
                        <Text style={styles.numberColPrice}>₹{n.total_amount}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* 5. NET PAY REPORT */}
              {reportType === 'net-pay' && data && (
                <View>
                  <Text style={styles.resultsHeading}>
                    SETTLEMENT BREAKDOWN BY GAME ({data.length || 0})
                  </Text>
                  {(!Array.isArray(data) || data.length === 0) ? (
                    <Text style={styles.noData}>No settlement transactions found.</Text>
                  ) : (
                    data.map((np: any, idx: number) => {
                      const isPositive = np.netPay >= 0;
                      return (
                        <View key={idx} style={styles.netPayCard}>
                          <Text style={styles.netPayTitle}>{np.gameName}</Text>
                          <View style={styles.netPayGrid}>
                            <View style={styles.netPayCol}>
                              <Text style={styles.netPayLabel}>Sales Liability</Text>
                              <Text style={styles.netPayVal}>₹{np.totalSales}</Text>
                            </View>
                            <View style={styles.netPayCol}>
                              <Text style={styles.netPayLabel}>Prizes</Text>
                              <Text style={[styles.netPayVal, { color: colors.emeraldDark }]}>
                                ₹{np.totalPrizes}
                              </Text>
                            </View>
                            <View style={styles.netPayCol}>
                              <Text style={styles.netPayLabel}>Super Comm.</Text>
                              <Text style={[styles.netPayVal, { color: '#2563EB' }]}>
                                ₹{np.totalCommission}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.netPayBottom}>
                            <Text style={styles.netPayBottomLabel}>
                              {isPositive ? 'Admin Owes User (Net):' : 'User Owes Admin (Net):'}
                            </Text>
                            <Text
                              style={[
                                styles.netPayBottomVal,
                                { color: isPositive ? colors.emeraldDark : '#DC2626' },
                              ]}
                            >
                              {isPositive ? `+₹${np.netPay}` : `-₹${Math.abs(np.netPay)}`}
                            </Text>
                          </View>
                        </View>
                      );
                    })
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
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 12,
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
    padding: 16,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  // REPLICATED FILTER CARD STYLES
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 20,
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
  // REAL-TIME RESULTS STYLES
  resultsArea: {
    marginBottom: 30,
  },
  resultsHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  summaryBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
});
