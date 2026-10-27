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
import { ArrowLeft, ShieldAlert, Plus, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react-native';

interface NumberLimitsScreenProps {
  onBack: () => void;
}

export const NumberLimitsScreen: React.FC<NumberLimitsScreenProps> = ({ onBack }) => {
  const [draws, setDraws] = useState<any[]>([]);
  const [selectedDrawId, setSelectedDrawId] = useState<string>('');
  const [limits, setLimits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  // Set Limit Modal State
  const [showModal, setShowModal] = useState(false);
  const [targetNumber, setTargetNumber] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDraws();
  }, []);

  useEffect(() => {
    if (selectedDrawId) {
      loadLimits(selectedDrawId);
    }
  }, [selectedDrawId]);

  const loadDraws = async () => {
    setLoading(true);
    try {
      const res = await api.getDraws();
      setDraws(res.draws || []);
      if (res.draws && res.draws.length > 0) {
        setSelectedDrawId(res.draws[0].id);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load draws');
    } finally {
      setLoading(false);
    }
  };

  const loadLimits = async (drawId: string) => {
    try {
      const res = await api.getLimits(drawId);
      setLimits(res.limits || []);
    } catch {}
  };

  const handleSaveLimit = async () => {
    if (!selectedDrawId || !targetNumber.trim() || !maxQty) {
      Alert.alert('Required', 'Please fill in draw, number, and maximum limit');
      return;
    }

    const qty = parseInt(maxQty, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Invalid', 'Max quantity must be a non-negative number');
      return;
    }

    setSaving(true);
    try {
      await api.setLimit(selectedDrawId, targetNumber.trim(), qty);
      Alert.alert('Limit Saved', `Cap set to ${qty} for number ${targetNumber.trim()}`);
      setShowModal(false);
      setTargetNumber('');
      setMaxQty('');
      loadLimits(selectedDrawId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to set limit');
    } finally {
      setSaving(false);
    }
  };

  const handleReconcile = async () => {
    if (!selectedDrawId) return;

    setReconciling(true);
    try {
      const res = await api.reconcileLimits(selectedDrawId);
      Alert.alert(
        'Reconciliation Complete',
        `Limit counters successfully reconciled against all active ticket records (${res.reconciledNumbers} numbers updated).`
      );
      loadLimits(selectedDrawId);
    } catch (err: any) {
      Alert.alert('Reconciliation Error', err.message || 'Failed to reconcile counters');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Number Limits & Caps</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowModal(true)}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Set Cap</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Draw Selector */}
        <Text style={styles.sectionLabel}>SELECT DRAW INSTANCE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.drawsRow}>
          {draws.map((d) => {
            const active = d.id === selectedDrawId;
            return (
              <TouchableOpacity
                key={d.id}
                style={[styles.drawPill, active && styles.drawPillActive]}
                onPress={() => setSelectedDrawId(d.id)}
              >
                <Text style={[styles.drawPillText, active && styles.drawPillTextActive]}>
                  {d.game_name} ({d.draw_time})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Reconcile Action Button */}
        <TouchableOpacity
          style={styles.reconcileBtn}
          activeOpacity={0.8}
          disabled={reconciling}
          onPress={handleReconcile}
        >
          {reconciling ? (
            <ActivityIndicator color={colors.emeraldDark} size="small" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={15} color={colors.emeraldDark} />
              <Text style={styles.reconcileBtnText}>Reconcile Counters from Authoritative Tickets</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Limits Table / Cards */}
        <Text style={styles.sectionLabel}>CONFIGURED CAPACITY LIMITS ({limits.length})</Text>

        {limits.length === 0 ? (
          <View style={styles.emptyCard}>
            <ShieldAlert size={36} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No Number Limits Configured</Text>
            <Text style={styles.emptySub}>
              Tap "Set Cap" above to enforce a maximum quantity limit on any number for this draw.
            </Text>
          </View>
        ) : (
          limits.map((l) => {
            const usagePercent = Math.min(100, Math.round((l.accepted_quantity / l.max_quantity) * 100)) || 0;
            const isNearCap = usagePercent >= 80;

            return (
              <View key={l.number} style={styles.limitCard}>
                <View style={styles.limitCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={styles.limitNumberBadge}>{l.number}</Text>
                    {isNearCap && (
                      <View style={styles.warningPill}>
                        <AlertTriangle size={12} color="#DC2626" />
                        <Text style={styles.warningText}>Near Cap ({usagePercent}%)</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setTargetNumber(l.number);
                      setMaxQty(String(l.max_quantity));
                      setShowModal(true);
                    }}
                  >
                    <Text style={styles.editLimitText}>Edit Cap</Text>
                  </TouchableOpacity>
                </View>

                {/* Progress bar */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${usagePercent}%`,
                        backgroundColor: isNearCap ? '#DC2626' : colors.emerald,
                      },
                    ]}
                  />
                </View>

                {/* Grid stats */}
                <View style={styles.limitGrid}>
                  <View style={styles.limitCol}>
                    <Text style={styles.statLabel}>Max Allowed</Text>
                    <Text style={styles.statVal}>{l.max_quantity}</Text>
                  </View>
                  <View style={styles.limitCol}>
                    <Text style={styles.statLabel}>Accepted (All Agents)</Text>
                    <Text style={[styles.statVal, { color: '#0F172A' }]}>{l.accepted_quantity}</Text>
                  </View>
                  <View style={styles.limitCol}>
                    <Text style={styles.statLabel}>Remaining</Text>
                    <Text
                      style={[
                        styles.statVal,
                        { color: l.remaining_quantity === 0 ? '#DC2626' : colors.emeraldDark },
                      ]}
                    >
                      {l.remaining_quantity}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Set Limit Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set Number Capacity Cap</Text>
            <Text style={styles.modalSub}>
              This cap applies across ALL agents under your organization.
            </Text>

            <Text style={styles.fieldLabel}>Number *</Text>
            <TextInput
              style={[styles.input, styles.numberInput]}
              value={targetNumber}
              onChangeText={setTargetNumber}
              placeholder="e.g. 717"
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>Maximum Allowed Quantity *</Text>
            <TextInput
              style={styles.input}
              value={maxQty}
              onChangeText={setMaxQty}
              placeholder="e.g. 100"
              keyboardType="numeric"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, saving && { opacity: 0.7 }]}
                disabled={saving}
                onPress={handleSaveLimit}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save Cap</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  drawsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  drawPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 8,
  },
  drawPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  drawPillText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  drawPillTextActive: {
    color: '#FFFFFF',
  },
  reconcileBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  reconcileBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.emeraldDark,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  limitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  limitCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  limitNumberBadge: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  editLimitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
  },
  limitGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
  },
  limitCol: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
  },
  statVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
  },
  numberInput: {
    fontSize: 22,
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1.5,
    paddingVertical: 12,
    backgroundColor: '#0284C7',
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
