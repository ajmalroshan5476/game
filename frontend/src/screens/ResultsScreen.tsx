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
  SafeAreaView,
  StatusBar,
  Share,
} from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import {
  ArrowLeft,
  ChevronDown,
  Check,
  MessageCircle,
  Trophy,
  Plus,
  X,
  Share2,
  Search,
  CheckCircle2,
  AlertCircle,
  User,
  Award,
} from 'lucide-react-native';

interface ResultsScreenProps {
  onBack: () => void;
  initialTab?: 'board' | 'checking';
}

// Result mode types for filtering view
type ResultModeType = 'MAIN' | 'BOX' | 'AB' | 'BC' | 'AC' | 'A' | 'B' | 'C';

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ onBack, initialTab = 'board' }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'board' | 'checking'>(initialTab);

  // Result Checking state
  const [checkingDrawId, setCheckingDrawId] = useState('');
  const [checkingLoading, setCheckingLoading] = useState(false);
  const [checkingData, setCheckingData] = useState<any | null>(null);

  // Games & Results state
  const [games, setGames] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<any>(null);

  // Filter state
  const today = new Date();
  const todayYMD = today.toISOString().split('T')[0];
  const [dateInput, setDateInput] = useState(todayYMD);
  const [selectedModeType, setSelectedModeType] = useState<ResultModeType>('MAIN');

  // Modals for Dropdowns
  const [pickerModal, setPickerModal] = useState<'game' | 'mode' | null>(null);

  // Admin Publish Modal
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishDrawId, setPublishDrawId] = useState('');
  const [firstPrize, setFirstPrize] = useState('');
  const [secondPrize, setSecondPrize] = useState('');
  const [thirdPrize, setThirdPrize] = useState('');
  const [fourthPrize, setFourthPrize] = useState('');
  const [fifthPrize, setFifthPrize] = useState('');
  const [sixthPrizes, setSixthPrizes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [drawsList, setDrawsList] = useState<any[]>([]);

  // Fetched Results
  const [loading, setLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<any | null>(null);

  useEffect(() => {
    loadGamesAndInitialResult();
  }, []);

  const loadGamesAndInitialResult = async () => {
    try {
      setLoading(true);
      const [gamesRes, drawsRes] = await Promise.all([api.getGames(), api.getDraws()]);
      const gList = gamesRes.games || [];
      const dList = drawsRes.draws || [];
      setGames(gList);
      setDrawsList(dList);

      if (dList.length > 0) {
        setPublishDrawId(dList[0].id);
        setCheckingDrawId(dList[0].id);
        if (initialTab === 'checking') {
          loadResultChecking(dList[0].id);
        }
      }

      if (gList.length > 0) {
        setSelectedGame(gList[0]);
        await fetchResultsForGame(gList[0].id, todayYMD);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  const loadResultChecking = async (drawId: string) => {
    if (!drawId) return;
    setCheckingLoading(true);
    try {
      const data = await api.checkResult(drawId);
      setCheckingData(data);
    } catch (err: any) {
      Alert.alert('Result Checking Error', err.message || 'Failed to check draw results');
      setCheckingData(null);
    } finally {
      setCheckingLoading(false);
    }
  };

  const fetchResultsForGame = async (gameId: string, dateStr: string) => {
    setLoading(true);
    try {
      const res = await api.getResults(dateStr, gameId);
      if (res.results && res.results.length > 0) {
        setCurrentResult(res.results[0]);
      } else {
        setCurrentResult(null);
      }
    } catch {
      setCurrentResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateResult = () => {
    if (!selectedGame) return;
    fetchResultsForGame(selectedGame.id, dateInput);
  };

  // Helper to get game short code number (e.g. "DEAR 1 PM" -> "1", "LSK 3 PM" -> "3")
  const getGameNumber = () => {
    if (!selectedGame) return '1';
    const name = selectedGame.name || '';
    const match = name.match(/(\d+)\s*(?:PM|AM)/i);
    return match ? match[1] : '1';
  };

  // Helper to get game prefix (e.g. "DEAR", "LSK")
  const getGamePrefix = () => {
    if (!selectedGame) return 'DEAR';
    const name = selectedGame.name || '';
    if (name.includes('LSK')) return 'LSK';
    return 'DEAR';
  };

  // Dynamically generate the mode dropdown options matching Screenshot 2
  const getModeOptions = () => {
    const num = getGameNumber();
    const prefix = getGamePrefix();
    const boxPrefix = prefix === 'LSK' ? 'L-BOX' : 'D-BOX';

    return [
      { key: 'MAIN' as ResultModeType, label: `${prefix}-${num}` },
      { key: 'BOX' as ResultModeType, label: `${boxPrefix}-${num}` },
      { key: 'AB' as ResultModeType, label: `${prefix}-AB-${num}` },
      { key: 'BC' as ResultModeType, label: `${prefix}-BC-${num}` },
      { key: 'AC' as ResultModeType, label: `${prefix}-AC-${num}` },
      { key: 'A' as ResultModeType, label: `${prefix}-A-${num}` },
      { key: 'B' as ResultModeType, label: `${prefix}-B-${num}` },
      { key: 'C' as ResultModeType, label: `${prefix}-C-${num}` },
    ];
  };

  const currentModeLabel = () => {
    const opts = getModeOptions();
    const found = opts.find((o) => o.key === selectedModeType);
    return found ? found.label : opts[0].label;
  };

  // Format a 3-digit number according to the selected mode (AB, BC, AC, A, B, C)
  const formatNumberByMode = (numStr: string | null | undefined): string => {
    if (!numStr || numStr.length < 3) return numStr || '-';
    switch (selectedModeType) {
      case 'MAIN':
        return numStr;
      case 'BOX':
        return numStr;
      case 'AB':
        return numStr.substring(0, 2); // First 2 digits
      case 'BC':
        return numStr.substring(1, 3); // Last 2 digits
      case 'AC':
        return numStr[0] + numStr[2]; // 1st and 3rd digit
      case 'A':
        return numStr[0]; // 1st digit
      case 'B':
        return numStr[1]; // 2nd digit
      case 'C':
        return numStr[2]; // 3rd digit
      default:
        return numStr;
    }
  };

  // Admin Publish Handler
  const handlePublish = async () => {
    if (!publishDrawId || !firstPrize.trim()) {
      Alert.alert('Required Fields', 'Draw and 1st Prize are required');
      return;
    }

    setPublishing(true);
    try {
      const sixthArr = sixthPrizes
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await api.publishResult({
        drawId: publishDrawId,
        firstPrize: firstPrize.trim(),
        secondPrize: secondPrize.trim() || undefined,
        thirdPrize: thirdPrize.trim() || undefined,
        fourthPrize: fourthPrize.trim() || undefined,
        fifthPrize: fifthPrize.trim() || undefined,
        sixthPrizes: sixthArr.length > 0 ? sixthArr : undefined,
      });

      Alert.alert(
        'Result Published Successfully!',
        `Winners Generated: ${res.totalWinners}\nTotal Prize Payout: ₹${res.totalPrizePayout}\nTotal Commission: ₹${res.totalCommissionPayout}`
      );

      const targetDrawId = publishDrawId;
      setShowPublishModal(false);
      setFirstPrize('');
      setSecondPrize('');
      setThirdPrize('');
      setFourthPrize('');
      setFifthPrize('');
      setSixthPrizes('');

      if (selectedGame) {
        fetchResultsForGame(selectedGame.id, dateInput);
      }

      // Automatically switch to Result Checking tab to verify winning numbers & usernames
      setActiveTab('checking');
      setCheckingDrawId(targetDrawId);
      await loadResultChecking(targetDrawId);
    } catch (err: any) {
      Alert.alert('Publish Error', err.message || 'Failed to publish results');
    } finally {
      setPublishing(false);
    }
  };

  // Share results to WhatsApp / Social
  const handleShareToWhatsApp = async () => {
    if (!currentResult) {
      Alert.alert('No Results', 'Please generate results to share');
      return;
    }

    const text = `🎯 *${selectedGame?.name || 'GAME'} RESULTS* 🎯\n` +
      `📅 Date: ${dateInput}\n` +
      `Mode: ${currentModeLabel()}\n\n` +
      `1️⃣ 1st: ${formatNumberByMode(currentResult.first_prize)}\n` +
      `2️⃣ 2nd: ${formatNumberByMode(currentResult.second_prize)}\n` +
      `3️⃣ 3rd: ${formatNumberByMode(currentResult.third_prize)}\n` +
      `4️⃣ 4th: ${formatNumberByMode(currentResult.fourth_prize)}\n` +
      `5️⃣ 5th: ${formatNumberByMode(currentResult.fifth_prize)}\n\n` +
      `Good Luck! ✨`;

    try {
      await Share.share({ message: text });
    } catch {}
  };

  // Parse 6th prizes into 3 columns
  const rawSixthList: string[] = Array.isArray(currentResult?.sixth_prizes)
    ? currentResult.sixth_prizes
    : [];

  const sixthNumbers = rawSixthList.map((n) => formatNumberByMode(n));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      {/* TOP HEADER matching screenshot: ArrowLeft, "Results", WhatsApp green icon */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Results</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {user?.role === 'ADMIN' && (
            <TouchableOpacity
              style={styles.adminPublishBtn}
              onPress={() => setShowPublishModal(true)}
            >
              <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.adminPublishBtnText}>Publish</Text>
            </TouchableOpacity>
          )}

          {/* WhatsApp Icon matching screenshot top right */}
          <TouchableOpacity
            style={styles.whatsappIconBtn}
            activeOpacity={0.8}
            onPress={handleShareToWhatsApp}
          >
            <MessageCircle size={22} color="#25D366" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      </View>

      {/* TAB SWITCHER: Official Board vs Result Checking */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'board' && styles.tabBtnActive]}
          onPress={() => setActiveTab('board')}
          activeOpacity={0.8}
        >
          <Trophy size={16} color={activeTab === 'board' ? '#007BFF' : '#64748B'} strokeWidth={2.2} />
          <Text style={[styles.tabBtnText, activeTab === 'board' && styles.tabBtnTextActive]}>
            Official Board
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'checking' && styles.tabBtnActive]}
          onPress={() => {
            setActiveTab('checking');
            const targetDraw = checkingDrawId || currentResult?.draw_id || drawsList[0]?.id;
            if (targetDraw) {
              setCheckingDrawId(targetDraw);
              loadResultChecking(targetDraw);
            }
          }}
          activeOpacity={0.8}
        >
          <Search size={16} color={activeTab === 'checking' ? '#007BFF' : '#64748B'} strokeWidth={2.2} />
          <Text style={[styles.tabBtnText, activeTab === 'checking' && styles.tabBtnTextActive]}>
            Result Checking
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'board' && (
          <View>
            {/* REPLICATED FILTER CARD (Exact layout from screenshot) */}
            <View style={styles.filterCard}>
          {/* Row 1: Full-width Game Dropdown (e.g. "DEAR 1 PM") */}
          <TouchableOpacity
            style={styles.gameDropdownBtn}
            activeOpacity={0.8}
            onPress={() => setPickerModal('game')}
          >
            <Text style={styles.gameDropdownText}>
              {selectedGame?.name || 'Select Game'}
            </Text>
            <ChevronDown size={18} color="#64748B" />
          </TouchableOpacity>

          {/* Row 2: Two Columns: [ Mode Dropdown ] and [ Date Input ] */}
          <View style={styles.twoColRow}>
            {/* Mode Dropdown (e.g. "DEAR-1", "D-BOX-1", "DEAR-AB-1", etc.) */}
            <TouchableOpacity
              style={[styles.dropdownBox, { flex: 1.1 }]}
              activeOpacity={0.8}
              onPress={() => setPickerModal('mode')}
            >
              <Text style={styles.dropdownBoxText}>{currentModeLabel()}</Text>
              <ChevronDown size={18} color="#64748B" />
            </TouchableOpacity>

            {/* Date Input Box */}
            <View style={[styles.dateInputContainer, { flex: 1.1 }]}>
              <TextInput
                style={styles.dateInputText}
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="2026-10-26"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          {/* Row 3: Blue "Generate Result" Button */}
          <TouchableOpacity
            style={styles.generateBtn}
            activeOpacity={0.85}
            onPress={handleGenerateResult}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.generateBtnText}>Generate Result</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* RESULTS DISPLAY SECTION (Exact layout from screenshot 1) */}
        {loading ? (
          <ActivityIndicator size="large" color="#007BFF" style={{ marginTop: 40 }} />
        ) : !currentResult ? (
          <View style={styles.noResultCard}>
            <Trophy size={44} color="#CBD5E1" />
            <Text style={styles.noResultTitle}>No Results Found</Text>
            <Text style={styles.noResultSubtitle}>
              No official results published for {selectedGame?.name} on {dateInput}.
            </Text>
          </View>
        ) : (
          <View style={styles.resultsContainer}>
            {/* 1. TOP GOLDEN CONTAINER (Prizes 1 to 5 with gradient rows) */}
            <View style={styles.goldenTopCard}>
              {/* Row 1 */}
              <View style={[styles.prizeRow, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.prizeRowText}>
                  1 : {formatNumberByMode(currentResult.first_prize)}
                </Text>
              </View>

              {/* Row 2 */}
              <View style={[styles.prizeRow, { backgroundColor: '#FBBF24' }]}>
                <Text style={styles.prizeRowText}>
                  2 : {formatNumberByMode(currentResult.second_prize)}
                </Text>
              </View>

              {/* Row 3 */}
              <View style={[styles.prizeRow, { backgroundColor: '#FCD34D' }]}>
                <Text style={styles.prizeRowText}>
                  3 : {formatNumberByMode(currentResult.third_prize)}
                </Text>
              </View>

              {/* Row 4 */}
              <View style={[styles.prizeRow, { backgroundColor: '#FDE047' }]}>
                <Text style={styles.prizeRowText}>
                  4 : {formatNumberByMode(currentResult.fourth_prize)}
                </Text>
              </View>

              {/* Row 5 */}
              <View style={[styles.prizeRow, { backgroundColor: '#FEF08A' }]}>
                <Text style={styles.prizeRowText}>
                  5 : {formatNumberByMode(currentResult.fifth_prize)}
                </Text>
              </View>
            </View>

            {/* 2. BOTTOM 3-COLUMN TABLE FOR 6TH PRIZES / CONSOLATIONS */}
            {sixthNumbers.length > 0 && (
              <View style={styles.consolationTable}>
                {Array.from({ length: Math.ceil(sixthNumbers.length / 3) }).map((_, rowIdx) => {
                  const num1 = sixthNumbers[rowIdx * 3] || '';
                  const num2 = sixthNumbers[rowIdx * 3 + 1] || '';
                  const num3 = sixthNumbers[rowIdx * 3 + 2] || '';

                  return (
                    <View key={rowIdx} style={styles.consolationRow}>
                      <View style={[styles.consolationCell, styles.cellBorderRight]}>
                        <Text style={styles.consolationCellText}>{num1}</Text>
                      </View>
                      <View style={[styles.consolationCell, styles.cellBorderRight]}>
                        <Text style={styles.consolationCellText}>{num2}</Text>
                      </View>
                      <View style={styles.consolationCell}>
                        <Text style={styles.consolationCellText}>{num3}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    )}

        {/* ==================================================================== */}
        {/* TAB 2: RESULT CHECKING (Admin view: Winning numbers & agent username)  */}
        {/* ==================================================================== */}
        {activeTab === 'checking' && (
          <View style={styles.checkingContainer}>
            {/* Draw Selector Pills */}
            <Text style={styles.checkingSectionTitle}>SELECT GAME DRAW TO INSPECT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.drawPillsScroll}>
              {drawsList.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.checkingDrawPill,
                    checkingDrawId === d.id && styles.checkingDrawPillActive,
                  ]}
                  onPress={() => {
                    setCheckingDrawId(d.id);
                    loadResultChecking(d.id);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.checkingDrawPillText,
                      checkingDrawId === d.id && styles.checkingDrawPillTextActive,
                    ]}
                  >
                    {d.game_name} ({d.draw_time})
                  </Text>
                  {d.status === 'RESULTED' && (
                    <View style={styles.resultedDot} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {checkingLoading ? (
              <ActivityIndicator size="large" color="#007BFF" style={{ marginTop: 30 }} />
            ) : !checkingData ? (
              <View style={styles.noCheckCard}>
                <Search size={36} color="#94A3B8" />
                <Text style={styles.noCheckTitle}>Select a Draw to Inspect</Text>
                <Text style={styles.noCheckSub}>
                  Choose a draw above to verify winning numbers booked by users under you.
                </Text>
              </View>
            ) : (
              <View>
                {/* Official Result Summary for this draw */}
                {checkingData.result ? (
                  <View style={styles.checkResultBox}>
                    <View style={styles.checkResultTop}>
                      <Text style={styles.checkGameTitle}>
                        {checkingData.draw.gameName} ({checkingData.draw.drawTime})
                      </Text>
                      <View style={styles.resultedBadge}>
                        <Text style={styles.resultedBadgeText}>RESULT PUBLISHED</Text>
                      </View>
                    </View>
                    <View style={styles.prizesQuickRow}>
                      <Text style={styles.prizeQuickText}>
                        1st: <Text style={styles.prizeQuickBold}>{checkingData.result.firstPrize}</Text>
                      </Text>
                      {checkingData.result.secondPrize && (
                        <Text style={styles.prizeQuickText}>
                          2nd: <Text style={styles.prizeQuickBold}>{checkingData.result.secondPrize}</Text>
                        </Text>
                      )}
                      {checkingData.result.thirdPrize && (
                        <Text style={styles.prizeQuickText}>
                          3rd: <Text style={styles.prizeQuickBold}>{checkingData.result.thirdPrize}</Text>
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.pendingResultBox}>
                    <AlertCircle size={22} color="#D97706" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.pendingTitle}>Draw Not Resulted Yet</Text>
                      <Text style={styles.pendingSub}>
                        Official results haven't been entered yet for {checkingData.draw.gameName} ({checkingData.draw.drawTime}).
                      </Text>
                    </View>
                    {user?.role === 'ADMIN' && (
                      <TouchableOpacity
                        style={styles.enterResultSmallBtn}
                        onPress={() => {
                          setPublishDrawId(checkingData.draw.id);
                          setShowPublishModal(true);
                        }}
                      >
                        <Text style={styles.enterResultSmallBtnText}>Enter</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* WINNERS STATUS BANNER */}
                {checkingData.result && (
                  checkingData.summary?.hasWinners ? (
                    <View style={styles.winnersFoundBanner}>
                      <View style={styles.bannerIconRow}>
                        <CheckCircle2 size={24} color="#059669" />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.winnersFoundTitle}>
                            WINNING TICKETS DETECTED!
                          </Text>
                          <Text style={styles.winnersFoundSub}>
                            {checkingData.summary.totalWinners} winning entry(ies) sold by users under your agency.
                          </Text>
                        </View>
                      </View>
                      <View style={styles.bannerStatsRow}>
                        <View style={styles.statCol}>
                          <Text style={styles.statColLabel}>Total Prize Payout</Text>
                          <Text style={[styles.statColVal, { color: '#059669' }]}>
                            ₹{checkingData.summary.totalPrize.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.statCol}>
                          <Text style={styles.statColLabel}>Super Commission</Text>
                          <Text style={[styles.statColVal, { color: '#2563EB' }]}>
                            ₹{checkingData.summary.totalCommission.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.noWinnersBanner}>
                      <AlertCircle size={24} color="#64748B" />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.noWinnersTitle}>NO WINNERS IN THIS DRAW</Text>
                        <Text style={styles.noWinnersSub}>
                          None of the numbers booked by users under you matched the winning results for this draw.
                        </Text>
                      </View>
                    </View>
                  )
                )}

                {/* LIST OF WINNING TICKETS & USERS */}
                {checkingData.winners && checkingData.winners.length > 0 && (
                  <View style={styles.winnersListSection}>
                    <Text style={styles.winnersListHeading}>
                      WINNING NUMBERS & AGENT DETAILS ({checkingData.winners.length})
                    </Text>

                    {checkingData.winners.map((w: any) => (
                      <View key={w.id} style={styles.winnerCard}>
                        {/* Agent Username & Prize Position Row */}
                        <View style={styles.winnerCardTop}>
                          <View style={styles.agentBadge}>
                            <User size={13} color="#1E293B" />
                            <Text style={styles.agentBadgeText}>Agent: {w.username}</Text>
                          </View>
                          <View style={styles.positionBadge}>
                            <Award size={13} color="#B45309" />
                            <Text style={styles.positionBadgeText}>{w.prize_position}</Text>
                          </View>
                        </View>

                        {/* Number & Amounts Row */}
                        <View style={styles.winnerCardMid}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.winnerNumBig}>{w.winning_number}</Text>
                            <View style={styles.modePillSmall}>
                              <Text style={styles.modePillSmallText}>{w.mode}</Text>
                            </View>
                            <Text style={styles.winnerQtyText}>x{w.quantity}</Text>
                          </View>

                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.winnerPrizeText}>
                              ₹{parseFloat(w.prize_amount).toLocaleString('en-IN')}
                            </Text>
                            <Text style={styles.winnerCommText}>
                              +₹{parseFloat(w.commission_amount).toLocaleString('en-IN')} Comm
                            </Text>
                          </View>
                        </View>

                        {/* Ticket Number & Customer */}
                        <View style={styles.winnerCardBottom}>
                          <Text style={styles.winnerBillText}>
                            Bill: {w.ticket_number} {w.customer_name ? `• ${w.customer_name}` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* MODAL 1: GAME PICKER */}
      <Modal visible={pickerModal === 'game'} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerModal(null)}
        >
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select Game</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {games.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setSelectedGame(g);
                    setPickerModal(null);
                    fetchResultsForGame(g.id, dateInput);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{g.name}</Text>
                  {selectedGame?.id === g.id && <Check size={18} color="#007BFF" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL 2: MODE PICKER (DEAR-1, D-BOX-1, DEAR-AB-1, etc. matching screenshot 2) */}
      <Modal visible={pickerModal === 'mode'} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerModal(null)}
        >
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select Variation</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {getModeOptions().map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.pickerOption}
                  onPress={() => {
                    setSelectedModeType(opt.key);
                    setPickerModal(null);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{opt.label}</Text>
                  {selectedModeType === opt.key && <Check size={18} color="#007BFF" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL 3: ADMIN PUBLISH RESULTS */}
      <Modal visible={showPublishModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.publishModalCard}>
            <View style={styles.publishModalHeader}>
              <Text style={styles.publishModalTitle}>Publish Official Results</Text>
              <TouchableOpacity onPress={() => setShowPublishModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
              {/* Select Draw */}
              <Text style={styles.inputLabel}>Select Game Draw</Text>
              <View style={styles.drawSelectRow}>
                {drawsList.slice(0, 4).map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.drawPill,
                      publishDrawId === d.id && styles.drawPillActive,
                    ]}
                    onPress={() => setPublishDrawId(d.id)}
                  >
                    <Text
                      style={[
                        styles.drawPillText,
                        publishDrawId === d.id && styles.drawPillTextActive,
                      ]}
                    >
                      {d.game_name} ({d.draw_time})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>1st Prize (3 Digits)*</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 737"
                placeholderTextColor="#94A3B8"
                maxLength={3}
                keyboardType="numeric"
                value={firstPrize}
                onChangeText={setFirstPrize}
              />

              <Text style={styles.inputLabel}>2nd Prize (3 Digits)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 015"
                placeholderTextColor="#94A3B8"
                maxLength={3}
                keyboardType="numeric"
                value={secondPrize}
                onChangeText={setSecondPrize}
              />

              <Text style={styles.inputLabel}>3rd Prize (3 Digits)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 221"
                placeholderTextColor="#94A3B8"
                maxLength={3}
                keyboardType="numeric"
                value={thirdPrize}
                onChangeText={setThirdPrize}
              />

              <Text style={styles.inputLabel}>4th Prize (3 Digits)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 095"
                placeholderTextColor="#94A3B8"
                maxLength={3}
                keyboardType="numeric"
                value={fourthPrize}
                onChangeText={setFourthPrize}
              />

              <Text style={styles.inputLabel}>5th Prize (3 Digits)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 342"
                placeholderTextColor="#94A3B8"
                maxLength={3}
                keyboardType="numeric"
                value={fifthPrize}
                onChangeText={setFifthPrize}
              />

              <Text style={styles.inputLabel}>6th Prizes (Separated by comma or space)</Text>
              <TextInput
                style={[styles.modalInput, { height: 70 }]}
                placeholder="040, 318, 649, 065, 350, 669, 085, 406, 761..."
                placeholderTextColor="#94A3B8"
                multiline
                value={sixthPrizes}
                onChangeText={setSixthPrizes}
              />

              <TouchableOpacity
                style={styles.publishActionBtn}
                activeOpacity={0.85}
                onPress={handlePublish}
                disabled={publishing}
              >
                {publishing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.publishActionBtnText}>Publish & Calculate Winners</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  whatsappIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminPublishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#007BFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  adminPublishBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 12,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  gameDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  gameDropdownText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  dropdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    height: 42,
    paddingHorizontal: 10,
  },
  dropdownBoxText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dateInputContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    height: 42,
    justifyContent: 'center',
  },
  dateInputText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  generateBtn: {
    backgroundColor: '#007BFF',
    height: 42,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  resultsContainer: {
    gap: 12,
  },
  goldenTopCard: {
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  prizeRow: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeRowText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: 1,
  },
  consolationTable: {
    backgroundColor: '#FEF08A',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  consolationRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    height: 38,
  },
  consolationCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: '#FDE68A',
  },
  consolationCellText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  noResultCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  noResultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 12,
  },
  noResultSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  publishModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 380,
  },
  publishModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  publishModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    color: '#0F172A',
  },
  drawSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  drawPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  drawPillActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#007BFF',
  },
  drawPillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  drawPillTextActive: {
    color: '#007BFF',
    fontWeight: '700',
  },
  publishActionBtn: {
    backgroundColor: '#007BFF',
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 10,
  },
  publishActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Tab Switcher Styles
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 10,
    padding: 3,
    maxWidth: 480,
    alignSelf: 'center',
    width: '92%',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#007BFF',
    fontWeight: '700',
  },

  // Result Checking Container Styles
  checkingContainer: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingBottom: 40,
  },
  checkingSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  drawPillsScroll: {
    marginBottom: 16,
  },
  checkingDrawPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    gap: 6,
  },
  checkingDrawPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#007BFF',
  },
  checkingDrawPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  checkingDrawPillTextActive: {
    color: '#007BFF',
    fontWeight: '700',
  },
  resultedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  noCheckCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  noCheckTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
  },
  noCheckSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  checkResultBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  checkResultTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkGameTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  resultedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  resultedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  prizesQuickRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  prizeQuickText: {
    fontSize: 13,
    color: '#475569',
  },
  prizeQuickBold: {
    fontWeight: '800',
    color: '#0F172A',
  },
  pendingResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  pendingSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  enterResultSmallBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  enterResultSmallBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  winnersFoundBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  bannerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  winnersFoundTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },
  winnersFoundSub: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
  },
  bannerStatsRow: {
    flexDirection: 'row',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },
  statCol: {
    flex: 1,
  },
  statColLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  statColVal: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  noWinnersBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  noWinnersTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  noWinnersSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  winnersListSection: {
    marginTop: 8,
  },
  winnersListHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  winnerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  winnerCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  agentBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  positionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  positionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  winnerCardMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  winnerNumBig: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  modePillSmall: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modePillSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  winnerQtyText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  winnerPrizeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  winnerCommText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 1,
  },
  winnerCardBottom: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  winnerBillText: {
    fontSize: 11,
    color: '#94A3B8',
  },
});
