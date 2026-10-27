import React, { useState } from 'react';
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
} from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme/colors';
import { ArrowLeft, Search, Trash2, Clock, CheckCircle2, AlertCircle } from 'lucide-react-native';

interface EditDeleteScreenProps {
  onBack: () => void;
}

export const EditDeleteScreen: React.FC<EditDeleteScreenProps> = ({ onBack }) => {
  const [ticketSearch, setTicketSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleSearch = async () => {
    if (!ticketSearch.trim()) {
      Alert.alert('Required', 'Please enter a ticket number to search');
      return;
    }

    setLoading(true);
    setTicket(null);
    try {
      const res = await api.getTicket(ticketSearch.trim());
      setTicket(res);
    } catch (err: any) {
      Alert.alert('Search Error', err.message || 'Ticket not found');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTicket = () => {
    if (!ticket) return;

    Alert.alert(
      'Confirm Cancellation',
      `Are you sure you want to cancel ticket ${ticket.ticket_number}? This will immediately release its number capacity and reverse the sales liability.`,
      [
        { text: 'No, Keep Ticket', style: 'cancel' },
        {
          text: 'Yes, Cancel Ticket',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await api.cancelTicket(ticket.ticket_number);
              Alert.alert('Success', `Ticket ${ticket.ticket_number} cancelled successfully.`);
              // Refresh ticket state
              const updated = await api.getTicket(ticket.ticket_number);
              setTicket(updated);
            } catch (err: any) {
              Alert.alert('Cancellation Error', err.message || 'Failed to cancel ticket');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const isCutoffPassed = () => {
    if (!ticket?.edit_cutoff_time) return false;
    return new Date().getTime() >= new Date(ticket.edit_cutoff_time).getTime();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit / Delete Ticket</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Search Input */}
        <View style={styles.searchCard}>
          <Text style={styles.fieldLabel}>Search by Ticket Number</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={ticketSearch}
              onChangeText={setTicketSearch}
              placeholder="e.g. TKT-20261025-..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.searchBtn}
              activeOpacity={0.8}
              onPress={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Search size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Ticket Details Display */}
        {ticket && (
          <View style={styles.ticketCard}>
            <View style={styles.ticketCardHeader}>
              <View>
                <Text style={styles.ticketNumText}>{ticket.ticket_number}</Text>
                <Text style={styles.ticketDrawText}>
                  {ticket.game_name} • {ticket.draw_time}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  ticket.status === 'ACTIVE' ? styles.statusActive : styles.statusCancelled,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    ticket.status === 'ACTIVE'
                      ? { color: colors.emeraldDark }
                      : { color: colors.danger },
                  ]}
                >
                  {ticket.status}
                </Text>
              </View>
            </View>

            {/* Cutoff Notice */}
            <View
              style={[
                styles.noticeBanner,
                isCutoffPassed() ? styles.noticeClosed : styles.noticeOpen,
              ]}
            >
              <Clock size={16} color={isCutoffPassed() ? '#DC2626' : '#059669'} />
              <Text
                style={[
                  styles.noticeText,
                  { color: isCutoffPassed() ? '#DC2626' : '#059669' },
                ]}
              >
                {isCutoffPassed()
                  ? 'Edit/Delete cutoff has passed for this draw'
                  : `Cancellation open until ${new Date(
                      ticket.edit_cutoff_time
                    ).toLocaleTimeString('en-IN')}`}
              </Text>
            </View>

            {/* Info Table */}
            <View style={styles.infoTable}>
              {ticket.customer_name && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Customer:</Text>
                  <Text style={styles.infoVal}>{ticket.customer_name}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Booked By:</Text>
                <Text style={styles.infoVal}>Agent {ticket.seller_username}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Total Quantity:</Text>
                <Text style={styles.infoVal}>{ticket.total_quantity} units</Text>
              </View>
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.infoLabelBold}>Total Amount:</Text>
                <Text style={styles.infoValBold}>₹{ticket.total_amount}</Text>
              </View>
            </View>

            {/* Entries Breakdown */}
            <Text style={styles.entriesTitle}>BOOKED NUMBERS ({ticket.entries?.length || 0})</Text>
            <View style={styles.entriesList}>
              {ticket.entries?.map((e: any) => (
                <View key={e.id} style={styles.entryItem}>
                  <Text style={styles.entryNum}>{e.number}</Text>
                  <Text style={styles.entryMode}>Mode: {e.mode}</Text>
                  <Text style={styles.entryQty}>{e.quantity} qty</Text>
                  <Text style={styles.entryPrice}>₹{e.total_price}</Text>
                </View>
              ))}
            </View>

            {/* Cancel Action */}
            {ticket.status === 'ACTIVE' && (
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  (isCutoffPassed() || cancelling) && styles.cancelBtnDisabled,
                ]}
                activeOpacity={0.85}
                disabled={isCutoffPassed() || cancelling}
                onPress={handleCancelTicket}
              >
                {cancelling ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <View style={styles.cancelBtnRow}>
                    <Trash2 size={18} color="#FFFFFF" />
                    <Text style={styles.cancelBtnText}>Cancel / Delete Ticket</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
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
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
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
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  searchBtn: {
    backgroundColor: colors.emerald,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  ticketNumText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  ticketDrawText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#ECFDF5',
  },
  statusCancelled: {
    backgroundColor: '#FEF2F2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  noticeOpen: {
    backgroundColor: '#ECFDF5',
  },
  noticeClosed: {
    backgroundColor: '#FEF2F2',
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  infoLabelBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  infoValBold: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.emeraldDark,
    marginTop: 4,
  },
  entriesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  entriesList: {
    marginBottom: 20,
  },
  entryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  entryNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    width: 60,
  },
  entryMode: {
    fontSize: 12,
    color: '#64748B',
    width: 80,
  },
  entryQty: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  entryPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.emeraldDark,
  },
  cancelBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  cancelBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
