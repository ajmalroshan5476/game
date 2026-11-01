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
  Modal,
  Platform,
} from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme/colors';
import {
  X,
  Trash2,
  Plus,
  Save,
  Clock,
  AlertTriangle,
  Receipt,
  CheckCircle2,
} from 'lucide-react-native';

export type TicketMode = 'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'SUPER' | 'BOX';

interface EditEntryItem {
  id: string;
  number: string;
  quantity: number;
  mode: TicketMode;
  isBox: boolean;
  unitPrice: number;
  totalPrice: number;
}

interface EditTicketModalProps {
  visible: boolean;
  ticket: any | null;
  onClose: () => void;
  onSuccess: (updatedTicket: any) => void;
  userPrices?: any[];
}

export const EditTicketModal: React.FC<EditTicketModalProps> = ({
  visible,
  ticket,
  onClose,
  onSuccess,
  userPrices = [],
}) => {
  const [customerName, setCustomerName] = useState('');
  const [entries, setEntries] = useState<EditEntryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [limitAlert, setLimitAlert] = useState<any | null>(null);

  useEffect(() => {
    if (ticket && visible) {
      setCustomerName(ticket.customer_name || '');
      const rawEntries = ticket.entries || [];
      const mapped: EditEntryItem[] = rawEntries.map((e: any, idx: number) => {
        const qty = parseInt(e.quantity, 10) || 1;
        const uPrice = parseFloat(e.unit_price) || getModeDefaultPrice(e.mode);
        return {
          id: e.id || `entry-${idx}-${Date.now()}`,
          number: String(e.number),
          quantity: qty,
          mode: (e.mode as TicketMode) || 'SUPER',
          isBox: Boolean(e.is_box || e.mode === 'BOX'),
          unitPrice: uPrice,
          totalPrice: qty * uPrice,
        };
      });

      if (mapped.length === 0) {
        mapped.push({
          id: `new-${Date.now()}`,
          number: '',
          quantity: 1,
          mode: 'SUPER',
          isBox: false,
          unitPrice: 10,
          totalPrice: 10,
        });
      }

      setEntries(mapped);
      setLimitAlert(null);
    }
  }, [ticket, visible]);

  const getModeDefaultPrice = (mode: string) => {
    if (userPrices && userPrices.length > 0) {
      const match = userPrices.find((p) => p.mode === mode);
      if (match && !isNaN(Number(match.price))) {
        return Number(match.price);
      }
    }
    return ['A', 'B', 'C'].includes(mode) ? 12.0 : 10.0;
  };

  const getModesForLength = (len: number): TicketMode[] => {
    if (len === 1) return ['A', 'B', 'C'];
    if (len === 2) return ['AB', 'BC', 'AC'];
    return ['SUPER', 'BOX'];
  };

  const handleNumberChange = (id: string, val: string) => {
    const clean = val.replace(/[^0-9]/g, '').slice(0, 3);
    setEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        let mode = item.mode;
        let isBox = item.isBox;

        if (clean.length === 1 && !['A', 'B', 'C'].includes(mode)) {
          mode = 'A';
          isBox = false;
        } else if (clean.length === 2 && !['AB', 'BC', 'AC'].includes(mode)) {
          mode = 'AB';
          isBox = false;
        } else if (clean.length === 3 && !['SUPER', 'BOX'].includes(mode)) {
          mode = 'SUPER';
          isBox = false;
        }

        const unitPrice = getModeDefaultPrice(mode);
        return {
          ...item,
          number: clean,
          mode,
          isBox,
          unitPrice,
          totalPrice: item.quantity * unitPrice,
        };
      })
    );
  };

  const handleModeChange = (id: string, mode: TicketMode) => {
    setEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const isBox = mode === 'BOX';
        const unitPrice = getModeDefaultPrice(mode);
        return {
          ...item,
          mode,
          isBox,
          unitPrice,
          totalPrice: item.quantity * unitPrice,
        };
      })
    );
  };

  const handleQuantityChange = (id: string, val: string) => {
    const clean = val.replace(/[^0-9]/g, '');
    const qty = parseInt(clean, 10);
    const validQty = isNaN(qty) ? 0 : qty;

    setEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          quantity: validQty,
          totalPrice: validQty * item.unitPrice,
        };
      })
    );
  };

  const handleAddRow = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        number: '',
        quantity: 1,
        mode: 'SUPER',
        isBox: false,
        unitPrice: 10,
        totalPrice: 10,
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (entries.length <= 1) {
      Alert.alert('Notice', 'A ticket must have at least one entry');
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const totalCount = entries.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  const totalAmount = entries.reduce((acc, curr) => acc + (curr.totalPrice || 0), 0);

  const handleSaveChanges = async () => {
    if (!ticket) return;

    // Validate entries
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.number || e.number.trim().length === 0) {
        Alert.alert('Validation Error', `Entry #${i + 1} has an empty number`);
        return;
      }
      if (!e.quantity || e.quantity <= 0) {
        Alert.alert('Validation Error', `Entry #${i + 1} (${e.number}) must have quantity > 0`);
        return;
      }
    }

    setSaving(true);
    setLimitAlert(null);

    try {
      const payload = {
        customerName: customerName.trim() || undefined,
        entries: entries.map((e) => ({
          number: e.number.trim(),
          quantity: e.quantity,
          mode: e.mode,
          isBox: e.isBox,
        })),
      };

      const updated = await api.editTicket(ticket.ticket_number, payload);
      Alert.alert('Success', `Ticket ${ticket.ticket_number} updated successfully!`);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      if (err.data?.error === 'NUMBER_LIMIT_EXCEEDED' || err.message?.includes('capacity')) {
        setLimitAlert({
          number: err.data?.number || 'Specified number',
          maxQuantity: err.data?.maxQuantity || 0,
          currentlyAccepted: err.data?.currentlyAccepted || 0,
          requested: err.data?.requested || 0,
          remaining: err.data?.remaining || 0,
        });
      } else {
        Alert.alert('Update Failed', err.message || 'Could not update ticket');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!ticket) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Edit Ticket #{ticket.ticket_number}</Text>
              <Text style={styles.headerSubtitle}>
                {ticket.game_name} • {ticket.draw_time}
                {ticket.seller_username ? ` • Agent: ${ticket.seller_username}` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={saving}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            {/* Customer Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Customer Name (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Enter customer name"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Entries Section */}
            <View style={styles.entriesSectionHeader}>
              <Text style={styles.sectionTitle}>TICKET ENTRIES ({entries.length})</Text>
              <TouchableOpacity style={styles.addRowBtn} onPress={handleAddRow} activeOpacity={0.8}>
                <Plus size={15} color="#00A86B" />
                <Text style={styles.addRowBtnText}>Add Number</Text>
              </TouchableOpacity>
            </View>

            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thCell, { flex: 1.2 }]}>NUMBER</Text>
              <Text style={[styles.thCell, { flex: 1.8 }]}>MODE</Text>
              <Text style={[styles.thCell, { flex: 1, textAlign: 'center' }]}>QTY</Text>
              <Text style={[styles.thCell, { flex: 1.1, textAlign: 'right' }]}>PRICE</Text>
              <View style={{ width: 34 }} />
            </View>

            {/* Entries List */}
            {entries.map((entry, idx) => {
              const len = entry.number.length || 3;
              const modes = getModesForLength(len);

              return (
                <View key={entry.id} style={styles.entryRow}>
                  {/* Number Input */}
                  <TextInput
                    style={[styles.rowInput, { flex: 1.2, fontWeight: '700' }]}
                    value={entry.number}
                    onChangeText={(val) => handleNumberChange(entry.id, val)}
                    placeholder="000"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="numeric"
                    maxLength={3}
                  />

                  {/* Mode Selector Buttons */}
                  <View style={[styles.modePillContainer, { flex: 1.8 }]}>
                    {modes.map((m) => {
                      const isActive = entry.mode === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[
                            styles.modePill,
                            isActive && (m === 'BOX' ? styles.modePillBoxActive : styles.modePillActive),
                          ]}
                          onPress={() => handleModeChange(entry.id, m)}
                        >
                          <Text
                            style={[
                              styles.modePillText,
                              isActive && styles.modePillTextActive,
                            ]}
                          >
                            {m}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Quantity Input */}
                  <TextInput
                    style={[styles.rowInput, { flex: 1, textAlign: 'center', fontWeight: '700' }]}
                    value={entry.quantity > 0 ? String(entry.quantity) : ''}
                    onChangeText={(val) => handleQuantityChange(entry.id, val)}
                    placeholder="1"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="numeric"
                  />

                  {/* Price */}
                  <Text style={[styles.priceCell, { flex: 1.1 }]}>₹{entry.totalPrice}</Text>

                  {/* Delete Row */}
                  <TouchableOpacity
                    style={styles.deleteRowBtn}
                    onPress={() => handleRemoveRow(entry.id)}
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Limit Alert Banner */}
            {limitAlert && (
              <View style={styles.limitAlertBox}>
                <AlertTriangle size={24} color="#DC2626" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.limitAlertTitle}>Booking Limit Exceeded</Text>
                  <Text style={styles.limitAlertDesc}>
                    Number <Text style={{ fontWeight: '800' }}>{limitAlert.number}</Text> has reached maximum allocation limit.
                  </Text>
                  <Text style={styles.limitAlertSub}>
                    Max: {limitAlert.maxQuantity} • Accepted: {limitAlert.currentlyAccepted} • Available: {limitAlert.remaining}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Summary & Action */}
          <View style={styles.footer}>
            <View style={styles.footerSummary}>
              <View>
                <Text style={styles.summaryLabel}>Total Units</Text>
                <Text style={styles.summaryVal}>{totalCount}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.summaryLabel}>Total Amount</Text>
                <Text style={[styles.summaryVal, { color: colors.emeraldDark }]}>₹{totalAmount.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveChanges}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Save size={18} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  bodyScroll: {
    padding: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  entriesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  addRowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00A86B',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 6,
  },
  rowInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 14,
    color: '#0F172A',
  },
  modePillContainer: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  modePill: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modePillActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#00A86B',
  },
  modePillBoxActive: {
    backgroundColor: '#FCE7F3',
    borderColor: '#EC4899',
  },
  modePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  modePillTextActive: {
    color: '#00A86B',
    fontWeight: '800',
  },
  priceCell: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emeraldDark,
    textAlign: 'right',
  },
  deleteRowBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  limitAlertBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    alignItems: 'flex-start',
  },
  limitAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  limitAlertDesc: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 2,
  },
  limitAlertSub: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 4,
    fontWeight: '600',
  },
  footer: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 16,
  },
  footerSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  summaryVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.emerald,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

