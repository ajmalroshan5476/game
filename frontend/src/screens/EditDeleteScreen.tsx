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
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import {
  ArrowLeft,
  Search,
  Trash2,
  Edit3,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  Filter,
  Check,
  ChevronDown,
  RefreshCw,
  Receipt,
  ShieldCheck,
} from 'lucide-react-native';
import { EditTicketModal } from '../components/EditTicketModal';

interface EditDeleteScreenProps {
  onBack: () => void;
}

export const EditDeleteScreen: React.FC<EditDeleteScreenProps> = ({ onBack }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // Filters
  const [ticketSearch, setTicketSearch] = useState('');
  const [selectedGameId, setSelectedGameId] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'ACTIVE' | 'CANCELLED'>('ACTIVE');
  const [targetUserId, setTargetUserId] = useState<string>('ALL');

  // Data
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userPrices, setUserPrices] = useState<any[]>([]);

  // Action states
  const [selectedTicketForEdit, setSelectedTicketForEdit] = useState<any | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [cancellingTicketNum, setCancellingTicketNum] = useState<string | null>(null);

  // Pickers modal
  const [userPickerVisible, setUserPickerVisible] = useState(false);
  const [gamePickerVisible, setGamePickerVisible] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadTickets();
  }, [selectedGameId, selectedStatus, targetUserId]);

  const loadInitialData = async () => {
    try {
      const gamesRes = await api.getGames();
      setGames(gamesRes.games || []);
    } catch {}

    if (isAdmin) {
      try {
        const uRes = await api.getUsers();
        setUsersList(uRes.users || []);
      } catch {}
    }

    try {
      const pRes = await api.getMyPrices();
      setUserPrices(pRes.prices || []);
    } catch {}
  };

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: 50,
      };
      if (selectedStatus !== 'ALL') params.status = selectedStatus;
      if (selectedGameId !== 'ALL') params.gameId = selectedGameId;
      if (isAdmin && targetUserId !== 'ALL') params.targetUserId = targetUserId;
      if (ticketSearch.trim()) params.search = ticketSearch.trim();

      const res = await api.getTickets(params);
      setTickets(res.tickets || []);
    } catch (err: any) {
      Alert.alert('Load Error', err.message || 'Could not load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = () => {
    loadTickets();
  };

  const handleCancelTicket = (t: any) => {
    if (!t) return;

    const isCutoff = t.isCutoffPassed;
    if (t.draw_status === 'RESULTED') {
      Alert.alert('Action Blocked', 'Cannot cancel ticket: Draw results have already been declared.');
      return;
    }

    if (!isAdmin && isCutoff) {
      Alert.alert(
        'Cutoff Passed',
        `Cannot cancel ticket #${t.ticket_number}. The edit/delete cutoff time has already passed for this draw.`
      );
      return;
    }

    Alert.alert(
      'Confirm Cancellation',
      `Are you sure you want to cancel Ticket #${t.ticket_number}?\n\nThis will immediately release booked number allocations and reverse sales liability.`,
      [
        { text: 'No, Keep Ticket', style: 'cancel' },
        {
          text: 'Yes, Cancel / Delete',
          style: 'destructive',
          onPress: async () => {
            setCancellingTicketNum(t.ticket_number);
            try {
              await api.cancelTicket(t.ticket_number);
              Alert.alert('Success', `Ticket #${t.ticket_number} cancelled successfully.`);
              await loadTickets();
            } catch (err: any) {
              Alert.alert('Cancellation Error', err.message || 'Failed to cancel ticket');
            } finally {
              setCancellingTicketNum(null);
            }
          },
        },
      ]
    );
  };

  const openEditModal = (t: any) => {
    if (t.status === 'CANCELLED') {
      Alert.alert('Cannot Edit', 'This ticket has been cancelled.');
      return;
    }
    if (t.draw_status === 'RESULTED') {
      Alert.alert('Cannot Edit', 'Draw results have already been declared for this draw.');
      return;
    }
    if (!isAdmin && t.isCutoffPassed) {
      Alert.alert(
        'Cutoff Passed',
        `The edit/delete cutoff time (${new Date(
          t.edit_cutoff_time || t.cutoff_time
        ).toLocaleTimeString('en-IN')}) has passed for this ticket.`
      );
      return;
    }

    setSelectedTicketForEdit(t);
    setEditModalVisible(true);
  };

  const handleEditSuccess = (updated: any) => {
    loadTickets();
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const parts = timeStr.split(':');
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1] || '00';
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${hours}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Edit / Delete Ticket</Text>
          <Text style={styles.headerSubtitle}>
            {isAdmin ? 'Admin Mode (All Tickets)' : `User: ${user?.username} (My Tickets)`}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadTickets}>
          <RefreshCw size={18} color="#00A86B" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Admin Banner */}
        {isAdmin && (
          <View style={styles.adminBanner}>
            <ShieldCheck size={18} color="#0284C7" />
            <Text style={styles.adminBannerText}>
              Admin privilege: You can edit or delete all tickets across all sellers.
            </Text>
          </View>
        )}

        {/* Filter Controls Card */}
        <View style={styles.filterCard}>
          {/* Search Row */}
          <Text style={styles.fieldLabel}>Search Ticket / Customer</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={ticketSearch}
              onChangeText={setTicketSearch}
              placeholder="e.g. 2118921 or customer name"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={handleSearchSubmit}
            />
            <TouchableOpacity
              style={styles.searchBtn}
              activeOpacity={0.8}
              onPress={handleSearchSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Search size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Admin User Filter */}
          {isAdmin && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.fieldLabel}>Filter By User (Seller)</Text>
              <TouchableOpacity
                style={styles.pickerSelector}
                onPress={() => setUserPickerVisible(true)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Users size={16} color="#64748B" />
                  <Text style={styles.pickerSelectorText}>
                    {targetUserId === 'ALL'
                      ? 'All Users (Everyone)'
                      : `User: ${usersList.find((u) => u.id === targetUserId)?.username || targetUserId}`}
                  </Text>
                </View>
                <ChevronDown size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
          )}

          {/* Game Filter & Status Tabs */}
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Game</Text>
              <TouchableOpacity
                style={styles.pickerSelector}
                onPress={() => setGamePickerVisible(true)}
              >
                <Text style={styles.pickerSelectorText} numberOfLines={1}>
                  {selectedGameId === 'ALL'
                    ? 'All Games'
                    : games.find((g) => g.id === selectedGameId)?.name || 'Game'}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1.2 }}>
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.statusSegment}>
                {(['ACTIVE', 'CANCELLED', 'ALL'] as const).map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusSegmentBtn,
                      selectedStatus === st && styles.statusSegmentBtnActive,
                    ]}
                    onPress={() => setSelectedStatus(st)}
                  >
                    <Text
                      style={[
                        styles.statusSegmentText,
                        selectedStatus === st && styles.statusSegmentTextActive,
                      ]}
                    >
                      {st === 'ACTIVE' ? 'Active' : st === 'CANCELLED' ? 'Cancel' : 'All'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Tickets List Header */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>
            TICKETS FOUND ({tickets.length})
          </Text>
          <Text style={styles.listHeaderSub}>
            Within time limit tickets are editable & deletable
          </Text>
        </View>

        {/* Loading Spinner */}
        {loading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginVertical: 30 }} />
        ) : tickets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Receipt size={40} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No tickets found</Text>
            <Text style={styles.emptySubtitle}>
              {ticketSearch
                ? `No ticket matches "${ticketSearch}"`
                : 'No tickets entered matching the selected filters.'}
            </Text>
          </View>
        ) : (
          tickets.map((t) => {
            const isCutoff = t.isCutoffPassed;
            const isResulted = t.draw_status === 'RESULTED';
            const isCancelled = t.status === 'CANCELLED';
            const canModify = !isCancelled && !isResulted && (isAdmin || !isCutoff);
            const isCancelling = cancellingTicketNum === t.ticket_number;

            return (
              <View key={t.id} style={styles.ticketCard}>
                {/* Header Row: Ticket Number & Status */}
                <View style={styles.ticketCardTop}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.ticketNumberText}>#{t.ticket_number}</Text>
                      {isAdmin && t.seller_username && (
                        <View style={styles.sellerTag}>
                          <Text style={styles.sellerTagText}>Agent: {t.seller_username}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.ticketDrawMeta}>
                      {t.game_name} • {formatTime(t.draw_time)} • {t.draw_date ? String(t.draw_date).split('T')[0] : ''}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      isCancelled ? styles.statusBadgeCancelled : styles.statusBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isCancelled ? { color: '#DC2626' } : { color: '#059669' },
                      ]}
                    >
                      {t.status}
                    </Text>
                  </View>
                </View>

                {/* Cutoff / Lock Notice Banner */}
                <View
                  style={[
                    styles.cutoffBanner,
                    isResulted
                      ? styles.cutoffBannerGray
                      : isCutoff
                      ? isAdmin
                        ? styles.cutoffBannerAmber
                        : styles.cutoffBannerRed
                      : styles.cutoffBannerGreen,
                  ]}
                >
                  <Clock
                    size={14}
                    color={
                      isResulted
                        ? '#64748B'
                        : isCutoff
                        ? isAdmin
                          ? '#D97706'
                          : '#DC2626'
                        : '#059669'
                    }
                  />
                  <Text
                    style={[
                      styles.cutoffBannerText,
                      {
                        color: isResulted
                          ? '#64748B'
                          : isCutoff
                          ? isAdmin
                            ? '#92400E'
                            : '#DC2626'
                          : '#065F46',
                      },
                    ]}
                  >
                    {isResulted
                      ? 'Draw results declared (Locked)'
                      : isCutoff
                      ? isAdmin
                        ? 'Cutoff passed (Admin override allowed)'
                        : 'Edit/Delete cutoff time has passed'
                      : t.edit_cutoff_time
                      ? `Editable until ${new Date(t.edit_cutoff_time).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Open for editing/cancellation'}
                  </Text>
                </View>

                {/* Customer and Totals Info */}
                <View style={styles.ticketMetaTable}>
                  {t.customer_name && (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Customer:</Text>
                      <Text style={styles.metaVal}>{t.customer_name}</Text>
                    </View>
                  )}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Total Count:</Text>
                    <Text style={styles.metaVal}>{t.total_quantity} units</Text>
                  </View>
                  <View style={[styles.metaRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.metaLabelBold}>Total Amount:</Text>
                    <Text style={styles.metaValBold}>₹{parseFloat(t.total_amount).toFixed(2)}</Text>
                  </View>
                </View>

                {/* Booked Entries Preview */}
                <Text style={styles.entriesTitle}>BOOKED NUMBERS ({t.entries?.length || 0})</Text>
                <View style={styles.entriesWrap}>
                  {t.entries?.slice(0, 15).map((entry: any, eIdx: number) => (
                    <View key={entry.id || eIdx} style={styles.entryPill}>
                      <Text style={styles.entryPillNum}>{entry.number}</Text>
                      <Text
                        style={[
                          styles.entryPillMode,
                          entry.mode === 'BOX' && { backgroundColor: '#FCE7F3', color: '#BE185D' },
                        ]}
                      >
                        {entry.mode}
                      </Text>
                      <Text style={styles.entryPillQty}>x{entry.quantity}</Text>
                      <Text style={styles.entryPillPrice}>₹{entry.total_price}</Text>
                    </View>
                  ))}
                  {(t.entries?.length || 0) > 15 && (
                    <Text style={styles.entriesOverflowText}>
                      +{t.entries.length - 15} more entries
                    </Text>
                  )}
                </View>

                {/* Action Buttons: Edit & Delete */}
                <View style={styles.actionRow}>
                  {/* EDIT BUTTON */}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.editBtn, !canModify && styles.actionBtnDisabled]}
                    onPress={() => openEditModal(t)}
                    disabled={!canModify}
                    activeOpacity={0.8}
                  >
                    <Edit3 size={16} color={canModify ? '#FFFFFF' : '#94A3B8'} />
                    <Text
                      style={[
                        styles.actionBtnText,
                        !canModify && { color: '#94A3B8' },
                      ]}
                    >
                      Edit Ticket
                    </Text>
                  </TouchableOpacity>

                  {/* DELETE / CANCEL BUTTON */}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      styles.deleteBtn,
                      (!canModify || isCancelling) && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleCancelTicket(t)}
                    disabled={!canModify || isCancelling}
                    activeOpacity={0.8}
                  >
                    {isCancelling ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Trash2 size={16} color={canModify ? '#FFFFFF' : '#94A3B8'} />
                        <Text
                          style={[
                            styles.actionBtnText,
                            !canModify && { color: '#94A3B8' },
                          ]}
                        >
                          Delete Ticket
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* EDIT TICKET MODAL */}
      <EditTicketModal
        visible={editModalVisible}
        ticket={selectedTicketForEdit}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedTicketForEdit(null);
        }}
        onSuccess={handleEditSuccess}
        userPrices={userPrices}
      />

      {/* USER PICKER MODAL (Admin only) */}
      <Modal visible={userPickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setUserPickerVisible(false)}
        >
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select Seller User</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={styles.pickerOption}
                onPress={() => {
                  setTargetUserId('ALL');
                  setUserPickerVisible(false);
                }}
              >
                <Text style={styles.pickerOptionText}>All Users (Everyone)</Text>
                {targetUserId === 'ALL' && <Check size={18} color="#00A86B" />}
              </TouchableOpacity>
              {usersList.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setTargetUserId(u.id);
                    setUserPickerVisible(false);
                  }}
                >
                  <Text style={styles.pickerOptionText}>Agent: {u.username}</Text>
                  {targetUserId === u.id && <Check size={18} color="#00A86B" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GAME PICKER MODAL */}
      <Modal visible={gamePickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setGamePickerVisible(false)}
        >
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select Game</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={styles.pickerOption}
                onPress={() => {
                  setSelectedGameId('ALL');
                  setGamePickerVisible(false);
                }}
              >
                <Text style={styles.pickerOptionText}>All Games</Text>
                {selectedGameId === 'ALL' && <Check size={18} color="#00A86B" />}
              </TouchableOpacity>
              {games.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setSelectedGameId(g.id);
                    setGamePickerVisible(false);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{g.name}</Text>
                  {selectedGameId === g.id && <Check size={18} color="#00A86B" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    maxWidth: 550,
    width: '100%',
    alignSelf: 'center',
  },
  adminBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  adminBannerText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '700',
    flex: 1,
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },
  searchBtn: {
    backgroundColor: colors.emerald,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  pickerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pickerSelectorText: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    flex: 1,
  },
  statusSegment: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
  },
  statusSegmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  statusSegmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  statusSegmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  statusSegmentTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  listHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  listHeaderSub: {
    fontSize: 10,
    color: '#94A3B8',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  ticketCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  ticketNumberText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  sellerTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sellerTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  ticketDrawMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeActive: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgeCancelled: {
    backgroundColor: '#FEF2F2',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cutoffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 12,
  },
  cutoffBannerGreen: {
    backgroundColor: '#ECFDF5',
  },
  cutoffBannerAmber: {
    backgroundColor: '#FEF3C7',
  },
  cutoffBannerRed: {
    backgroundColor: '#FEF2F2',
  },
  cutoffBannerGray: {
    backgroundColor: '#F1F5F9',
  },
  cutoffBannerText: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  ticketMetaTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  metaVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaLabelBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  metaValBold: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.emeraldDark,
    marginTop: 2,
  },
  entriesTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  entriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  entryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  entryPillNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  entryPillMode: {
    fontSize: 9,
    fontWeight: '700',
    color: '#00A86B',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  entryPillQty: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  entryPillPrice: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.emeraldDark,
  },
  entriesOverflowText: {
    fontSize: 11,
    color: '#94A3B8',
    alignSelf: 'center',
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  editBtn: {
    backgroundColor: '#2563EB',
  },
  deleteBtn: {
    backgroundColor: '#DC2626',
  },
  actionBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    maxWidth: 400,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 8,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
});
