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
  UserPlus,
  KeyRound,
  CheckCircle2,
  XCircle,
  Shield,
  Tag,
  Coins,
  ChevronDown,
  ChevronUp,
  Settings2,
  Save,
} from 'lucide-react-native';

interface ManageUsersScreenProps {
  onBack: () => void;
}

const DEFAULT_CATEGORIES = [
  { mode: 'SUPER', label: 'SUPER (3 Digits)', group: 'Group 3', defaultPrice: '10' },
  { mode: 'BOX', label: 'BOX (3 Digits)', group: 'Group 3', defaultPrice: '10' },
  { mode: 'AB', label: 'AB (2 Digits)', group: 'Group 2', defaultPrice: '10' },
  { mode: 'BC', label: 'BC (2 Digits)', group: 'Group 2', defaultPrice: '10' },
  { mode: 'AC', label: 'AC (2 Digits)', group: 'Group 2', defaultPrice: '10' },
  { mode: 'A', label: 'A (1 Digit)', group: 'Group 1', defaultPrice: '12' },
  { mode: 'B', label: 'B (1 Digit)', group: 'Group 1', defaultPrice: '12' },
  { mode: 'C', label: 'C (1 Digit)', group: 'Group 1', defaultPrice: '12' },
];

export const ManageUsersScreen: React.FC<ManageUsersScreenProps> = ({ onBack }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New User Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Price Setting in New User Modal
  const [newUserSelectedGame, setNewUserSelectedGame] = useState<string>('ALL'); // 'ALL' or gameId
  const [newUserPrices, setNewUserPrices] = useState<Record<string, Record<string, string>>>({
    ALL: {
      SUPER: '10',
      BOX: '10',
      AB: '10',
      BC: '10',
      AC: '10',
      A: '12',
      B: '12',
      C: '12',
    },
  });

  // Dedicated Edit Prices Modal for Existing User
  const [priceModalUser, setPriceModalUser] = useState<any | null>(null);
  const [editPriceGame, setEditPriceGame] = useState<string>('ALL');
  const [editUserPrices, setEditUserPrices] = useState<Record<string, Record<string, string>>>({
    ALL: {
      SUPER: '10',
      BOX: '10',
      AB: '10',
      BC: '10',
      AC: '10',
      A: '12',
      B: '12',
      C: '12',
    },
  });
  const [savingPrices, setSavingPrices] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Reset Password Modal State
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const res = await api.getGames();
      setGames(res.games || []);
    } catch {}
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChangeForNewUser = (gameKey: string, mode: string, val: string) => {
    setNewUserPrices((prev) => ({
      ...prev,
      [gameKey]: {
        ...(prev[gameKey] || prev['ALL'] || {}),
        [mode]: val,
      },
    }));
  };

  const handlePriceChangeForEditUser = (gameKey: string, mode: string, val: string) => {
    setEditUserPrices((prev) => ({
      ...prev,
      [gameKey]: {
        ...(prev[gameKey] || prev['ALL'] || {}),
        [mode]: val,
      },
    }));
  };

  const openPriceEditModal = async (user: any) => {
    setPriceModalUser(user);
    setEditPriceGame('ALL');
    setLoadingPrices(true);
    try {
      const res = await api.getUserPrices(user.id);
      const initialMap: Record<string, Record<string, string>> = {
        ALL: {
          SUPER: '10',
          BOX: '10',
          AB: '10',
          BC: '10',
          AC: '10',
          A: '12',
          B: '12',
          C: '12',
        },
      };

      if (res.prices && res.prices.length > 0) {
        for (const p of res.prices) {
          const gKey = p.gameId || 'ALL';
          if (!initialMap[gKey]) {
            initialMap[gKey] = { ...initialMap['ALL'] };
          }
          initialMap[gKey][p.mode] = String(p.price);
        }
      }

      setEditUserPrices(initialMap);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load user prices');
    } finally {
      setLoadingPrices(false);
    }
  };

  const handleSaveEditPrices = async () => {
    if (!priceModalUser) return;
    setSavingPrices(true);
    try {
      const priceArray: any[] = [];
      for (const [gameKey, modeMap] of Object.entries(editUserPrices)) {
        const gameId = gameKey === 'ALL' ? null : gameKey;
        for (const [mode, priceStr] of Object.entries(modeMap)) {
          const numPrice = parseFloat(priceStr);
          if (!isNaN(numPrice) && numPrice >= 0) {
            priceArray.push({
              gameId,
              mode,
              price: numPrice,
              commission: 0,
            });
          }
        }
      }

      await api.setUserPrices(priceModalUser.id, priceArray);
      Alert.alert('Success', `Ticket price settings updated for ${priceModalUser.username}`);
      setPriceModalUser(null);
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save prices');
    } finally {
      setSavingPrices(false);
    }
  };

  const handleCreateUser = async () => {
    const cleanUser = newUsername.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(cleanUser)) {
      setAddError('Username must be exactly 4 alphanumeric characters (A-Z, 0-9)');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setAddError('Password must be at least 6 characters');
      return;
    }

    // Assemble ticket prices array from newUserPrices
    const priceArray: any[] = [];
    for (const [gameKey, modeMap] of Object.entries(newUserPrices)) {
      const gameId = gameKey === 'ALL' ? null : gameKey;
      for (const [mode, priceStr] of Object.entries(modeMap)) {
        const numPrice = parseFloat(priceStr);
        if (!isNaN(numPrice) && numPrice >= 0) {
          priceArray.push({
            gameId,
            mode,
            price: numPrice,
            commission: 0,
          });
        }
      }
    }

    setCreating(true);
    setAddError(null);
    try {
      await api.createUser(cleanUser, newPassword, priceArray);
      setShowAddModal(false);
      setNewUsername('');
      setNewPassword('');
      loadUsers();
      Alert.alert('Agent Created', `Agent ${cleanUser} created with customized ticket prices!`);
    } catch (err: any) {
      setAddError(err.message || 'Could not create user');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (user: any) => {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api.updateUserStatus(user.id, nextStatus);
      loadUsers();
    } catch (err: any) {
      Alert.alert('Status Error', err.message || 'Failed to update user status');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !resetPassValue || resetPassValue.length < 6) {
      Alert.alert('Invalid', 'Password must be at least 6 characters');
      return;
    }

    setResetting(true);
    try {
      await api.resetPassword(selectedUser.id, resetPassValue);
      Alert.alert('Success', `Password reset for Agent ${selectedUser.username}`);
      setSelectedUser(null);
      setResetPassValue('');
    } catch (err: any) {
      Alert.alert('Reset Failed', err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Management</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
        >
          <UserPlus size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>New Agent</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>ASSIGNED AGENTS ({users.length})</Text>

        {loading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginTop: 20 }} />
        ) : users.length === 0 ? (
          <Text style={styles.emptyText}>No users created yet.</Text>
        ) : (
          users.map((u) => {
            const isActive = u.status === 'ACTIVE';
            return (
              <View key={u.id} style={styles.userCard}>
                <View style={styles.userCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>{u.username.substring(0, 2)}</Text>
                    </View>
                    <View>
                      <Text style={styles.usernameText}>Agent {u.username}</Text>
                      <Text style={styles.userDateText}>
                        Joined {new Date(u.created_at).toLocaleDateString('en-IN')}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.statusPill,
                      isActive ? styles.statusActive : styles.statusSuspended,
                    ]}
                    onPress={() => handleToggleStatus(u)}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: isActive ? colors.emeraldDark : colors.danger },
                      ]}
                    >
                      {u.status}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Sales stats and actions */}
                <View style={styles.statsRow}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Tickets Sold</Text>
                    <Text style={styles.statVal}>{u.ticket_count || 0}</Text>
                  </View>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Total Sales</Text>
                    <Text style={[styles.statVal, { color: colors.emeraldDark }]}>
                      ₹{u.total_sales || 0}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.pricesBtn}
                      onPress={() => openPriceEditModal(u)}
                    >
                      <Coins size={14} color="#059669" />
                      <Text style={styles.pricesBtnText}>Prices</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.resetPassBtn}
                      onPress={() => setSelectedUser(u)}
                    >
                      <KeyRound size={14} color="#2563EB" />
                      <Text style={styles.resetPassText}>Pass</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* MODAL 1: Add User Modal with Scrollable Ticket Price Settings */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Onboard New Agent</Text>
            <Text style={styles.modalSub}>Give username, password and individual ticket prices</Text>

            {addError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{addError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={true} style={{ flexGrow: 0, maxHeight: 420 }}>
              <Text style={styles.fieldLabel}>4-Character Username *</Text>
              <TextInput
                style={styles.input}
                value={newUsername}
                onChangeText={(t) => {
                  setNewUsername(t.toUpperCase());
                  if (addError) setAddError(null);
                }}
                placeholder="e.g. 0925 or AG01"
                maxLength={4}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Initial Password *</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimum 6 characters"
                secureTextEntry
              />

              {/* Individual Ticket Price Settings Window */}
              <View style={styles.priceSectionHeader}>
                <Coins size={16} color="#059669" />
                <Text style={styles.priceSectionTitle}>INDIVIDUAL TICKET PRICE SETTINGS</Text>
              </View>
              <Text style={styles.priceSectionSubtitle}>
                Custom rate per ticket category for this agent during calculation.
              </Text>

              {/* Game selection pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gamePillsScroll}>
                <TouchableOpacity
                  style={[
                    styles.gamePill,
                    newUserSelectedGame === 'ALL' && styles.gamePillActive,
                  ]}
                  onPress={() => setNewUserSelectedGame('ALL')}
                >
                  <Text
                    style={[
                      styles.gamePillText,
                      newUserSelectedGame === 'ALL' && styles.gamePillTextActive,
                    ]}
                  >
                    All Games (Default)
                  </Text>
                </TouchableOpacity>
                {games.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      styles.gamePill,
                      newUserSelectedGame === g.id && styles.gamePillActive,
                    ]}
                    onPress={() => setNewUserSelectedGame(g.id)}
                  >
                    <Text
                      style={[
                        styles.gamePillText,
                        newUserSelectedGame === g.id && styles.gamePillTextActive,
                      ]}
                    >
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Scrollable Category Price Table */}
              <View style={styles.priceTableContainer}>
                <View style={styles.priceTableHeader}>
                  <Text style={[styles.priceTableHeaderCol, { flex: 1.8 }]}>Category</Text>
                  <Text style={[styles.priceTableHeaderCol, { flex: 1 }]}>Group</Text>
                  <Text style={[styles.priceTableHeaderCol, { flex: 1.2, textAlign: 'right' }]}>Rate (₹)</Text>
                </View>

                {DEFAULT_CATEGORIES.map((cat) => {
                  const currentVal =
                    newUserPrices[newUserSelectedGame]?.[cat.mode] ??
                    newUserPrices['ALL']?.[cat.mode] ??
                    cat.defaultPrice;

                  return (
                    <View key={cat.mode} style={styles.priceTableRow}>
                      <View style={{ flex: 1.8 }}>
                        <Text style={styles.priceRowMode}>{cat.mode}</Text>
                        <Text style={styles.priceRowSub}>{cat.label}</Text>
                      </View>
                      <Text style={[styles.priceRowGroup, { flex: 1 }]}>{cat.group}</Text>
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <TextInput
                          style={styles.priceInputSmall}
                          keyboardType="numeric"
                          value={currentVal}
                          onChangeText={(val) =>
                            handlePriceChangeForNewUser(newUserSelectedGame, cat.mode, val)
                          }
                          placeholder={cat.defaultPrice}
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, creating && { opacity: 0.7 }]}
                disabled={creating}
                onPress={handleCreateUser}
              >
                {creating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Create Agent & Save Prices</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 2: Dedicated Scrollable Price Settings Window for Existing Agent */}
      <Modal visible={!!priceModalUser} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <View style={styles.modalCardHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Ticket Price Settings</Text>
                <Text style={styles.modalSub}>
                  Agent: {priceModalUser?.username} • Customizable per game & category
                </Text>
              </View>
              <Coins size={22} color="#059669" />
            </View>

            {loadingPrices ? (
              <ActivityIndicator color={colors.emerald} style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={true} style={{ flexGrow: 0, maxHeight: 380 }}>
                {/* Game Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gamePillsScroll}>
                  <TouchableOpacity
                    style={[
                      styles.gamePill,
                      editPriceGame === 'ALL' && styles.gamePillActive,
                    ]}
                    onPress={() => setEditPriceGame('ALL')}
                  >
                    <Text
                      style={[
                        styles.gamePillText,
                        editPriceGame === 'ALL' && styles.gamePillTextActive,
                      ]}
                    >
                      All Games (Default)
                    </Text>
                  </TouchableOpacity>
                  {games.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.gamePill,
                        editPriceGame === g.id && styles.gamePillActive,
                      ]}
                      onPress={() => setEditPriceGame(g.id)}
                    >
                      <Text
                        style={[
                          styles.gamePillText,
                          editPriceGame === g.id && styles.gamePillTextActive,
                        ]}
                      >
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Scrollable table of categories */}
                <View style={styles.priceTableContainer}>
                  <View style={styles.priceTableHeader}>
                    <Text style={[styles.priceTableHeaderCol, { flex: 1.8 }]}>Category</Text>
                    <Text style={[styles.priceTableHeaderCol, { flex: 1 }]}>Group</Text>
                    <Text style={[styles.priceTableHeaderCol, { flex: 1.2, textAlign: 'right' }]}>Rate (₹)</Text>
                  </View>

                  {DEFAULT_CATEGORIES.map((cat) => {
                    const currentVal =
                      editUserPrices[editPriceGame]?.[cat.mode] ??
                      editUserPrices['ALL']?.[cat.mode] ??
                      cat.defaultPrice;

                    return (
                      <View key={cat.mode} style={styles.priceTableRow}>
                        <View style={{ flex: 1.8 }}>
                          <Text style={styles.priceRowMode}>{cat.mode}</Text>
                          <Text style={styles.priceRowSub}>{cat.label}</Text>
                        </View>
                        <Text style={[styles.priceRowGroup, { flex: 1 }]}>{cat.group}</Text>
                        <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                          <TextInput
                            style={styles.priceInputSmall}
                            keyboardType="numeric"
                            value={currentVal}
                            onChangeText={(val) =>
                              handlePriceChangeForEditUser(editPriceGame, cat.mode, val)
                            }
                            placeholder={cat.defaultPrice}
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPriceModalUser(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, savingPrices && { opacity: 0.7 }]}
                disabled={savingPrices}
                onPress={handleSaveEditPrices}
              >
                {savingPrices ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save Prices</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 3: Reset Password Modal */}
      <Modal visible={!!selectedUser} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSub}>Agent: {selectedUser?.username}</Text>

            <Text style={styles.fieldLabel}>New Password *</Text>
            <TextInput
              style={styles.input}
              value={resetPassValue}
              onChangeText={setResetPassValue}
              placeholder="Minimum 6 characters"
              secureTextEntry
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSelectedUser(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, resetting && { opacity: 0.7 }]}
                disabled={resetting}
                onPress={handleResetPassword}
              >
                {resetting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save Password</Text>
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
    gap: 6,
    backgroundColor: colors.emerald,
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
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    paddingVertical: 30,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  userAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.emeraldDark,
  },
  usernameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  userDateText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#ECFDF5',
  },
  statusSuspended: {
    backgroundColor: '#FEF2F2',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
  },
  statBlock: {
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  resetPassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  resetPassText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
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
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
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
    backgroundColor: colors.emerald,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  pricesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  pricesBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  modalCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 2,
  },
  priceSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  priceSectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  gamePillsScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  gamePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gamePillActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
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
  priceTableContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 10,
  },
  priceTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  priceTableHeaderCol: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  priceTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  priceRowMode: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  priceRowSub: {
    fontSize: 10,
    color: '#64748B',
  },
  priceRowGroup: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  priceInputSmall: {
    width: 60,
    height: 32,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
});
