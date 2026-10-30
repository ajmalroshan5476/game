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
  KeyboardAvoidingView,
} from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme/colors';
import {
  ArrowLeft,
  ShieldAlert,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Ban,
  Layers,
  ChevronRight,
  Filter,
} from 'lucide-react-native';

interface NumberLimitsScreenProps {
  onBack: () => void;
}

export const NumberLimitsScreen: React.FC<NumberLimitsScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'universal' | 'draw'>('universal');

  // Games & Draws
  const [games, setGames] = useState<any[]>([]);
  const [draws, setDraws] = useState<any[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('ALL');
  const [selectedDrawId, setSelectedDrawId] = useState<string>('');

  // Universal Game Range Limits State
  const [gameLimits, setGameLimits] = useState<any[]>([]);
  const [loadingGameLimits, setLoadingGameLimits] = useState(true);
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [rangeGameId, setRangeGameId] = useState('');
  const [rangeDigitType, setRangeDigitType] = useState<number>(3); // 1, 2, or 3
  const [startRange, setStartRange] = useState('000');
  const [endRange, setEndRange] = useState('999');
  const [rangeMaxCap, setRangeMaxCap] = useState('100');
  const [savingRange, setSavingRange] = useState(false);

  // Draw Specific Limits State
  const [limits, setLimits] = useState<any[]>([]);
  const [loadingDrawLimits, setLoadingDrawLimits] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [targetNumber, setTargetNumber] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [savingSingle, setSavingSingle] = useState(false);

  useEffect(() => {
    loadGamesAndDraws();
  }, []);

  useEffect(() => {
    loadGameRangeLimits(selectedGameId);
  }, [selectedGameId]);

  useEffect(() => {
    if (selectedDrawId) {
      loadLimits(selectedDrawId);
    }
  }, [selectedDrawId]);

  const loadGamesAndDraws = async () => {
    try {
      const [gamesRes, drawsRes] = await Promise.all([api.getGames(), api.getDraws()]);
      const gList = gamesRes.games || [];
      const dList = drawsRes.draws || [];
      setGames(gList);
      setDraws(dList);
      if (gList.length > 0) {
        setRangeGameId(gList[0].id);
      }
      if (dList.length > 0) {
        setSelectedDrawId(dList[0].id);
      }
    } catch {}
  };

  const loadGameRangeLimits = async (gameId?: string) => {
    setLoadingGameLimits(true);
    try {
      const res = await api.getGameLimits(gameId === 'ALL' ? undefined : gameId);
      setGameLimits(res.limits || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load universal limits');
    } finally {
      setLoadingGameLimits(false);
    }
  };

  const loadLimits = async (drawId: string) => {
    setLoadingDrawLimits(true);
    try {
      const res = await api.getLimits(drawId);
      setLimits(res.limits || []);
    } catch {} finally {
      setLoadingDrawLimits(false);
    }
  };

  const handleDigitTypeChange = (type: number) => {
    setRangeDigitType(type);
    if (type === 1) {
      setStartRange('0');
      setEndRange('9');
    } else if (type === 2) {
      setStartRange('00');
      setEndRange('99');
    } else {
      setStartRange('000');
      setEndRange('999');
    }
  };

  const handleSaveRangeLimit = async () => {
    if (!rangeGameId || !startRange || !endRange || rangeMaxCap === '') {
      Alert.alert('Required', 'Please specify game, range, and cap');
      return;
    }

    const capNum = parseInt(rangeMaxCap, 10);
    if (isNaN(capNum) || capNum < 0) {
      Alert.alert('Invalid Cap', 'Cap must be a non-negative number (0 for blocking)');
      return;
    }

    setSavingRange(true);
    try {
      await api.setGameLimit({
        gameId: rangeGameId,
        digitType: rangeDigitType,
        startRange,
        endRange,
        maxCap: capNum,
      });

      Alert.alert(
        'Universal Limit Enforced',
        capNum === 0
          ? `Numbers ${startRange} to ${endRange} are now BLOCKED for this game.`
          : `Range ${startRange} to ${endRange} is now capped at ${capNum} total units across all users.`
      );

      setShowRangeModal(false);
      loadGameRangeLimits(selectedGameId);
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save limit');
    } finally {
      setSavingRange(false);
    }
  };

  const handleDeleteRangeLimit = async (id: string, rangeStr: string) => {
    Alert.alert(
      'Remove Limit',
      `Are you sure you want to remove the limit for range ${rangeStr}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteGameLimit(id);
              loadGameRangeLimits(selectedGameId);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete limit');
            }
          },
        },
      ]
    );
  };

  const handleSaveSingleLimit = async () => {
    if (!selectedDrawId || !targetNumber.trim() || !maxQty) {
      Alert.alert('Required', 'Please fill in draw, number, and maximum limit');
      return;
    }

    const qty = parseInt(maxQty, 10);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Invalid', 'Max quantity must be a non-negative number');
      return;
    }

    setSavingSingle(true);
    try {
      await api.setLimit(selectedDrawId, targetNumber.trim(), qty);
      Alert.alert('Limit Saved', `Cap set to ${qty} for number ${targetNumber.trim()}`);
      setShowSingleModal(false);
      setTargetNumber('');
      setMaxQty('');
      loadLimits(selectedDrawId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to set limit');
    } finally {
      setSavingSingle(false);
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
        <Text style={styles.headerTitle}>Universal Limits & Caps</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (activeTab === 'universal') {
              setShowRangeModal(true);
            } else {
              setShowSingleModal(true);
            }
          }}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>
            {activeTab === 'universal' ? 'Set Range Cap' : 'Set Single Cap'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mode Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'universal' && styles.tabBtnActive]}
          onPress={() => setActiveTab('universal')}
          activeOpacity={0.8}
        >
          <Layers size={16} color={activeTab === 'universal' ? '#007BFF' : '#64748B'} />
          <Text style={[styles.tabBtnText, activeTab === 'universal' && styles.tabBtnTextActive]}>
            Universal Game Limits (Range)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'draw' && styles.tabBtnActive]}
          onPress={() => setActiveTab('draw')}
          activeOpacity={0.8}
        >
          <ShieldAlert size={16} color={activeTab === 'draw' ? '#007BFF' : '#64748B'} />
          <Text style={[styles.tabBtnText, activeTab === 'draw' && styles.tabBtnTextActive]}>
            Draw Specific Caps
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'universal' ? (
          <View>
            {/* Filter by Game Pills */}
            <Text style={styles.sectionLabel}>FILTER BY GAME</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
              <TouchableOpacity
                style={[styles.gamePill, selectedGameId === 'ALL' && styles.gamePillActive]}
                onPress={() => setSelectedGameId('ALL')}
              >
                <Text style={[styles.gamePillText, selectedGameId === 'ALL' && styles.gamePillTextActive]}>
                  All Games
                </Text>
              </TouchableOpacity>
              {games.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.gamePill, selectedGameId === g.id && styles.gamePillActive]}
                  onPress={() => setSelectedGameId(g.id)}
                >
                  <Text style={[styles.gamePillText, selectedGameId === g.id && styles.gamePillTextActive]}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Explanatory Info Card */}
            <View style={styles.infoBanner}>
              <View style={styles.infoBannerIcon}>
                <ShieldAlert size={20} color="#0284C7" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.infoBannerTitle}>Universal Total User Cap & Block</Text>
                <Text style={styles.infoBannerText}>
                  Limits set here apply to all total users under your agency for that game. Set max cap to 100 to limit capacity, or 0 to completely block booking numbers in that range.
                </Text>
              </View>
            </View>

            {/* Limits List */}
            <Text style={styles.sectionLabel}>
              ACTIVE UNIVERSAL GAME LIMITS ({gameLimits.length})
            </Text>

            {loadingGameLimits ? (
              <ActivityIndicator color={colors.emerald} style={{ marginVertical: 30 }} />
            ) : gameLimits.length === 0 ? (
              <View style={styles.emptyCard}>
                <ShieldAlert size={36} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No Universal Limits Set</Text>
                <Text style={styles.emptySub}>
                  Tap "+ Set Range Cap" above to block or cap ranges like 000-999, 00-99, or 0-9 for any game.
                </Text>
              </View>
            ) : (
              gameLimits.map((gl) => {
                const isBlocked = gl.maxCap === 0;
                return (
                  <View key={gl.id} style={styles.rangeLimitCard}>
                    <View style={styles.rangeCardTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.rangeGameBadge}>{gl.gameName}</Text>
                        <View style={styles.digitTypeBadge}>
                          <Text style={styles.digitTypeBadgeText}>
                            {gl.digitType === 1 ? '1 Digit' : gl.digitType === 2 ? '2 Digits' : '3 Digits'}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          isBlocked ? styles.statusBadgeBlocked : styles.statusBadgeCapped,
                        ]}
                      >
                        {isBlocked ? (
                          <>
                            <Ban size={12} color="#DC2626" />
                            <Text style={styles.statusBadgeBlockedText}>BLOCKED</Text>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={12} color="#059669" />
                            <Text style={styles.statusBadgeCappedText}>CAP: {gl.maxCap}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {/* Range numbers */}
                    <View style={styles.rangeCardMid}>
                      <View>
                        <Text style={styles.rangeNumbersLabel}>Enforced Number Range</Text>
                        <Text style={styles.rangeNumbersText}>
                          {gl.startRange} → {gl.endRange}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.deleteLimitBtn}
                        onPress={() =>
                          handleDeleteRangeLimit(gl.id, `${gl.startRange}-${gl.endRange}`)
                        }
                      >
                        <Trash2 size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.rangeCardFooter}>
                      {isBlocked
                        ? 'Total users under you are completely blocked from entering numbers in this range.'
                        : `Total users under you cannot exceed ${gl.maxCap} tickets per number in this range.`}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View>
            {/* Draw Selector for Single Limits */}
            <Text style={styles.sectionLabel}>SELECT DRAW INSTANCE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
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

            {loadingDrawLimits ? (
              <ActivityIndicator color={colors.emerald} style={{ marginVertical: 30 }} />
            ) : limits.length === 0 ? (
              <View style={styles.emptyCard}>
                <ShieldAlert size={36} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No Number Limits Configured</Text>
                <Text style={styles.emptySub}>
                  Tap "Set Single Cap" above to enforce a maximum quantity limit on any number for this draw.
                </Text>
              </View>
            ) : (
              limits.map((l) => {
                const usagePercent =
                  Math.min(100, Math.round((l.accepted_quantity / l.max_quantity) * 100)) || 0;
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
                          setShowSingleModal(true);
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
                        <Text style={[styles.statVal, { color: '#0F172A' }]}>
                          {l.accepted_quantity}
                        </Text>
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
          </View>
        )}
      </ScrollView>

      {/* MODAL 1: Universal Game Range Limit Modal */}
      <Modal visible={showRangeModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Set Universal Game Range Limit</Text>
            <Text style={styles.modalSub}>
              Enforce a maximum cap (or block with cap 0) for an entire number range.
            </Text>

            <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 420 }}>
              {/* Select Game */}
              <Text style={styles.fieldLabel}>Select Game *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {games.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      styles.gamePill,
                      rangeGameId === g.id && styles.gamePillActive,
                    ]}
                    onPress={() => setRangeGameId(g.id)}
                  >
                    <Text
                      style={[
                        styles.gamePillText,
                        rangeGameId === g.id && styles.gamePillTextActive,
                      ]}
                    >
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Digit Type Selector (1-Digit, 2-Digits, 3-Digits) */}
              <Text style={styles.fieldLabel}>Select Digit Group *</Text>
              <View style={styles.digitSelectorRow}>
                <TouchableOpacity
                  style={[styles.digitTab, rangeDigitType === 1 && styles.digitTabActive]}
                  onPress={() => handleDigitTypeChange(1)}
                >
                  <Text style={[styles.digitTabText, rangeDigitType === 1 && styles.digitTabTextActive]}>
                    Single (0-9)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.digitTab, rangeDigitType === 2 && styles.digitTabActive]}
                  onPress={() => handleDigitTypeChange(2)}
                >
                  <Text style={[styles.digitTabText, rangeDigitType === 2 && styles.digitTabTextActive]}>
                    Double (00-99)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.digitTab, rangeDigitType === 3 && styles.digitTabActive]}
                  onPress={() => handleDigitTypeChange(3)}
                >
                  <Text style={[styles.digitTabText, rangeDigitType === 3 && styles.digitTabTextActive]}>
                    3-Digit (000-999)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Range Inputs */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Start Range</Text>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', fontWeight: '800' }]}
                    value={startRange}
                    onChangeText={setStartRange}
                    placeholder="000"
                    placeholderTextColor="#94A3B8"
                    maxLength={rangeDigitType}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>End Range</Text>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', fontWeight: '800' }]}
                    value={endRange}
                    onChangeText={setEndRange}
                    placeholder="999"
                    placeholderTextColor="#94A3B8"
                    maxLength={rangeDigitType}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Quick Preset Buttons */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                <TouchableOpacity
                  style={styles.presetChip}
                  onPress={() => {
                    if (rangeDigitType === 1) {
                      setStartRange('0');
                      setEndRange('9');
                    } else if (rangeDigitType === 2) {
                      setStartRange('00');
                      setEndRange('99');
                    } else {
                      setStartRange('000');
                      setEndRange('999');
                    }
                  }}
                >
                  <Text style={styles.presetChipText}>Full Range</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetChip, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                  onPress={() => setRangeMaxCap('0')}
                >
                  <Text style={[styles.presetChipText, { color: '#DC2626' }]}>Block (Cap 0)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetChip, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                  onPress={() => setRangeMaxCap('100')}
                >
                  <Text style={[styles.presetChipText, { color: '#059669' }]}>Cap 100</Text>
                </TouchableOpacity>
              </View>

              {/* Max Cap Input */}
              <Text style={styles.fieldLabel}>Maximum Allowed Cap Across All Users *</Text>
              <TextInput
                style={[styles.input, { fontWeight: '800', fontSize: 16 }]}
                value={rangeMaxCap}
                onChangeText={setRangeMaxCap}
                placeholder="e.g. 100 (or 0 to block)"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />
              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                Set 0 to completely block this range. Set 100 to allow at most 100 tickets total across all users under you.
              </Text>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowRangeModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, savingRange && { opacity: 0.7 }]}
                disabled={savingRange}
                onPress={handleSaveRangeLimit}
              >
                {savingRange ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Enforce Universal Limit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 2: Single Number Limit Modal */}
      <Modal visible={showSingleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set Single Number Cap</Text>
            <Text style={styles.modalSub}>
              Set a maximum capacity for a specific number in this draw.
            </Text>

            <Text style={styles.fieldLabel}>Target Number (1, 2, or 3 Digits) *</Text>
            <TextInput
              style={styles.input}
              value={targetNumber}
              onChangeText={setTargetNumber}
              placeholder="e.g. 737, 37, or 7"
              placeholderTextColor="#94A3B8"
              maxLength={3}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>Max Quantity Allowed across All Agents *</Text>
            <TextInput
              style={styles.input}
              value={maxQty}
              onChangeText={setMaxQty}
              placeholder="e.g. 100 (0 to block)"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowSingleModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, savingSingle && { opacity: 0.7 }]}
                disabled={savingSingle}
                onPress={handleSaveSingleLimit}
              >
                {savingSingle ? (
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
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007BFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 3,
    borderRadius: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#007BFF',
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
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  pillsScroll: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  gamePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  gamePillActive: {
    backgroundColor: '#007BFF',
    borderColor: '#007BFF',
  },
  gamePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  gamePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369A1',
  },
  infoBannerText: {
    fontSize: 11,
    color: '#0C4A6E',
    marginTop: 2,
    lineHeight: 15,
  },
  rangeLimitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  rangeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rangeGameBadge: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  digitTypeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  digitTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeBlocked: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeBlockedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  statusBadgeCapped: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgeCappedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  rangeCardMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginVertical: 4,
  },
  rangeNumbersLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  rangeNumbersText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
    marginTop: 2,
  },
  deleteLimitBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeCardFooter: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 15,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  drawPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  drawPillActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  drawPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  drawPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reconcileBtn: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  reconcileBtnText: {
    color: colors.emeraldDark,
    fontSize: 11,
    fontWeight: '700',
  },
  limitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
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
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 6,
    letterSpacing: 1,
  },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warningText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  editLimitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
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
    borderRadius: 3,
  },
  limitGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  limitCol: {
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
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
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
  },
  digitSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
  },
  digitTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  digitTabActive: {
    backgroundColor: '#007BFF',
  },
  digitTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  digitTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
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
    backgroundColor: '#007BFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
